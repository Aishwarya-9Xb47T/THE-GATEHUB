/**
 * Public Google Slides Importer Service
 * Import publicly accessible Google Slides presentations without requiring OAuth login.
 */

import * as presentationImportService from './presentationImportService.js';

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

  const fileBuffer = Buffer.from(await response.arrayBuffer());
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
    const pptxResult = await downloadPublicGoogleSlidesPptx(validation.presentationId);

    if ('requiresAuthentication' in pptxResult) {
      return {
        success: false,
        requiresAuthentication: true,
        message: pptxResult.message,
        error: 'GOOGLE_SLIDES_PERMISSION_REQUIRED',
      };
    }
    if ('error' in pptxResult) {
      return {
        success: false,
        error: pptxResult.error.startsWith('SOURCE_NOT_FOUND')
          ? `GOOGLE_SLIDES_NOT_ACCESSIBLE: ${pptxResult.error}`
          : pptxResult.error,
      };
    }

    const result = await presentationImportService.importPresentation({
      instructorId: input.instructorId,
      title: input.title?.trim() || 'Google Slides Presentation',
      description: input.description,
      sourceType: 'google_slides',
      sourceUrl: input.url.trim(),
      file: pptxResult.fileBuffer,
      options: {
        extractNotes: true,
        generateThumbnails: false,
        preserveAnimations: true,
      },
    });

    console.info('[Public Google Slides Import] Import complete', result);

    return {
      success: true,
      presentationId: result.presentationId,
      slidesImported: result.slideCount,
      sourceSlideCount: result.sourceSlideCount,
      warnings: result.warnings,
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
