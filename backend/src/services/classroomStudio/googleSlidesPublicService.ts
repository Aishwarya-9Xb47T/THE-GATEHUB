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
      error: 'Invalid Google Slides URL. Expected format: https://docs.google.com/presentation/d/PRESENTATION_ID/edit',
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
  console.info('[Public Google Slides Import] Attempting public download', { presentationId, exportUrl });

  const response = await fetch(exportUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    redirect: 'follow',
  });

  const finalUrl = response.url || '';
  const isLoginPage = finalUrl.includes('accounts.google.com') || finalUrl.includes('ServiceLogin');
  const isUnauthorized = response.status === 401 || response.status === 403;

  if (isLoginPage || isUnauthorized) {
    console.warn('[Public Google Slides Import] Presentation is private', { presentationId, status: response.status });
    return {
      requiresAuthentication: true,
      message: 'This presentation is private. Please connect your Google account or change the sharing settings to "Anyone with the link can view".',
    };
  }

  if (!response.ok) {
    return {
      error: `Could not retrieve Google presentation (HTTP ${response.status}). Verify the URL and sharing settings.`,
    };
  }

  const arrayBuf = await response.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuf);

  if (fileBuffer.length < 100 || !fileBuffer.subarray(0, 2).equals(Buffer.from('PK'))) {
    return {
      requiresAuthentication: true,
      message: 'This presentation requires authentication or is not publicly shared. Please connect your Google account.',
    };
  }

  console.info('[Public Google Slides Import] Downloaded buffer', { bytes: fileBuffer.length });
  return { fileBuffer };
}

export async function importPublicGoogleSlides(input: ImportPublicGoogleSlidesInput): Promise<PublicImportResult> {
  const validation = validateAndExtractGoogleSlidesId(input.url);
  if (!validation.valid || !validation.presentationId) {
    return {
      success: false,
      error: validation.error || 'Invalid Google Slides URL',
    };
  }

  try {
    const download = await downloadPublicGoogleSlidesPptx(validation.presentationId);

    if ('requiresAuthentication' in download) {
      return {
        success: false,
        requiresAuthentication: true,
        message: download.message,
      };
    }

    if ('error' in download) {
      return { success: false, error: download.error };
    }

    const result = await presentationImportService.importPresentation({
      instructorId: input.instructorId,
      title: input.title?.trim() || 'Google Slides Presentation',
      description: input.description,
      sourceType: 'google_slides',
      sourceUrl: input.url.trim(),
      file: download.fileBuffer,
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
      error: error instanceof Error ? error.message : 'Failed to import public Google Slides presentation',
    };
  }
}
