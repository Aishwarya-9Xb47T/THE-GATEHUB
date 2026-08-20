/**
 * Public Google Slides Importer Service
 * Import publicly accessible Google Slides presentations without requiring OAuth login.
 */

import { prisma } from '../../utils/prisma.js';
import * as presentationImportService from './presentationImportService.js';
import { persistPptxBuffer, requireDurableClassroomStorage } from './classroomSourceResolver.js';
import { startClassroomVisualCache } from './classroomVisualCacheService.js';
import { probePublicGoogleSlides, parseGoogleSlidesProbeHtml } from './googleSlidesProbe.js';

export { parseGoogleSlidesProbeHtml, probePublicGoogleSlides };

export interface ValidationResult {
  valid: boolean;
  presentationId?: string;
  error?: string;
}

export function validateAndExtractGoogleSlidesId(url: string): ValidationResult {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return { valid: false, error: 'Please enter a Google Slides URL' };
  }
  const trimmed = url.trim();

  if (trimmed.includes('drive.google.com/drive/folders') || trimmed.includes('/folders/')) {
    return { valid: false, error: 'This URL points to a Google Drive folder. Please paste a Google Slides presentation URL.' };
  }
  if (trimmed.includes('docs.google.com/document') || trimmed.includes('/document/d/')) {
    return { valid: false, error: 'This URL points to a Google Doc. Please paste a Google Slides presentation URL.' };
  }
  if (trimmed.includes('docs.google.com/spreadsheets') || trimmed.includes('/spreadsheets/d/')) {
    return { valid: false, error: 'This URL points to a Google Sheet. Please paste a Google Slides presentation URL.' };
  }

  const match = trimmed.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/) || trimmed.match(/^([a-zA-Z0-9_-]{20,})$/);
  if (!match || !match[1]) {
    return {
      valid: false,
      error: 'INVALID_URL: Invalid Google Slides URL. Expected format: https://docs.google.com/presentation/d/PRESENTATION_ID/edit',
    };
  }

  return { valid: true, presentationId: match[1] };
}

export interface ImportPublicGoogleSlidesInput {
  instructorId: string;
  url: string;
  title?: string;
  description?: string;
}

export interface PublicImportResult {
  success: boolean;
  requiresAuthentication?: boolean;
  presentationId?: string;
  slidesImported?: number;
  sourceSlideCount?: number;
  warnings?: string[];
  message?: string;
  error?: string;
}

export async function downloadPublicGoogleSlidesPptx(
  presentationId: string,
): Promise<{ fileBuffer: Buffer } | { requiresAuthentication: true; message: string } | { error: string }> {
  const exportUrl = `https://docs.google.com/presentation/d/${presentationId}/export/pptx`;
  console.info('[CLASSROOM_IMPORT] sourceType=GOOGLE_SLIDES stage=PPTX_EXPORT presentationId=' + presentationId);

  const response = await fetch(exportUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    redirect: 'follow',
  });

  const finalUrl = response.url || '';
  const isLoginPage = finalUrl.includes('accounts.google.com') || finalUrl.includes('ServiceLogin');
  if (isLoginPage || response.status === 401 || response.status === 403) {
    return {
      requiresAuthentication: true,
      message: 'SOURCE_PERMISSION_DENIED: This Google Slides presentation is private. Connect Google or share it with "Anyone with the link can view".',
    };
  }
  if (response.status === 404) {
    return { error: 'SOURCE_NOT_FOUND: This Google Slides presentation was not found. It may have been deleted or the URL is invalid.' };
  }
  if (!response.ok) {
    return { error: `GOOGLE_EXPORT_FAILED: Could not export Google Slides (HTTP ${response.status}).` };
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const fileBuffer = Buffer.from(await response.arrayBuffer());
  if (/html|json/.test(contentType) && !/presentationml|pptx|octet-stream|zip/.test(contentType)) {
    return {
      requiresAuthentication: true,
      message: 'SOURCE_PERMISSION_DENIED: Google required a login instead of returning the presentation file.',
    };
  }
  if (fileBuffer.length < 100 || !fileBuffer.subarray(0, 2).equals(Buffer.from('PK'))) {
    if (fileBuffer.subarray(0, 15).toString('utf8').toLowerCase().includes('<!doctype html') || fileBuffer.includes(Buffer.from('accounts.google.com'))) {
      return {
        requiresAuthentication: true,
        message: 'SOURCE_PERMISSION_DENIED: Google required a login instead of returning the presentation file.',
      };
    }
    return { error: 'GOOGLE_EXPORT_FAILED: Export did not return a valid PPTX file. Export may be disabled for this presentation.' };
  }
  console.info('[CLASSROOM_IMPORT] sourceType=GOOGLE_SLIDES pptxBytes=' + fileBuffer.length);
  return { fileBuffer };
}

export async function downloadPublicGoogleSlidesPdf(
  presentationId: string,
): Promise<Buffer | { error: string; requiresAuthentication?: boolean } | null> {
  const exportUrl = `https://docs.google.com/presentation/d/${presentationId}/export/pdf`;
  try {
    const response = await fetch(exportUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    });
    const finalUrl = response.url || '';
    if (finalUrl.includes('accounts.google.com') || finalUrl.includes('ServiceLogin') || response.status === 401 || response.status === 403) {
      return { error: 'SOURCE_PERMISSION_DENIED', requiresAuthentication: true };
    }
    if (response.status === 404) {
      return { error: 'SOURCE_NOT_FOUND: This Google Slides presentation was not found.' };
    }
    if (!response.ok) return null;
    const pdfBuf = Buffer.from(await response.arrayBuffer());
    if (pdfBuf.length > 100 && pdfBuf.subarray(0, 4).equals(Buffer.from('%PDF'))) {
      console.info('[CLASSROOM_IMPORT] sourceType=GOOGLE_SLIDES pdfBytes=' + pdfBuf.length);
      return pdfBuf;
    }
  } catch (err) {
    console.warn('[Public Google Slides Import] Direct PDF fetch failed, fallback to PPTX conversion', err);
  }
  return null;
}

async function enrichPublicGoogleInBackground(args: {
  presentationId: string;
  googlePresentationId: string;
  sourceUrl: string;
}): Promise<void> {
  try {
    const pptxResult = await downloadPublicGoogleSlidesPptx(args.googlePresentationId);
    if (!('fileBuffer' in pptxResult)) return;
    requireDurableClassroomStorage();
    await persistPptxBuffer(args.presentationId, pptxResult.fileBuffer);
    const { inspectPptxArchive } = await import('./pptxArchiveInspect.js');
    const inspection = await inspectPptxArchive(pptxResult.fileBuffer).catch(() => null);
    if (inspection?.slideCount) {
      await presentationImportService.ensureOriginalSourceSlideCount({
        presentationId: args.presentationId,
        slideCount: inspection.slideCount,
        sourceType: 'google_slides',
        visualSource: 'google_embed',
        googleSlidesUrl: args.sourceUrl,
      });
    }
    await presentationImportService.enrichExtractedContentInBackground({
      presentationId: args.presentationId,
      buffer: pptxResult.fileBuffer,
      sourceType: 'google_slides',
      visualSource: 'google_embed',
      googleSlidesUrl: args.sourceUrl,
    });
    void startClassroomVisualCache(args.presentationId);
  } catch (error) {
    console.warn('[CLASSROOM_IMPORT] public_google_background_failed', {
      presentationId: args.presentationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function importPublicGoogleSlides(input: ImportPublicGoogleSlidesInput): Promise<PublicImportResult> {
  const validation = validateAndExtractGoogleSlidesId(input.url);
  if (!validation.valid || !validation.presentationId) {
    return {
      success: false,
      error: validation.error?.includes('INVALID_URL')
        ? validation.error
        : `INVALID_URL: ${validation.error || 'Invalid Google Slides URL'}`,
    };
  }

  try {
    const probe = await probePublicGoogleSlides(validation.presentationId);
    if (probe.requiresAuthentication) {
      return {
        success: false,
        requiresAuthentication: true,
        message: 'This Google Slides presentation is private. Connect Google or share it with "Anyone with the link can view".',
        error: 'GOOGLE_SLIDES_PERMISSION_REQUIRED',
      };
    }
    if (!probe.accessible) {
      return {
        success: false,
        error: probe.error || 'GOOGLE_SLIDES_NOT_ACCESSIBLE',
      };
    }

    const slideCount = Math.max(1, probe.slideCount || 1);
    const presentation = await prisma.presentation.create({
      data: {
        title: input.title?.trim() || 'Google Slides Presentation',
        description: input.description,
        sourceType: 'google_slides',
        sourceUrl: input.url.trim(),
        status: 'ready',
        instructorId: input.instructorId,
      },
    });

    await presentationImportService.createOriginalSourceSlides({
      presentationId: presentation.id,
      slideCount,
      sourceType: 'google_slides',
      visualSource: 'google_embed',
      googleSlidesUrl: input.url.trim(),
    });

    void enrichPublicGoogleInBackground({
      presentationId: presentation.id,
      googlePresentationId: validation.presentationId,
      sourceUrl: input.url.trim(),
    });

    console.info('[Public Google Slides Import] Embed-ready', {
      presentationId: presentation.id,
      slideCount,
    });

    return {
      success: true,
      presentationId: presentation.id,
      slidesImported: slideCount,
      sourceSlideCount: slideCount,
      warnings: probe.slideCount ? [] : ['Slide count was estimated; additional slides may appear after background sync.'],
    };
  } catch (error) {
    console.error('[Public Google Slides Import] Exception during import:', error);
    return {
      success: false,
      error: error instanceof Error
        ? (/GOOGLE_SLIDES_|CLASSROOM_|SOURCE_|GOOGLE_EXPORT/.test(error.message) ? error.message : `GOOGLE_EXPORT_FAILED: ${error.message}`)
        : 'GOOGLE_EXPORT_FAILED: Failed to import public Google Slides presentation',
    };
  }
}
