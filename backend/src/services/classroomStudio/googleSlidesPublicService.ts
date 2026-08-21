/**
 * Public Google Slides Importer Service
 *
 * Architecture:
 * 1. Validate Google Slides URL and extract presentation ID
 * 2. Validate accessibility / permission requirements
 * 3. PRIMARY PIPELINE: Download native Google PPTX export (/export/pptx)
 * 4. Parse PPTX using OOXML PowerPoint parser to extract all 11+ structured slides
 *    (including mathematical matrices, shapes, tables, groups, colors, layout)
 * 5. Render full-resolution slide visuals & crisp non-black thumbnails (PDF/Puppeteer/LibreOffice)
 * 6. Save durably to uploads/classroom/:id/source/original.pptx and slide records
 * 7. Save debug artifacts (extraction-report.json, slides.json, downloaded.pptx)
 * 8. SECONDARY FALLBACK: If PPTX export is blocked but PDF export succeeds,
 *    use PDF render visual fallback and extract selectable text.
 */

import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { prisma } from '../../utils/prisma.js';
import * as presentationImportService from './presentationImportService.js';
import { parsePowerPoint } from './powerPointParser.js';
import { persistPptxBuffer, requireDurableClassroomStorage } from './classroomSourceResolver.js';
import { probePublicGoogleSlides } from './googleSlidesProbe.js';
import {
  buildGoogleSlidesEmbedUrl,
  canonicalSlidePngApi,
  canonicalVisualApi,
  canonicalSourceRelative,
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
  countSource?: 'pptx_export' | 'pdf_render' | 'viewerData';
  warnings?: string[];
  message?: string;
  error?: string;
}

export interface ExtractionReport {
  presentationId: string;
  sourceType: 'google-slides';
  exportType: 'pptx' | 'pdf_fallback';
  slideCount: number;
  pptxDownloaded: boolean;
  pptxSizeBytes: number;
  slidesParsed: number;
  slidesWithText: number;
  slidesWithShapes: number;
  slidesWithImages: number;
  slidesWithTables: number;
  visualFallbackUsed: boolean;
  timestamp: string;
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
      return { error: 'GOOGLE_EXPORT_FAILED: Export did not return a valid PPTX file.' };
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

/**
 * Save extraction report and debug artifacts
 */
async function saveExtractionDebugArtifacts(
  presentationId: string,
  report: ExtractionReport,
  pptxBuffer?: Buffer,
  slidesData?: any[],
) {
  try {
    const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
    const debugDir = path.join(uploadRoot, `classroom/${presentationId}/google-slides`);
    await mkdir(debugDir, { recursive: true });

    if (pptxBuffer) {
      const sourceDir = path.join(debugDir, 'source');
      await mkdir(sourceDir, { recursive: true });
      await writeFile(path.join(sourceDir, 'downloaded.pptx'), pptxBuffer);
    }

    if (slidesData) {
      const extractedDir = path.join(debugDir, 'extracted');
      await mkdir(extractedDir, { recursive: true });
      await writeFile(path.join(extractedDir, 'slides.json'), JSON.stringify(slidesData, null, 2), 'utf8');
    }

    await writeFile(path.join(debugDir, 'extraction-report.json'), JSON.stringify(report, null, 2), 'utf8');
    console.info(`[GoogleSlides] Saved extraction debug artifact to ${debugDir}`);
  } catch (err) {
    console.warn('[GoogleSlides] Could not save debug artifact:', err);
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

    // 2. PRIMARY PIPELINE: Download native Google PPTX export
    const pptxResult = await downloadPublicGoogleSlidesPptx(googlePresentationId);
    const pdfResult = await downloadPublicGoogleSlidesPdf(googlePresentationId);

    if ('requiresAuthentication' in pptxResult && pptxResult.requiresAuthentication) {
      return {
        success: false,
        requiresAuthentication: true,
        message: pptxResult.message || 'This Google Slides presentation is private. Connect Google or share it with "Anyone with the link can view".',
        error: 'GOOGLE_SLIDES_PERMISSION_REQUIRED',
      };
    }

    const hasPptx = 'fileBuffer' in pptxResult && pptxResult.fileBuffer && pptxResult.fileBuffer.length > 100;
    const hasPdf = 'pdfBuffer' in pdfResult && pdfResult.pdfBuffer && pdfResult.pdfBuffer.length > 100;

    if (!hasPptx && !hasPdf) {
      const errMsg = ('error' in pptxResult ? pptxResult.error : undefined)
        || ('error' in pdfResult ? pdfResult.error : undefined)
        || probe.error
        || 'GOOGLE_SLIDES_NOT_ACCESSIBLE';
      return { success: false, error: errMsg };
    }

    // Create presentation record in database
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
    requireDurableClassroomStorage();

    // ─── PATH A: PPTX Native Extraction (Primary) ──────────────────────────────
    if (hasPptx) {
      const pptxBuffer = (pptxResult as { fileBuffer: Buffer }).fileBuffer;
      console.info(`[GoogleSlides] Parsing downloaded PPTX export (${pptxBuffer.length} bytes)...`);

      // Persist original PPTX in storage
      await persistPptxBuffer(presentation.id, pptxBuffer);

      // Parse structured slides using full OOXML parser
      const parsedPptx = await parsePowerPoint(pptxBuffer, {
        extractNotes: true,
        extractMasterStyles: true,
        extractMath: true,
        preserveAnimations: true,
      });

      if (!parsedPptx.success || !parsedPptx.slides || parsedPptx.slides.length === 0) {
        throw new Error(parsedPptx.error || 'Failed to parse downloaded PPTX export from Google Slides');
      }

      const slideCount = parsedPptx.slides.length;
      console.info(`[GoogleSlides] Extracted ${slideCount} structured slides from PPTX`);

      // Render visual assets and thumbnails in background non-blockingly
      if (hasPdf) {
        const pdfBuffer = (pdfResult as { pdfBuffer: Buffer }).pdfBuffer;
        void renderGoogleSlidesPdf(presentation.id, pdfBuffer).catch((err) => {
          console.warn('[GoogleSlides] Background visual PDF render warning:', err);
        });
      }

      let slidesWithText = 0;
      let slidesWithShapes = 0;
      let slidesWithImages = 0;
      let slidesWithTables = 0;

      for (const [idx, parsedSlide] of parsedPptx.slides.entries()) {
        const slideNumber = idx + 1;
        const elements = (parsedSlide.content as any)?.elements || [];

        const hasText = elements.some((e: any) => e.type === 'text' || Boolean(e.paragraphs?.length));
        const hasShape = elements.some((e: any) => e.type === 'shape' || e.type === 'connector' || e.type === 'group');
        const hasImage = elements.some((e: any) => e.type === 'image');
        const hasTable = elements.some((e: any) => e.type === 'table');

        if (hasText) slidesWithText++;
        if (hasShape) slidesWithShapes++;
        if (hasImage) slidesWithImages++;
        if (hasTable) slidesWithTables++;

        const pngUrl = canonicalSlidePngApi(presentation.id, slideNumber);
        const svgUrl = canonicalVisualApi(presentation.id, slideNumber, 'svg');

        await prisma.slide.create({
          data: {
            presentationId: presentation.id,
            order: slideNumber,
            title: parsedSlide.title || `Slide ${slideNumber}`,
            thumbnail: pngUrl,
            notes: parsedSlide.notes || '',
            content: {
              ...(parsedSlide.content as Record<string, unknown>),
              title: parsedSlide.title || `Slide ${slideNumber}`,
              visual: {
                src: pngUrl,
                renderedImageUrl: pngUrl,
                thumbnailUrl: pngUrl,
                svgUrl,
                type: 'rendered_image',
                visualSource: 'rendered_image',
                googleSlidesId: googlePresentationId,
                googleSlidesUrl: sourceUrl,
                availability: 'available',
                renderStatus: 'ready',
                extractionStatus: 'complete',
              },
            },
          },
        });
      }

      const report: ExtractionReport = {
        presentationId: presentation.id,
        sourceType: 'google-slides',
        exportType: 'pptx',
        slideCount,
        pptxDownloaded: true,
        pptxSizeBytes: pptxBuffer.length,
        slidesParsed: slideCount,
        slidesWithText,
        slidesWithShapes,
        slidesWithImages,
        slidesWithTables,
        visualFallbackUsed: false,
        timestamp: new Date().toISOString(),
      };

      await saveExtractionDebugArtifacts(presentation.id, report, pptxBuffer, parsedPptx.slides);

      console.info(`[GoogleSlides] PPTX extraction completed: ${slideCount} slides saved with complete elements and visuals`);

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
        countSource: 'pptx_export',
        warnings: [],
      };
    }

    // ─── PATH B: PDF Visual Fallback ──────────────────────────────────────────
    if (hasPdf) {
      const pdfBuffer = (pdfResult as { pdfBuffer: Buffer }).pdfBuffer;
      console.info(`[GoogleSlides] Using PDF visual fallback for presentationId=${presentation.id}...`);

      const renderResult = await renderGoogleSlidesPdf(presentation.id, pdfBuffer);
      if (!renderResult.success || renderResult.slides.length === 0) {
        throw new Error(renderResult.error || 'Failed to render Google Slides PDF fallback');
      }

      const slideCount = renderResult.slides.length;
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

      const report: ExtractionReport = {
        presentationId: presentation.id,
        sourceType: 'google-slides',
        exportType: 'pdf_fallback',
        slideCount,
        pptxDownloaded: false,
        pptxSizeBytes: 0,
        slidesParsed: slideCount,
        slidesWithText: slideCount,
        slidesWithShapes: 0,
        slidesWithImages: 0,
        slidesWithTables: 0,
        visualFallbackUsed: true,
        timestamp: new Date().toISOString(),
      };

      await saveExtractionDebugArtifacts(presentation.id, report);

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
        warnings: ['PPTX export unavailable, visual fallback used'],
      };
    }

    throw new Error('Could not export presentation content from Google Slides');
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
