/**
 * Public Google Slides Importer Service
 * Import publicly accessible Google Slides presentations without requiring OAuth login.
 */

import { prisma } from '../../utils/prisma.js';
import * as presentationImportService from './presentationImportService.js';
import { persistPptxBuffer, requireDurableClassroomStorage } from './classroomSourceResolver.js';
import { probePublicGoogleSlides } from './googleSlidesProbe.js';
import {
  buildGoogleSlidesEmbedUrl,
  isGoogleEmbedVisual,
  mergeExtractedSlideVisual,
  readSlideVisual,
} from './classroomAssetPath.js';
import { inspectPptxArchive } from './pptxArchiveInspect.js';

export { parseGoogleSlidesProbeHtml, parseReliableGoogleSlideCount, probePublicGoogleSlides } from './googleSlidesProbe.js';

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
  slideCount?: number;
  sourceSlideCount?: number;
  sourceType?: 'google_slides';
  sourceUrl?: string;
  embedUrl?: string;
  overallStatus?: 'ready';
  visualStatus?: 'ready';
  extractionStatus?: 'pending' | 'complete' | 'failed';
  countSource?: 'viewerData' | 'slideCount' | 'pptx_zip';
  warnings?: string[];
  message?: string;
  error?: string;
}

export async function downloadPublicGoogleSlidesPptx(
  presentationId: string,
): Promise<{ fileBuffer: Buffer } | { requiresAuthentication: true; message: string } | { error: string }> {
  const exportUrl = `https://docs.google.com/presentation/d/${presentationId}/export/pptx`;
  console.info('[CLASSROOM_IMPORT] sourceType=GOOGLE_SLIDES stage=OPTIONAL_PPTX_EXTRACT presentationId=' + presentationId);

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

async function setGoogleEmbedExtractionStatus(
  presentationId: string,
  extractionStatus: 'pending' | 'complete' | 'failed',
): Promise<void> {
  const slides = await prisma.slide.findMany({
    where: { presentationId },
    select: { id: true, content: true, order: true },
  });
  for (const slide of slides) {
    const existing = readSlideVisual(slide.content);
    if (!isGoogleEmbedVisual(existing)) continue;
    const content = slide.content && typeof slide.content === 'object' && !Array.isArray(slide.content)
      ? { ...(slide.content as Record<string, unknown>) }
      : {};
    content.visual = mergeExtractedSlideVisual(existing, {
      ...existing,
      slideIndex: (existing?.slideIndex ?? slide.order - 1),
      extractionStatus,
    });
    await prisma.slide.update({
      where: { id: slide.id },
      data: { content },
    });
  }
}

async function keepPublicGoogleReady(presentationId: string): Promise<void> {
  await prisma.presentation.update({
    where: { id: presentationId },
    data: { status: 'ready' },
  }).catch(() => undefined);
}

async function enrichPublicGoogleInBackground(args: {
  presentationId: string;
  googlePresentationId: string;
  sourceUrl: string;
  fileBuffer?: Buffer;
}): Promise<void> {
  try {
    let buffer = args.fileBuffer;
    if (!buffer) {
      const pptxResult = await downloadPublicGoogleSlidesPptx(args.googlePresentationId);
      if (!('fileBuffer' in pptxResult)) {
        console.warn('[CLASSROOM_IMPORT] public_google_extraction_failed', {
          presentationId: args.presentationId,
          reason: 'error' in pptxResult ? pptxResult.error : 'requiresAuthentication',
        });
        await setGoogleEmbedExtractionStatus(args.presentationId, 'failed');
        await keepPublicGoogleReady(args.presentationId);
        return;
      }
      buffer = pptxResult.fileBuffer;
    }
    requireDurableClassroomStorage();
    await persistPptxBuffer(args.presentationId, buffer);
    await presentationImportService.enrichExtractedContentInBackground({
      presentationId: args.presentationId,
      buffer,
      sourceType: 'google_slides',
      visualSource: 'google_embed',
      googleSlidesUrl: args.sourceUrl,
    });
    const slides = await prisma.slide.findMany({
      where: { presentationId: args.presentationId },
      select: { content: true },
    });
    const completed = slides.some((slide) => readSlideVisual(slide.content)?.extractionStatus === 'complete');
    if (!completed) {
      await setGoogleEmbedExtractionStatus(args.presentationId, 'failed');
    }
    await keepPublicGoogleReady(args.presentationId);
  } catch (error) {
    console.warn('[CLASSROOM_IMPORT] public_google_background_failed', {
      presentationId: args.presentationId,
      error: error instanceof Error ? error.message : String(error),
    });
    await setGoogleEmbedExtractionStatus(args.presentationId, 'failed').catch(() => undefined);
    await keepPublicGoogleReady(args.presentationId);
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

  const googlePresentationId = validation.presentationId;
  const sourceUrl = input.url.trim();
  const embedUrl = buildGoogleSlidesEmbedUrl(googlePresentationId, 1);

  try {
    const probe = await probePublicGoogleSlides(googlePresentationId);
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

    let slideCount = probe.slideCount && probe.slideCount > 0 ? probe.slideCount : 0;
    let countSource: 'viewerData' | 'slideCount' | 'pptx_zip' = probe.countSource || 'viewerData';
    let countBuffer: Buffer | undefined;
    if (!slideCount) {
      const pptxResult = await downloadPublicGoogleSlidesPptx(googlePresentationId);
      if ('fileBuffer' in pptxResult) {
        const inspection = await inspectPptxArchive(pptxResult.fileBuffer);
        slideCount = inspection.slideCount;
        countSource = 'pptx_zip';
        countBuffer = pptxResult.fileBuffer;
      } else {
        console.warn('[CLASSROOM_IMPORT] public_google_count_pptx_unavailable', {
          googlePresentationId,
          reason: 'error' in pptxResult ? pptxResult.error : 'export_login_wall',
        });
      }
    } else {
      console.info('[CLASSROOM_IMPORT] public_google_slide_count', {
        googlePresentationId,
        slideCount,
        countSource,
      });
    }
    if (!slideCount) {
      return {
        success: false,
        error: 'GOOGLE_SLIDES_IMPORT_FAILED: Could not determine the number of slides in this presentation.',
      };
    }

    const presentation = await prisma.presentation.create({
      data: {
        title: input.title?.trim() || 'Google Slides Presentation',
        description: input.description,
        sourceType: 'google_slides',
        sourceUrl,
        status: 'ready',
        instructorId: input.instructorId,
      },
    });

    await presentationImportService.createOriginalSourceSlides({
      presentationId: presentation.id,
      slideCount,
      sourceType: 'google_slides',
      visualSource: 'google_embed',
      googleSlidesUrl: sourceUrl,
    });

    void enrichPublicGoogleInBackground({
      presentationId: presentation.id,
      googlePresentationId,
      sourceUrl,
      fileBuffer: countBuffer,
    });

    console.info('[Public Google Slides Import] Embed-ready', {
      presentationId: presentation.id,
      googlePresentationId,
      slideCount,
      countSource,
      embedUrl,
      visualStatus: 'ready',
      extractionStatus: 'pending',
    });

    return {
      success: true,
      presentationId: presentation.id,
      slidesImported: slideCount,
      slideCount,
      sourceSlideCount: slideCount,
      sourceType: 'google_slides',
      sourceUrl,
      embedUrl,
      overallStatus: 'ready',
      visualStatus: 'ready',
      extractionStatus: 'pending',
      warnings: countSource === 'pptx_zip'
        ? ['Slide count was read from the exported PPTX archive; the live Google embed is still the visual source.']
        : [],
    };
  } catch (error) {
    console.error('[Public Google Slides Import] Exception during import:', error);
    const message = error instanceof Error ? error.message : 'Failed to import public Google Slides presentation';
    if (/GOOGLE_SLIDES_PERMISSION_REQUIRED|SOURCE_PERMISSION_DENIED/i.test(message)) {
      return { success: false, requiresAuthentication: true, error: 'GOOGLE_SLIDES_PERMISSION_REQUIRED', message };
    }
    if (/GOOGLE_SLIDES_NOT_ACCESSIBLE|SOURCE_NOT_FOUND/i.test(message)) {
      return { success: false, error: 'GOOGLE_SLIDES_NOT_ACCESSIBLE' };
    }
    return {
      success: false,
      error: /GOOGLE_SLIDES_|INVALID_URL|GOOGLE_SLIDES_IMPORT_FAILED/.test(message)
        ? message
        : `GOOGLE_SLIDES_IMPORT_FAILED: ${message}`,
    };
  }
}
