/**
 * Presentation Import Service
 * Handle imports from various sources (PowerPoint, Google Slides, PDF)
 */

import { prisma } from '../../utils/prisma.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { persistAtPublicRelative } from '../../middlewares/persistUpload.js';
import { headObject, isB2Configured } from '../b2StorageService.js';
import { AppError } from '../../middlewares/errorHandler.js';
import * as powerPointParser from './powerPointParser.js';
import * as googleSlidesAdapter from './googleSlidesAdapter.js';
import { parsePDFPresentation } from './pdfImporter.js';
import {
  renderPresentationSlides,
  validateSlideVisualCoverage,
} from './presentationRenderService.js';
import {
  validateDeckFidelity,
  formatFidelityReport,
  type PersistedSlideLike,
} from './presentationFidelityValidator.js';
import {
  canonicalPublicPath,
  canonicalSlideSvgRelative,
  canonicalSourceRelative,
  buildSlideVisual,
  PPTX_MIME,
  SVG_MIME,
} from './classroomAssetPath.js';
import {
  persistPptxBuffer,
  requireDurableClassroomStorage,
  isValidPptxBuffer,
} from './classroomSourceResolver.js';
import { regeneratePresentationVisuals } from './presentationVisualRepairService.js';
import type {
  ImportResult,
  PowerPointImportOptions,
  GoogleSlidesImportOptions,
  PresentationSourceType,
} from './types.js';

const DEFAULT_PPTX_OPTIONS: PowerPointImportOptions = {
  extractNotes: true,
  generateThumbnails: false,
  preserveAnimations: true,
};

/** Fonts commonly available in browsers without custom loading */
const WEB_SAFE_FONTS = new Set([
  'Arial', 'Helvetica', 'Helvetica Neue', 'Times New Roman', 'Times', 'Georgia',
  'Verdana', 'Tahoma', 'Trebuchet MS', 'Courier New', 'Courier', 'Calibri',
  'Cambria', 'Segoe UI', 'Segoe UI Symbol', 'Consolas', 'Impact', 'Comic Sans MS',
  'Palatino Linotype', 'Book Antiqua', 'Lucida Sans Unicode', 'Lucida Console',
]);

export interface ImportProgressEvent {
  stage: 'upload' | 'source' | 'extract' | 'render' | 'verify' | 'ready';
  percent: number;
  message: string;
  slide?: number;
  total?: number;
}

export interface ImportPresentationInput {
  instructorId: string;
  title: string;
  description?: string;
  sourceType: PresentationSourceType;
  sourceUrl?: string;
  file?: Buffer;
  options?: PowerPointImportOptions | GoogleSlidesImportOptions;
  onProgress?: (event: ImportProgressEvent) => void | Promise<void>;
}

export interface ImportPresentationResult {
  presentationId: string;
  slideCount: number;
  sourceSlideCount?: number;
  warnings?: string[];
  extractionWarnings?: string[];
  renderErrors?: string[];
  sourcePptxStatus?: string;
  extractionStatus?: string;
  visualRenderStatus?: string;
  overallStatus?: string;
  renderedCount?: number;
  method?: string;
  code?: string;
  slidesSucceeded?: number;
  slidesFailed?: number;
  failedSlideNumbers?: number[];
  sourceKey?: string;
}

function getGooglePresentationId(sourceUrl: string): string {
  const match = sourceUrl.match(/\/presentation\/d\/([^/?#]+)/);
  return match?.[1] ?? sourceUrl;
}

function collectFontWarnings(slides: NonNullable<ImportResult['slides']>): string[] {
  const fonts = new Set<string>();

  const walkElements = (elements: any[] | undefined) => {
    for (const el of elements ?? []) {
      for (const p of el.paragraphs ?? []) {
        for (const r of p.runs ?? []) {
          const latin = r.style?.latin;
          if (typeof latin === 'string' && latin.trim()) fonts.add(latin.trim());
        }
      }
      if (Array.isArray(el.children)) walkElements(el.children);
      if (Array.isArray(el.rows)) {
        for (const row of el.rows) {
          for (const cell of row.cells ?? []) {
            for (const p of cell.paragraphs ?? []) {
              for (const r of p.runs ?? []) {
                const latin = r.style?.latin;
                if (typeof latin === 'string' && latin.trim()) fonts.add(latin.trim());
              }
            }
          }
        }
      }
    }
  };

  for (const slide of slides) {
    walkElements(slide.content?.elements);
  }

  return [...fonts]
    .filter((font) => !WEB_SAFE_FONTS.has(font))
    .map((font) => `Font "${font}" may not render exactly on all devices`);
}

function collectImportWarnings(importResult: ImportResult): string[] {
  const warnings: string[] = [];
  const slides = importResult.slides ?? [];
  const sourceSlideCount = importResult.metadata?.sourceSlideCount as number | undefined;

  if (sourceSlideCount != null && sourceSlideCount !== slides.length) {
    warnings.push(
      `Slide count mismatch: source has ${sourceSlideCount} slides, extracted ${slides.length}`,
    );
  }

  const slideErrors = importResult.metadata?.slideErrors as Array<{ slide: number; error: string }> | undefined;
  if (slideErrors?.length) {
    for (const err of slideErrors) {
      warnings.push(`Slide ${err.slide}: ${err.error}`);
    }
  }

  warnings.push(...collectFontWarnings(slides));
  return warnings;
}

async function resolveImportFromInput(
  input: ImportPresentationInput,
): Promise<{ importResult: ImportResult; sourceFileBuffer?: Buffer }> {
  let importResult: ImportResult;
  let sourceFileBuffer = input.file;

  switch (input.sourceType) {
    case 'powerpoint':
      if (!sourceFileBuffer) {
        throw new AppError(400, 'File is required for PowerPoint import');
      }
      importResult = await powerPointParser.parsePowerPoint(
        sourceFileBuffer,
        (input.options as PowerPointImportOptions) ?? DEFAULT_PPTX_OPTIONS,
      );
      console.info('[Classroom import] Parser completed', {
        slides: importResult.slides?.length ?? 0,
        assets: importResult.assets?.length ?? 0,
        success: importResult.success,
      });
      break;

    case 'google_slides':
      if (sourceFileBuffer) {
        importResult = await powerPointParser.parsePowerPoint(
          sourceFileBuffer,
          (input.options as PowerPointImportOptions) ?? DEFAULT_PPTX_OPTIONS,
        );
      } else if (input.sourceUrl) {
        const googleId = getGooglePresentationId(input.sourceUrl);
        const exportResult = await googleSlidesAdapter.exportGoogleSlidesToPptxForUser(
          googleId,
          input.instructorId,
        );
        if ('error' in exportResult) {
          throw new AppError(400, exportResult.error);
        }
        sourceFileBuffer = exportResult.fileBuffer;
        importResult = await powerPointParser.parsePowerPoint(
          sourceFileBuffer,
          DEFAULT_PPTX_OPTIONS,
        );
        console.info('[Classroom import] Google Slides OAuth PPTX export parsed', {
          slides: importResult.slides?.length ?? 0,
          assets: importResult.assets?.length ?? 0,
        });
      } else {
        throw new AppError(400, 'Source URL or exported file is required for Google Slides import');
      }
      break;

    case 'pdf':
      if (!sourceFileBuffer) {
        throw new AppError(400, 'File is required for PDF import');
      }
      importResult = await parsePDFPresentation(sourceFileBuffer);
      console.info('[Classroom import] PDF Parser completed', {
        slides: importResult.slides?.length ?? 0,
        success: importResult.success,
      });
      break;

    case 'manual':
      importResult = { success: true, slides: [] };
      break;

    default:
      throw new AppError(400, `Unsupported source type: ${input.sourceType}`);
  }

  if (!importResult.success || !importResult.slides) {
    throw new AppError(400, importResult.error || 'Import failed', true, {
      code: 'CLASSROOM_EXTRACTION_FAILED',
      stage: (importResult as { stage?: string }).stage || 'parser',
    });
  }

  return { importResult, sourceFileBuffer };
}

type PersistOutcome = {
  renderWarnings: string[];
  renderErrors: string[];
  renderedCount: number;
  expectedCount: number;
  failedSlideNumbers: number[];
  method?: string;
  visualRenderStatus: 'complete' | 'partial' | 'failed' | 'skipped' | 'pending';
};

async function persistImportedContent(
  presentationId: string,
  importResult: ImportResult,
  sourceFileBuffer: Buffer | undefined,
  options: {
    isPptxPipeline: boolean;
    sourceAlreadyStored?: boolean;
    deferRender?: boolean;
    onProgress?: (event: ImportProgressEvent) => void | Promise<void>;
  },
): Promise<PersistOutcome> {
  const renderWarnings: string[] = [];
  const renderErrors: string[] = [];
  const assetRoot = path.resolve(
    process.cwd(),
    process.env.UPLOAD_DIR || 'uploads',
    'classroom',
    presentationId,
  );
  const assetUrls = new Map<string, string>();
  const expectedCount = importResult.slides!.length;

  for (const asset of importResult.assets ?? []) {
    if (asset.path === 'source/original.pptx') continue;
    const diskPath = path.resolve(assetRoot, asset.path);
    if (!diskPath.startsWith(`${assetRoot}${path.sep}`)) {
      throw new AppError(400, 'Invalid media path in PowerPoint package');
    }
    await mkdir(path.dirname(diskPath), { recursive: true });
    await writeFile(diskPath, asset.data);
    assetUrls.set(`asset://${asset.path}`, `/uploads/classroom/${presentationId}/${asset.path}`);
  }
  console.info('[Classroom import] Media extracted', { presentationId, count: assetUrls.size });

  if (options.isPptxPipeline && sourceFileBuffer && !options.sourceAlreadyStored) {
    requireDurableClassroomStorage();
    const stored = await persistPptxBuffer(presentationId, sourceFileBuffer);
    console.info('[Classroom import] Source PPTX stored', {
      presentationId,
      relative: stored.relative,
      bytes: stored.bytes,
    });
  }

  const replaceAssets = (value: any): any => {
    if (typeof value === 'string') return assetUrls.get(value) ?? value;
    if (Array.isArray(value)) return value.map(replaceAssets);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, replaceAssets(item)]),
      );
    }
    return value;
  };

  await prisma.slide.createMany({
    data: importResult.slides!.map((slideData, index) => ({
      presentationId,
      order: index + 1,
      title: slideData.title || `Slide ${index + 1}`,
      content: replaceAssets({
        ...slideData.content,
        ...(options.isPptxPipeline
          ? { visual: buildSlideVisual(presentationId, index, false) }
          : {}),
      }),
      notes: slideData.notes,
    })),
  });

  const renderedByIndex = new Set<number>();
  let method: string | undefined;
  if (options.isPptxPipeline && sourceFileBuffer && !options.deferRender) {
    await options.onProgress?.({
      stage: 'render',
      percent: 46,
      message: `Rendering slide 1 of ${expectedCount}…`,
      slide: 1,
      total: expectedCount,
    });
    console.info('[Classroom import] Rendering faithful slide visuals', { presentationId });
    const renderDir = path.join(assetRoot, 'renders');
    const renderResult = await renderPresentationSlides(sourceFileBuffer, renderDir, {
      onProgress: async ({ slide, total }) => {
        const percent = 45 + Math.round((slide / Math.max(1, total)) * 50);
        await options.onProgress?.({
          stage: 'render',
          percent: Math.min(95, percent),
          message: `Rendering slide ${slide} of ${total}…`,
          slide,
          total,
        });
      },
    });
    method = renderResult.method;
    renderWarnings.push(...renderResult.warnings);
    renderErrors.push(...renderResult.errors);

    await options.onProgress?.({
      stage: 'verify',
      percent: 96,
      message: 'Verifying slide visuals…',
      total: expectedCount,
    });

    for (const render of renderResult.renders) {
      const relative = canonicalSlideSvgRelative(presentationId, render.index + 1);
      const diskPath = path.join(renderDir, path.basename(render.path));
      if (!existsSync(diskPath)) {
        console.warn('[Classroom import] Rendered SVG missing on disk', { presentationId, relative });
        renderErrors.push(`Rendered SVG missing before storage: ${relative}`);
        continue;
      }
      await persistAtPublicRelative(diskPath, relative, SVG_MIME, { keepLocal: true });
      if (isB2Configured()) {
        const stored = await headObject(`uploads/${relative}`);
        if (!stored || !(stored.contentLength && stored.contentLength > 32)) {
          renderErrors.push(`Slide visual was not stored: ${relative}`);
          continue;
        }
      }
      renderedByIndex.add(render.index);
    }

    const savedSlides = await prisma.slide.findMany({
      where: { presentationId },
      orderBy: { order: 'asc' },
    });
    for (const slide of savedSlides) {
      const hasSvg = renderedByIndex.has(slide.order - 1);
      await prisma.slide.update({
        where: { id: slide.id },
        data: {
          content: {
            ...((slide.content && typeof slide.content === 'object' && !Array.isArray(slide.content)
              ? slide.content
              : {}) as object),
            visual: buildSlideVisual(presentationId, slide.order - 1, hasSvg),
          },
        },
      });
    }

    const sourceSlideCount = (importResult.metadata?.sourceSlideCount as number | undefined)
      ?? expectedCount;
    renderWarnings.push(
      ...validateSlideVisualCoverage(sourceSlideCount, renderedByIndex.size, expectedCount),
    );

    if (renderedByIndex.size === 0) {
      console.error('[Classroom import] FAITHFUL RENDER FAILED', {
        presentationId,
        slideCount: renderResult.slideCount,
        rendered: renderedByIndex.size,
        errors: renderResult.errors,
      });
    } else {
      console.info('[Classroom import] Faithful render persisted', {
        presentationId,
        slideCount: renderResult.slideCount,
        rendered: renderedByIndex.size,
        method,
      });
    }
  }

  const sourceSlideCount = (importResult.metadata?.sourceSlideCount as number | undefined)
    ?? expectedCount;
  const persistedSlides: PersistedSlideLike[] = importResult.slides!.map((slideData, index) => ({
    order: index + 1,
    title: slideData.title,
    content: replaceAssets({
      ...slideData.content,
      ...(options.isPptxPipeline
        ? { visual: buildSlideVisual(presentationId, index, renderedByIndex.has(index)) }
        : {}),
    }),
  }));

  const fidelityResult = validateDeckFidelity({
    slides: persistedSlides,
    assetRoot,
    presentationId,
    originalPptxPath: options.isPptxPipeline ? path.join(assetRoot, 'source/original.pptx') : undefined,
    sourceSlideCount,
  });

  if (!fidelityResult.passed) {
    console.warn('[Classroom import] Fidelity validation reported issues', {
      presentationId,
      issueCount: fidelityResult.issues.length,
    });
    renderWarnings.push(
      ...fidelityResult.issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.message),
    );
  }

  if (process.env.LOG_FIDELITY_REPORT === '1') {
    console.info(formatFidelityReport(fidelityResult));
  }

  for (const [assetRef, publicUrl] of assetUrls.entries()) {
    if (assetRef.includes('renders/slide-') || assetRef.endsWith('original.pptx')) continue;
    const relative = publicUrl.replace(/^\/uploads\//, '');
    const diskPath = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads', ...relative.split('/'));
    if (!existsSync(diskPath)) {
      renderWarnings.push(`Asset missing before storage: ${relative}`);
      continue;
    }
    const mime = relative.endsWith('.pptx') ? PPTX_MIME : relative.endsWith('.svg') ? SVG_MIME : undefined;
    await persistAtPublicRelative(diskPath, relative, mime, { keepLocal: true });
  }

  const failedSlideNumbers = importResult.slides!
    .map((_, index) => index + 1)
    .filter((order) => !renderedByIndex.has(order - 1));
  const visualRenderStatus: PersistOutcome['visualRenderStatus'] = !options.isPptxPipeline
    ? 'skipped'
    : options.deferRender
      ? 'pending'
    : renderedByIndex.size === expectedCount && expectedCount > 0
      ? 'complete'
      : renderedByIndex.size > 0
        ? 'partial'
        : 'failed';

  console.info('[Classroom import] Slides saved', {
    presentationId,
    count: expectedCount,
    renderedVisuals: renderedByIndex.size,
    visualRenderStatus,
  });

  return {
    renderWarnings,
    renderErrors,
    renderedCount: renderedByIndex.size,
    expectedCount,
    failedSlideNumbers: options.isPptxPipeline ? failedSlideNumbers : [],
    method,
    visualRenderStatus,
  };
}

function overallStatusFromPipeline(args: {
  isPptxPipeline: boolean;
  visualRenderStatus: PersistOutcome['visualRenderStatus'];
  expectedCount: number;
}): string {
  if (!args.isPptxPipeline) return args.expectedCount > 0 ? 'ready' : 'draft';
  if (args.visualRenderStatus === 'complete') return 'ready';
  if (args.visualRenderStatus === 'pending') return 'rendering';
  if (args.visualRenderStatus === 'partial') return 'rendering_partial';
  return 'render_failed';
}

export async function importPresentation(
  input: ImportPresentationInput,
): Promise<ImportPresentationResult> {
  console.info('[Classroom import] Service started', {
    sourceType: input.sourceType,
    instructorId: input.instructorId,
  });

  const isPptxPipeline = input.sourceType === 'powerpoint' || input.sourceType === 'google_slides';
  const onProgress = input.onProgress ?? (async () => undefined);

  const presentation = await prisma.presentation.create({
    data: {
      title: input.title,
      description: input.description,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      status: isPptxPipeline ? 'uploading' : 'draft',
      instructorId: input.instructorId,
    },
  });
  console.info('[Classroom import] Presentation created', { presentationId: presentation.id });

  let sourceStored = false;
  let sourceFileBuffer = input.file;

  try {
    if (input.sourceType === 'powerpoint') {
      if (!sourceFileBuffer || !isValidPptxBuffer(sourceFileBuffer)) {
        throw new AppError(400, 'Upload a valid .pptx PowerPoint Open XML file', true, {
          code: 'CLASSROOM_PPTX_INVALID',
          stage: 'validation',
        });
      }
      await onProgress({ stage: 'source', percent: 12, message: 'Saving source…' });
      requireDurableClassroomStorage();
      const stored = await persistPptxBuffer(presentation.id, sourceFileBuffer);
      sourceStored = true;
      await prisma.presentation.update({
        where: { id: presentation.id },
        data: {
          status: 'source_stored',
          sourceUrl: canonicalPublicPath(stored.relative),
        },
      });
      await onProgress({ stage: 'extract', percent: 28, message: 'Extracting slides…' });
      await prisma.presentation.update({
        where: { id: presentation.id },
        data: { status: 'extracting' },
      });
    }

    const resolved = await resolveImportFromInput({ ...input, file: sourceFileBuffer });
    sourceFileBuffer = resolved.sourceFileBuffer;
    const importResult = resolved.importResult;
    const extractionWarnings = collectImportWarnings(importResult);
    const sourceSlideCount = importResult.metadata?.sourceSlideCount as number | undefined;

    if (isPptxPipeline && sourceFileBuffer && !sourceStored) {
      await onProgress({ stage: 'source', percent: 18, message: 'Saving source…' });
      requireDurableClassroomStorage();
      const stored = await persistPptxBuffer(presentation.id, sourceFileBuffer);
      sourceStored = true;
      await prisma.presentation.update({
        where: { id: presentation.id },
        data: {
          status: 'source_stored',
          sourceUrl: canonicalPublicPath(stored.relative),
        },
      });
    }

    if (isPptxPipeline) {
      await prisma.presentation.update({
        where: { id: presentation.id },
        data: { status: 'rendering' },
      });
    }

    const persistResult = await persistImportedContent(
      presentation.id,
      importResult,
      sourceFileBuffer,
      { isPptxPipeline, sourceAlreadyStored: sourceStored, deferRender: isPptxPipeline, onProgress },
    );

    const overallStatus = overallStatusFromPipeline({
      isPptxPipeline,
      visualRenderStatus: persistResult.visualRenderStatus,
      expectedCount: persistResult.expectedCount,
    });
    const sourceRelative = canonicalSourceRelative(presentation.id);
    await prisma.presentation.update({
      where: { id: presentation.id },
      data: {
        status: overallStatus,
        ...(isPptxPipeline ? { sourceUrl: canonicalPublicPath(sourceRelative) } : {}),
      },
    });

    if (isPptxPipeline && persistResult.visualRenderStatus === 'pending') {
      setImmediate(() => {
        regeneratePresentationVisuals(presentation.id, input.instructorId).catch((error) => {
          console.error('[Classroom import] Background slide render failed', {
            presentationId: presentation.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      });
    }

    const result: ImportPresentationResult = {
      presentationId: presentation.id,
      slideCount: importResult.slides!.length,
      sourceSlideCount,
      warnings: [...extractionWarnings, ...persistResult.renderWarnings, ...persistResult.renderErrors],
      extractionWarnings,
      renderErrors: persistResult.renderErrors,
      sourcePptxStatus: isPptxPipeline ? (sourceStored ? 'stored' : 'failed') : 'n/a',
      extractionStatus: 'complete',
      visualRenderStatus: persistResult.visualRenderStatus,
      overallStatus,
      renderedCount: persistResult.renderedCount,
      method: persistResult.method,
      slidesSucceeded: persistResult.renderedCount,
      slidesFailed: persistResult.failedSlideNumbers.length,
      failedSlideNumbers: persistResult.failedSlideNumbers,
      sourceKey: isPptxPipeline ? `uploads/${sourceRelative}` : undefined,
      code:
        persistResult.visualRenderStatus === 'pending'
          ? 'CLASSROOM_RENDERING'
          : persistResult.visualRenderStatus === 'partial'
          ? 'CLASSROOM_RENDER_PARTIAL'
          : persistResult.visualRenderStatus === 'complete' || persistResult.visualRenderStatus === 'skipped'
            ? 'CLASSROOM_IMPORT_OK'
            : 'CLASSROOM_RENDER_FAILED',
    };

    if (overallStatus === 'ready') {
      await onProgress({ stage: 'ready', percent: 100, message: 'Presentation ready.' });
    } else if (overallStatus === 'rendering') {
      await onProgress({ stage: 'render', percent: 50, message: 'Generating slide visuals…' });
    }

    console.info('[Classroom import] Presentation pipeline complete', {
      presentationId: presentation.id,
      overallStatus,
      rendered: persistResult.renderedCount,
      extractionWarnings: extractionWarnings.length,
    });

    if (extractionWarnings.length) {
      console.warn('[Classroom import] Extraction warnings', {
        presentationId: presentation.id,
        count: extractionWarnings.length,
      });
    }

    return result;
  } catch (error) {
    if (!sourceStored) {
      await prisma.presentation.delete({ where: { id: presentation.id } }).catch(() => undefined);
    } else {
      const code = error instanceof AppError ? error.details?.code : undefined;
      const failedStatus =
        code === 'CLASSROOM_SOURCE_UPLOAD_FAILED' || code === 'CLASSROOM_STORAGE_NOT_CONFIGURED'
          ? 'source_failed'
          : code === 'CLASSROOM_RENDER_FAILED'
            ? 'render_failed'
            : 'extraction_failed';
      await prisma.presentation.update({
        where: { id: presentation.id },
        data: { status: failedStatus },
      }).catch(() => undefined);
      if (error instanceof AppError && !error.details?.presentationId) {
        error.details = {
          ...(error.details || { code: error.details?.code || 'CLASSROOM_IMPORT_FAILED' }),
          code: error.details?.code || 'CLASSROOM_IMPORT_FAILED',
          presentationId: presentation.id,
        };
      }
    }
    console.error('[Classroom import] Persistence failed', { presentationId: presentation.id, error });
    throw error;
  }
}

export async function updatePresentationFromSource(
  presentationId: string,
  instructorId: string,
): Promise<{ slideCount: number; warnings?: string[] }> {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presentationId },
  });

  if (!presentation) {
    throw new AppError(404, 'Presentation not found');
  }

  if (presentation.instructorId !== instructorId) {
    throw new AppError(403, 'You do not have permission to update this presentation');
  }

  if (!presentation.sourceUrl) {
    throw new AppError(400, 'Presentation does not have a source URL');
  }

  if (presentation.sourceType !== 'google_slides') {
    throw new AppError(400, 'Sync not supported for this source type');
  }

  const googleId = getGooglePresentationId(presentation.sourceUrl);
  const exportResult = await googleSlidesAdapter.exportGoogleSlidesToPptxForUser(googleId, instructorId);
  if ('error' in exportResult) {
    throw new AppError(400, exportResult.error);
  }

  const importResult = await powerPointParser.parsePowerPoint(
    exportResult.fileBuffer,
    DEFAULT_PPTX_OPTIONS,
  );

  if (!importResult.success || !importResult.slides) {
    throw new AppError(400, importResult.error || 'Sync failed');
  }

  const warnings = collectImportWarnings(importResult);

  await prisma.slide.deleteMany({ where: { presentationId } });
  const persistResult = await persistImportedContent(
    presentationId,
    importResult,
    exportResult.fileBuffer,
    { isPptxPipeline: true, sourceAlreadyStored: false },
  );
  warnings.push(...persistResult.renderWarnings, ...persistResult.renderErrors);
  const overallStatus = overallStatusFromPipeline({
    isPptxPipeline: true,
    visualRenderStatus: persistResult.visualRenderStatus,
    expectedCount: persistResult.expectedCount,
  });
  await prisma.presentation.update({
    where: { id: presentationId },
    data: { status: overallStatus },
  });

  if (warnings.length) {
    console.warn('[Classroom import] Sync warnings', { presentationId, warnings });
  }

  return {
    slideCount: importResult.slides.length,
    warnings: warnings.length ? warnings : undefined,
  };
}

export async function getImportSources(
  userId: string,
  sourceType: 'google_slides',
): Promise<any[]> {
  switch (sourceType) {
    case 'google_slides':
      return googleSlidesAdapter.listGooglePresentations(userId);

    default:
      throw new AppError(400, `Unsupported source type: ${sourceType}`);
  }
}
