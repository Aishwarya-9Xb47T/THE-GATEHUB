/**
 * Canonical classroom visual pipeline.
 *
 *   SOURCE PRESENTATION (original PPTX bytes or Google export)
 *           ↓
 *   CANONICAL PDF (persisted)
 *           ↓
 *   PDF VALIDATION (pdfinfo + page count)
 *           ↓
 *   ONE PNG PER PDF PAGE (persisted)
 *           ↓
 *   slide.renderedImageUrl
 *
 * Structured OOXML extraction is a separate responsibility and is never the visual source.
 */
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  assertRenderablePng,
  convertOriginalPptxToCanonicalPdf,
  describeLibreOfficeTools,
  rasterizePdfPagesToPng,
  readCanonicalPdfMetadata,
  sha256Hex,
} from './presentationLibreOfficeRender.js';
import { inspectPptxArchive, validatePptxSource } from './pptxArchiveInspect.js';
import { classroomPptxPipelineLog } from './classroomPipelineLog.js';

export const CLASSROOM_RENDERER_VERSION = 'source-pdf-png-v1';
export const CLASSROOM_PNG_DPI = 200;

export type ClassroomRenderErrorCode =
  | 'SOURCE_INVALID'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_PERMISSION_DENIED'
  | 'GOOGLE_EXPORT_FAILED'
  | 'PPTX_CONVERSION_FAILED'
  | 'PDF_GENERATION_FAILED'
  | 'PDF_PAGE_COUNT_MISMATCH'
  | 'IMAGE_RENDER_FAILED'
  | 'IMAGE_STORAGE_FAILED'
  | 'IMAGE_LOAD_FAILED';

export type PresentationRenderProviderId = 'libreoffice-pdf' | 'cloud-document';

export type CanonicalPdf = {
  buffer: Buffer;
  bytes: number;
  pageCount: number;
  text: string;
  provider: PresentationRenderProviderId;
};

export type SlidePng = {
  page: number;
  buffer: Buffer;
  bytes: number;
  width: number;
  height: number;
};

export type PresentationRendererResult = {
  success: boolean;
  provider: PresentationRenderProviderId;
  pdf: CanonicalPdf | null;
  images: SlidePng[];
  expectedPages: number;
  actualPages: number;
  errors: string[];
  warnings: string[];
  sourceHash: string;
  rendererVersion: string;
};

export type PresentationRenderSource = {
  presentationId?: string;
  pptxBuffer: Buffer;
  pdfBuffer?: Buffer;
  expectedSlideCount?: number;
  pages?: number[];
  sourceHash?: string;
};

export interface PresentationRenderProvider {
  id: PresentationRenderProviderId;
  available(): boolean;
  renderPptxToPdf(sourcePath: string, workDir: string, presentationId?: string): Promise<CanonicalPdf>;
  renderPdfToImages(pdfPath: string, pages: number[], outputDir: string): Promise<SlidePng[]>;
}

function classroomImportLog(fields: Record<string, string | number | boolean | undefined | null>) {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value.replace(/\s+/g, ' ').slice(0, 400) : value}`);
  console.info(`[CLASSROOM_IMPORT] ${parts.join(' ')}`);
}

function classroomRenderLog(fields: Record<string, string | number | boolean | undefined | null>) {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value.replace(/\s+/g, ' ').slice(0, 4000) : value}`);
  console.info(`[CLASSROOM_RENDER] ${parts.join(' ')}`);
}

export function classifyClassroomRenderError(error: unknown): ClassroomRenderErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: string }).code || '')
    : '';
  const haystack = `${code} ${message}`;
  if (/SOURCE_INVALID|PPTX_INVALID|not a ZIP|missing \[Content_Types\]|missing ppt\/presentation/i.test(haystack)) {
    return 'SOURCE_INVALID';
  }
  if (/SOURCE_NOT_FOUND|SOURCE_DOWNLOAD/i.test(haystack)) return 'SOURCE_NOT_FOUND';
  if (/PERMISSION|unauthorized|private|ServiceLogin/i.test(haystack)) return 'SOURCE_PERMISSION_DENIED';
  if (/GOOGLE_EXPORT|GOOGLE_SLIDES/i.test(haystack)) return 'GOOGLE_EXPORT_FAILED';
  if (/PAGE_COUNT_MISMATCH/i.test(haystack)) return 'PDF_PAGE_COUNT_MISMATCH';
  if (/LIBREOFFICE|PPTX_TO_PDF|CONVERSION_FAILED/i.test(haystack)) return 'PPTX_CONVERSION_FAILED';
  if (/PDF_GENERATION|invalid PDF|page count could not/i.test(haystack)) return 'PDF_GENERATION_FAILED';
  if (/B2_|STORAGE|UPLOAD/i.test(haystack)) return 'IMAGE_STORAGE_FAILED';
  if (/IMAGE_LOAD/i.test(haystack)) return 'IMAGE_LOAD_FAILED';
  return 'IMAGE_RENDER_FAILED';
}

export class LibreOfficePresentationRenderer implements PresentationRenderProvider {
  id: PresentationRenderProviderId = 'libreoffice-pdf';

  available(): boolean {
    const tools = describeLibreOfficeTools();
    return Boolean(tools.soffice && (tools.pdftocairo || tools.pdftoppm));
  }

  async renderPptxToPdf(sourcePath: string, workDir: string, presentationId?: string): Promise<CanonicalPdf> {
    const converted = await convertOriginalPptxToCanonicalPdf({
      pptxPath: sourcePath,
      workDir,
      presentationId,
    });
    return {
      buffer: converted.pdfBuffer,
      bytes: converted.pdfBytes,
      pageCount: converted.pageCount,
      text: converted.pdfText,
      provider: this.id,
    };
  }

  async renderPdfToImages(pdfPath: string, pages: number[], outputDir: string): Promise<SlidePng[]> {
    return rasterizePdfPagesToPng({
      pdfPath,
      pages,
      outputDir,
      dpi: CLASSROOM_PNG_DPI,
    });
  }
}

/**
 * Reserved for a future cloud conversion provider.
 * Do not instantiate a paid API unless project credentials already exist.
 */
export class CloudDocumentPresentationRenderer implements PresentationRenderProvider {
  id: PresentationRenderProviderId = 'cloud-document';

  available(): boolean {
    const endpoint = process.env.CLASSROOM_CLOUD_RENDER_URL?.trim();
    const key = process.env.CLASSROOM_CLOUD_RENDER_KEY?.trim();
    return Boolean(endpoint && key);
  }

  async renderPptxToPdf(): Promise<CanonicalPdf> {
    throw Object.assign(new Error('Cloud document renderer is not configured'), {
      code: 'PPTX_CONVERSION_FAILED',
    });
  }

  async renderPdfToImages(): Promise<SlidePng[]> {
    throw Object.assign(new Error('Cloud document renderer is not configured'), {
      code: 'IMAGE_RENDER_FAILED',
    });
  }
}

export function getPresentationRenderProviders(): PresentationRenderProvider[] {
  return [new LibreOfficePresentationRenderer(), new CloudDocumentPresentationRenderer()].filter((provider) =>
    provider.available(),
  );
}

function taggedError(code: ClassroomRenderErrorCode, message: string): Error {
  const error = new Error(`${code} ${message}`);
  (error as Error & { code?: string }).code = code;
  return error;
}

export async function renderPptxToPdf(sourcePath: string, workDir: string, presentationId?: string): Promise<CanonicalPdf> {
  const providers = getPresentationRenderProviders();
  if (!providers.length) {
    throw taggedError('PPTX_CONVERSION_FAILED', 'No presentation renderer is available (LibreOffice/poppler missing)');
  }
  let lastError: unknown;
  for (const provider of providers) {
    try {
      classroomRenderLog({
        presentationId,
        sourceType: 'PPTX',
        renderer: provider.id,
        sourcePath,
        stage: 'PPTX_TO_PDF',
      });
      return await provider.renderPptxToPdf(sourcePath, workDir, presentationId);
    } catch (error) {
      lastError = error;
      console.error('[CLASSROOM_RENDER_ERROR]', {
        presentationId,
        stage: 'PPTX_TO_PDF',
        renderer: provider.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  throw lastError instanceof Error ? lastError : taggedError('PPTX_CONVERSION_FAILED', String(lastError));
}

export async function renderPdfToImages(pdfPath: string, pages: number[], outputDir: string): Promise<SlidePng[]> {
  const providers = getPresentationRenderProviders();
  if (!providers.length) {
    throw taggedError('IMAGE_RENDER_FAILED', 'No PDF rasterizer is available (pdftocairo/pdftoppm missing)');
  }
  let lastError: unknown;
  for (const provider of providers) {
    try {
      return await provider.renderPdfToImages(pdfPath, pages, outputDir);
    } catch (error) {
      lastError = error;
      console.error('[CLASSROOM_RENDER_ERROR]', {
        stage: 'PDF_TO_PNG',
        renderer: provider.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  throw lastError instanceof Error ? lastError : taggedError('IMAGE_RENDER_FAILED', String(lastError));
}

export async function renderPresentation(source: PresentationRenderSource): Promise<PresentationRendererResult> {
  const presentationId = source.presentationId;
  const warnings: string[] = [];
  const errors: string[] = [];
  const sourceHash = source.sourceHash || sha256Hex(source.pptxBuffer);
  const jobId = randomUUID();
  const workDir = path.join(os.tmpdir(), 'classroom-render', presentationId || 'anon', jobId);
  const outputDir = path.join(workDir, 'png');
  await mkdir(outputDir, { recursive: true });

  classroomImportLog({
    sourceType: 'PPTX',
    presentationId,
    sourceSize: source.pptxBuffer.length,
    sourceHash,
    rendererVersion: CLASSROOM_RENDERER_VERSION,
  });

  try {
    const validation = await validatePptxSource(source.pptxBuffer);
    classroomImportLog({
      presentationId,
      pptxValid: validation.valid,
      expectedSlideCount: source.expectedSlideCount ?? validation.slideCount,
      zipValid: validation.zipValid,
      hasContentTypes: validation.hasContentTypes,
      hasPresentationXml: validation.hasPresentationXml,
    });
    if (!source.pdfBuffer && !validation.valid) {
      errors.push(`SOURCE_INVALID ${validation.reasons.join('; ')}`);
      return {
        success: false,
        provider: 'libreoffice-pdf',
        pdf: null,
        images: [],
        expectedPages: source.expectedSlideCount ?? 0,
        actualPages: 0,
        errors,
        warnings,
        sourceHash,
        rendererVersion: CLASSROOM_RENDERER_VERSION,
      };
    }

    const archive = validation.inspection ?? (await inspectPptxArchive(source.pptxBuffer).catch(() => null));
    const expectedPages = source.expectedSlideCount && source.expectedSlideCount > 0
      ? source.expectedSlideCount
      : archive?.slideCount && archive.slideCount > 0
        ? archive.slideCount
        : 0;
    classroomImportLog({ presentationId, expectedSlideCount: expectedPages });

    let pdf: CanonicalPdf | null = null;
    const pdfPath = path.join(workDir, 'canonical.pdf');
    if (source.pdfBuffer && source.pdfBuffer.length > 100 && source.pdfBuffer.subarray(0, 4).equals(Buffer.from('%PDF'))) {
      await mkdir(workDir, { recursive: true });
      await writeFile(pdfPath, source.pdfBuffer);
      const meta = await readCanonicalPdfMetadata(pdfPath, workDir);
      pdf = {
        buffer: meta.pdfBuffer,
        bytes: meta.pdfBytes,
        pageCount: meta.pageCount,
        text: meta.pdfText,
        provider: 'libreoffice-pdf',
      };
      classroomRenderLog({
        presentationId,
        pdfPath,
        pdfGenerated: true,
        pdfSource: 'provided-canonical-pdf',
        expectedPages,
        actualPages: pdf.pageCount,
      });
    } else {
      const pptxPath = path.join(workDir, 'original.pptx');
      await mkdir(workDir, { recursive: true });
      await writeFile(pptxPath, source.pptxBuffer);
      const written = await readFile(pptxPath);
      if (sha256Hex(written) !== sourceHash) {
        errors.push('SOURCE_INVALID written PPTX hash does not match source');
        return {
          success: false,
          provider: 'libreoffice-pdf',
          pdf: null,
          images: [],
          expectedPages,
          actualPages: 0,
          errors,
          warnings,
          sourceHash,
          rendererVersion: CLASSROOM_RENDERER_VERSION,
        };
      }
      classroomRenderLog({
        presentationId,
        sourceType: 'PPTX',
        renderer: 'libreoffice',
        sourcePath: pptxPath,
      });
      pdf = await renderPptxToPdf(pptxPath, workDir, presentationId);
      await writeFile(pdfPath, pdf.buffer);
      classroomRenderLog({
        presentationId,
        pdfPath,
        pdfGenerated: true,
        expectedPages,
        actualPages: pdf.pageCount,
      });
    }

    if (!pdf || pdf.pageCount < 1) {
      errors.push('PDF_GENERATION_FAILED canonical PDF is missing or has zero pages');
      return {
        success: false,
        provider: pdf?.provider || 'libreoffice-pdf',
        pdf,
        images: [],
        expectedPages,
        actualPages: pdf?.pageCount ?? 0,
        errors,
        warnings,
        sourceHash,
        rendererVersion: CLASSROOM_RENDERER_VERSION,
      };
    }

    if (expectedPages > 0 && expectedPages !== pdf.pageCount) {
      const message = `PDF_PAGE_COUNT_MISMATCH expected=${expectedPages} actualPages=${pdf.pageCount}`;
      errors.push(message);
      classroomRenderLog({
        presentationId,
        expectedPages,
        actualPages: pdf.pageCount,
        status: 'failure',
      });
    } else {
      classroomRenderLog({
        presentationId,
        expectedPages: expectedPages || pdf.pageCount,
        actualPages: pdf.pageCount,
      });
    }

    const requested = source.pages?.filter((page) => page >= 1 && page <= pdf.pageCount)
      ?? Array.from({ length: pdf.pageCount }, (_, index) => index + 1);
    requested.sort((a, b) => a - b);
    if (requested[0] !== 1 && requested.includes(1)) {
      requested.splice(requested.indexOf(1), 1);
      requested.unshift(1);
    }

    const images: SlidePng[] = [];
    for (const page of requested) {
      try {
        const rendered = await renderPdfToImages(pdfPath, [page], outputDir);
        const image = rendered[0];
        if (!image) throw taggedError('IMAGE_RENDER_FAILED', `page=${page} produced no PNG`);
        const dims = assertRenderablePng(image.buffer);
        images.push({ ...image, width: dims.width, height: dims.height });
        classroomPptxPipelineLog('slide_png', {
          presentationId,
          slideNumber: page,
          pngBytes: image.bytes,
        });
        console.info('[CLASSROOM_RENDER_SLIDE]', {
          slide: page,
          pngGenerated: true,
          pngSize: image.bytes,
          width: dims.width,
          height: dims.height,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`IMAGE_RENDER_FAILED slide=${page} ${message.slice(0, 400)}`);
        console.error('[CLASSROOM_RENDER_ERROR]', {
          presentationId,
          slide: page,
          stage: 'PDF_TO_PNG',
          error: message.slice(0, 800),
        });
      }
    }

    const success = errors.length === 0 && images.length === requested.length && requested.length > 0;
    console.info('[CLASSROOM_RENDER_COMPLETE]', {
      presentationId,
      slidesReady: images.length,
      expectedPages: expectedPages || pdf.pageCount,
      actualPages: pdf.pageCount,
      success,
    });
    return {
      success,
      provider: pdf.provider,
      pdf,
      images,
      expectedPages: expectedPages || pdf.pageCount,
      actualPages: pdf.pageCount,
      errors,
      warnings,
      sourceHash,
      rendererVersion: CLASSROOM_RENDERER_VERSION,
    };
  } catch (error) {
    const code = classifyClassroomRenderError(error);
    const message = error instanceof Error ? error.message : String(error);
    console.error('[CLASSROOM_RENDER_ERROR]', {
      presentationId,
      stage: 'RENDER_PRESENTATION',
      error: message.slice(0, 1200),
      code,
    });
    errors.push(`${code} ${message.slice(0, 800)}`);
    return {
      success: false,
      provider: 'libreoffice-pdf',
      pdf: null,
      images: [],
      expectedPages: source.expectedSlideCount ?? 0,
      actualPages: 0,
      errors,
      warnings,
      sourceHash,
      rendererVersion: CLASSROOM_RENDERER_VERSION,
    };
  } finally {
    if (existsSync(workDir)) {
      /* PNG buffers are already in memory; drop the isolated LibreOffice profile. */
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
