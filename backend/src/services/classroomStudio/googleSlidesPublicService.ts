/**
 * Public Google Slides Importer Service
 * Dedicated pipeline for importing publicly accessible Google Slides presentations
 * with 100% visual fidelity, crisp thumbnails, and complete equation/shape preservation.
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
import { renderGoogleSlidesPdf, isImageBlackOrBlank } from './googleSlidesRenderEngine.js';

export { parseGoogleSlidesProbeHtml, parseReliableGoogleSlideCount, probePublicGoogleSlides } from './googleSlidesProbe.js';

export interface ValidationResult {
  valid: boolean;
  presentationId?: string;
  isPublished?: boolean;
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

  // Published deck format: /presentation/d/e/PUB_ID/pub or /embed
  const pubMatch = trimmed.match(/\/presentation\/d\/e\/([a-zA-Z0-9_-]+)/);
  if (pubMatch?.[1]) {
    return { valid: true, presentationId: pubMatch[1], isPublished: true };
  }

  // Standard format: /presentation/d/PRESENTATION_ID/...
  const match = trimmed.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (match?.[1] && match[1] !== 'e') {
    return { valid: true, presentationId: match[1] };
  }

  // Drive file format: /file/d/PRESENTATION_ID/...
  const driveMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch?.[1]) {
    return { valid: true, presentationId: driveMatch[1] };
  }

  // Bare ID format
  const bareMatch = trimmed.match(/^([a-zA-Z0-9_-]{20,})$/);
  if (bareMatch?.[1]) {
    return { valid: true, presentationId: bareMatch[1] };
  }

  return {
    valid: false,
    error: 'INVALID_URL: Invalid Google Slides URL. Expected format: https://docs.google.com/presentation/d/PRESENTATION_ID/edit',
  };
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
  countSource?: 'viewerData' | 'slideCount' | 'pdf_render' | 'pptx_zip';
  warnings?: string[];
  message?: string;
  error?: string;
}

export async function downloadPublicGoogleSlidesPptx(
  presentationId: string,
): Promise<{ fileBuffer: Buffer } | { requiresAuthentication: true; message: string } | { error: string }> {
  const exportUrl = `https://docs.google.com/presentation/d/${presentationId}/export/pptx`;
  console.info(`[GoogleSlides] Downloading PPTX from ${exportUrl}...`);

  try {
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
    console.info(`[GoogleSlides] PPTX download successful: ${fileBuffer.length} bytes`);
    return { fileBuffer };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('[GoogleSlides] PPTX download exception:', msg);
    return { error: `GOOGLE_EXPORT_FAILED: ${msg}` };
  }
}

export async function downloadPublicGoogleSlidesPdf(
  presentationId: string,
): Promise<{ pdfBuffer: Buffer } | { requiresAuthentication: true; message: string } | { error: string }> {
  const exportUrl = `https://docs.google.com/presentation/d/${presentationId}/export/pdf`;
  console.info(`[GoogleSlides] Downloading PDF from ${exportUrl}...`);

  try {
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
      return { error: 'SOURCE_NOT_FOUND: This Google Slides presentation was not found.' };
    }
    if (!response.ok) {
      return { error: `GOOGLE_EXPORT_FAILED: HTTP ${response.status}` };
    }

    const pdfBuffer = Buffer.from(await response.arrayBuffer());
    if (pdfBuffer.length > 100 && pdfBuffer.subarray(0, 4).equals(Buffer.from('%PDF'))) {
      console.info(`[GoogleSlides] PDF download successful: ${pdfBuffer.length} bytes`);
      return { pdfBuffer };
    }

    if (pdfBuffer.subarray(0, 15).toString('utf8').toLowerCase().includes('<!doctype html') || pdfBuffer.includes(Buffer.from('accounts.google.com'))) {
      return {
        requiresAuthentication: true,
        message: 'SOURCE_PERMISSION_DENIED: Google required a login instead of returning the PDF file.',
      };
    }

    return { error: 'GOOGLE_EXPORT_FAILED: Invalid PDF file returned from Google Slides.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[GoogleSlides] PDF fetch exception:', msg);
    return { error: `GOOGLE_EXPORT_FAILED: ${msg}` };
  }
}

export async function importPublicGoogleSlides(input: ImportPublicGoogleSlidesInput): Promise<PublicImportResult> {
  console.info(`[GoogleSlides] URL received: ${input.url}`);
  const validation = validateAndExtractGoogleSlidesId(input.url);
  if (!validation.valid || !validation.presentationId) {
    console.warn(`[GoogleSlides][ERROR] Invalid URL: ${input.url}`);
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
  console.info(`[GoogleSlides] Presentation ID detected: ${googlePresentationId}`);

  try {
    // 1. Validate accessibility and permissions
    console.info(`[GoogleSlides] Validating access for ${googlePresentationId}...`);
    const probe = await probePublicGoogleSlides(googlePresentationId);
    if (probe.requiresAuthentication) {
      console.warn(`[GoogleSlides][AUTH_REQUIRED] Presentation ${googlePresentationId} requires authentication`);
      return {
        success: false,
        requiresAuthentication: true,
        message: 'This Google Slides presentation is private. Connect Google or share it with "Anyone with the link can view".',
        error: 'GOOGLE_SLIDES_PERMISSION_REQUIRED',
      };
    }

    // 2. Fetch Google's native vector/raster PDF export as Primary Source of Truth
    const pdfResult = await downloadPublicGoogleSlidesPdf(googlePresentationId);
    if ('requiresAuthentication' in pdfResult && pdfResult.requiresAuthentication) {
      return {
        success: false,
        requiresAuthentication: true,
        message: pdfResult.message || 'This Google Slides presentation is private. Connect Google or share it with "Anyone with the link can view".',
        error: 'GOOGLE_SLIDES_PERMISSION_REQUIRED',
      };
    }

    if ('error' in pdfResult && !probe.accessible) {
      return {
        success: false,
        error: probe.error || pdfResult.error || 'GOOGLE_SLIDES_NOT_ACCESSIBLE',
      };
    }

    // 3. Create the presentation record
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

    console.info(`[GoogleSlides] Created presentation record: id=${presentation.id}`);

    // 4. Dedicated High-Fidelity Rendering:
    // If PDF export succeeded, render all slides into crisp 1080p PNGs & thumbnails
    if ('pdfBuffer' in pdfResult && pdfResult.pdfBuffer) {
      console.info(`[GoogleSlides] Rendering PDF export for presentationId=${presentation.id}...`);
      const renderResult = await renderGoogleSlidesPdf(presentation.id, pdfResult.pdfBuffer);

      if (renderResult.success && renderResult.slides.length > 0) {
        const slideCount = renderResult.slides.length;
        console.info(`[GoogleSlides] High-fidelity render complete. Creating ${slideCount} slide records...`);

        for (const slide of renderResult.slides) {
          await prisma.slide.create({
            data: {
              presentationId: presentation.id,
              order: slide.slideNumber,
              title: slide.title,
              thumbnail: slide.thumbUrl,
              content: {
                version: 2,
                format: 'rendered_image',
                title: slide.title,
                text: slide.paragraphs,
                paragraphs: slide.paragraphs.map((p) => ({ text: p })),
                visual: {
                  src: slide.pngUrl,
                  renderedImageUrl: slide.pngUrl,
                  thumbnailUrl: slide.thumbUrl,
                  svgUrl: slide.svgUrl,
                  type: 'rendered_image',
                  visualSource: 'rendered_image',
                  googleSlidesId: googlePresentationId,
                  googleSlidesUrl: sourceUrl,
                  width: slide.width,
                  height: slide.height,
                  aspectRatio: slide.aspectRatio,
                  availability: 'available',
                  renderStatus: 'ready',
                  extractionStatus: 'complete',
                },
                elements: [],
              },
            },
          });
        }

        // Also fetch PPTX in background to store original PPTX and enrich notes if available
        void (async () => {
          try {
            const pptxRes = await downloadPublicGoogleSlidesPptx(googlePresentationId);
            if ('fileBuffer' in pptxRes) {
              await persistPptxBuffer(presentation.id, pptxRes.fileBuffer);
            }
          } catch {
            // Non-critical background task
          }
        })();

        console.info(`[GoogleSlides] Extraction completed successfully: ${slideCount} slides rendered without black frames`);

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
          extractionStatus: 'complete',
          countSource: 'pdf_render',
          warnings: [],
        };
      }
    }

    // 5. Fallback: If PDF was not available but PPTX or Probe succeeded
    const googleCount = probe.slideCount && probe.slideCount > 0 ? probe.slideCount : 0;
    let pptxCount = 0;
    let countBuffer: Buffer | undefined;

    try {
      const pptxResult = await downloadPublicGoogleSlidesPptx(googlePresentationId);
      if ('fileBuffer' in pptxResult) {
        const inspection = await inspectPptxArchive(pptxResult.fileBuffer);
        pptxCount = inspection.slideCount || 0;
        countBuffer = pptxResult.fileBuffer;
        await persistPptxBuffer(presentation.id, countBuffer);
      }
    } catch {
      // Ignored
    }

    const slideCount = Math.max(googleCount, pptxCount, 1);
    await presentationImportService.createOriginalSourceSlides({
      presentationId: presentation.id,
      slideCount,
      sourceType: 'google_slides',
      visualSource: 'google_embed',
      googleSlidesUrl: sourceUrl,
    });

    console.info(`[GoogleSlides] Fallback embed slides created: count=${slideCount}`);

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
      countSource: probe.countSource || 'viewerData',
    };
  } catch (error) {
    console.error('[GoogleSlides][ERROR] Exception during import:', error);
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
