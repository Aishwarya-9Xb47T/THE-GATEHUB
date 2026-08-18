/**
 * Presentation Import Service
 * Handle imports from various sources (PowerPoint, Google Slides, PDF)
 */

import { prisma } from '../../utils/prisma.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { persistAtPublicRelative } from '../../middlewares/persistUpload.js';
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

export interface ImportPresentationInput {
  instructorId: string;
  title: string;
  description?: string;
  sourceType: PresentationSourceType;
  sourceUrl?: string;
  file?: Buffer;
  options?: PowerPointImportOptions | GoogleSlidesImportOptions;
}

export interface ImportPresentationResult {
  presentationId: string;
  slideCount: number;
  sourceSlideCount?: number;
  warnings?: string[];
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
    const err: any = new AppError(400, importResult.error || 'Import failed');
    err.stage = (importResult as any).stage || 'parser';
    err.slideNumber = (importResult as any).slideNumber;
    throw err;
  }

  return { importResult, sourceFileBuffer };
}

async function persistImportedContent(
  presentationId: string,
  importResult: ImportResult,
  sourceFileBuffer?: Buffer,
): Promise<string[]> {
  const renderWarnings: string[] = [];
  const assetRoot = path.resolve(
    process.cwd(),
    process.env.UPLOAD_DIR || 'uploads',
    'classroom',
    presentationId,
  );
  const assetUrls = new Map<string, string>();

  const sourcePptxAsset = sourceFileBuffer
    ? {
        path: 'source/original.pptx',
        data: sourceFileBuffer,
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }
    : undefined;

  for (const asset of [...(importResult.assets ?? []), ...(sourcePptxAsset ? [sourcePptxAsset] : [])]) {
    const diskPath = path.resolve(assetRoot, asset.path);
    if (!diskPath.startsWith(`${assetRoot}${path.sep}`)) {
      throw new AppError(400, 'Invalid media path in PowerPoint package');
    }
    await mkdir(path.dirname(diskPath), { recursive: true });
    await writeFile(diskPath, asset.data);
    assetUrls.set(`asset://${asset.path}`, `/uploads/classroom/${presentationId}/${asset.path}`);
  }
  console.info('[Classroom import] Media extracted', { presentationId, count: assetUrls.size });

  const originalPptxAssetUrl = sourcePptxAsset ? `asset://${sourcePptxAsset.path}` : undefined;
  if (originalPptxAssetUrl) {
    assetUrls.set(
      originalPptxAssetUrl,
      `/uploads/classroom/${presentationId}/${sourcePptxAsset!.path}`,
    );
  }

  const renderedByIndex = new Map<number, string>();
  if (sourceFileBuffer) {
    console.info('[Classroom import] Rendering faithful slide visuals', { presentationId });
    const renderResult = await renderPresentationSlides(
      sourceFileBuffer,
      path.join(assetRoot, 'renders'),
    );
    renderWarnings.push(...renderResult.warnings, ...renderResult.errors);

    for (const render of renderResult.renders) {
      const assetPath = render.path;
      assetUrls.set(
        `asset://${assetPath}`,
        `/uploads/classroom/${presentationId}/${assetPath}`,
      );
      renderedByIndex.set(render.index, `asset://${assetPath}`);
    }

    const sourceSlideCount = (importResult.metadata?.sourceSlideCount as number | undefined)
      ?? importResult.slides!.length;
    renderWarnings.push(
      ...validateSlideVisualCoverage(
        sourceSlideCount,
        renderResult.renders.length,
        importResult.slides!.length,
      ),
    );

    if (!renderResult.success) {
      console.error('[Classroom import] FAITHFUL RENDER FAILED', {
        presentationId,
        slideCount: renderResult.slideCount,
        rendered: renderResult.renders.length,
        errors: renderResult.errors,
        warnings: renderResult.warnings,
      });
      renderWarnings.push(
        'Faithful slide rendering failed; structured HTML fallback will be used until visuals are regenerated.',
        ...renderResult.errors,
      );
    } else {
      console.info('[Classroom import] Faithful render succeeded', {
        presentationId,
        slideCount: renderResult.slideCount,
        rendered: renderResult.renders.length,
      });
    }
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
        ...(sourcePptxAsset ? {
          visual: renderedByIndex.has(index)
            ? {
                type: 'svg',
                src: renderedByIndex.get(index),
                slideIndex: index,
                width: slideData.content?.size?.width,
                height: slideData.content?.size?.height,
                source: {
                  type: 'pptx',
                  src: originalPptxAssetUrl,
                  slideIndex: index,
                },
              }
            : {
                type: 'pptx',
                src: originalPptxAssetUrl,
                slideIndex: index,
              },
        } : {}),
      }),
      notes: slideData.notes,
    })),
  });

  const sourceSlideCount = (importResult.metadata?.sourceSlideCount as number | undefined)
    ?? importResult.slides!.length;
  const persistedSlides: PersistedSlideLike[] = importResult.slides!.map((slideData, index) => ({
    order: index + 1,
    title: slideData.title,
    content: replaceAssets({
      ...slideData.content,
      ...(sourcePptxAsset ? {
        visual: renderedByIndex.has(index)
          ? {
              type: 'svg',
              src: renderedByIndex.get(index),
              slideIndex: index,
              width: slideData.content?.size?.width,
              height: slideData.content?.size?.height,
              source: {
                type: 'pptx',
                src: originalPptxAssetUrl,
                slideIndex: index,
              },
            }
          : {
              type: 'pptx',
              src: originalPptxAssetUrl,
              slideIndex: index,
            },
      } : {}),
    }),
  }));

  const fidelityResult = validateDeckFidelity({
    slides: persistedSlides,
    assetRoot,
    presentationId,
    originalPptxPath: sourcePptxAsset ? path.join(assetRoot, 'source/original.pptx') : undefined,
    sourceSlideCount,
  });

  if (!fidelityResult.passed) {
    console.error('[Classroom import] Fidelity validation failed', {
      presentationId,
      issueCount: fidelityResult.issues.length,
      errors: fidelityResult.issues.filter((i) => i.severity === 'error').length,
    });
    renderWarnings.push(
      'Presentation fidelity validation reported errors.',
      ...fidelityResult.issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.message),
    );
  } else {
    console.info('[Classroom import] Fidelity validation passed', {
      presentationId,
      slides: fidelityResult.sourceSlideCount,
      visualAssets: fidelityResult.visualAssetCount,
    });
  }

  if (process.env.LOG_FIDELITY_REPORT === '1') {
    console.info(formatFidelityReport(fidelityResult));
  }

  const uniquePublicUrls = [...new Set(assetUrls.values())];
  for (const publicUrl of uniquePublicUrls) {
    const relative = publicUrl.replace(/^\/uploads\//, '');
    const diskPath = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads', ...relative.split('/'));
    if (!existsSync(diskPath)) {
      console.warn('[Classroom import] Asset missing on disk before B2 persist', { presentationId, relative });
      continue;
    }
    await persistAtPublicRelative(diskPath, relative, undefined, { keepLocal: true });
  }

  console.info('[Classroom import] Slides saved', {
    presentationId,
    count: importResult.slides!.length,
    renderedVisuals: renderedByIndex.size,
    fidelityPassed: fidelityResult.passed,
  });
  return renderWarnings;
}

export async function importPresentation(
  input: ImportPresentationInput,
): Promise<ImportPresentationResult> {
  console.info('[Classroom import] Service started', {
    sourceType: input.sourceType,
    instructorId: input.instructorId,
  });

  const { importResult, sourceFileBuffer } = await resolveImportFromInput(input);
  const warnings = collectImportWarnings(importResult);
  const sourceSlideCount = importResult.metadata?.sourceSlideCount as number | undefined;

  const presentation = await prisma.presentation.create({
    data: {
      title: input.title,
      description: input.description,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      status: 'draft',
      instructorId: input.instructorId,
    },
  });
  console.info('[Classroom import] Presentation created', { presentationId: presentation.id });

  try {
    const renderWarnings = await persistImportedContent(presentation.id, importResult, sourceFileBuffer);
    warnings.push(...renderWarnings);
    await prisma.presentation.update({
      where: { id: presentation.id },
      data: { status: 'ready' },
    });
    console.info('[Classroom import] Presentation marked ready', { presentationId: presentation.id });
  } catch (error) {
    await prisma.presentation.delete({ where: { id: presentation.id } });
    console.error('[Classroom import] Persistence failed', { presentationId: presentation.id, error });
    throw error;
  }

  if (warnings.length) {
    console.warn('[Classroom import] Extraction warnings', { presentationId: presentation.id, warnings });
  }

  return {
    presentationId: presentation.id,
    slideCount: importResult.slides!.length,
    sourceSlideCount,
    warnings: warnings.length ? warnings : undefined,
  };
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
  const renderWarnings = await persistImportedContent(presentationId, importResult, exportResult.fileBuffer);
  warnings.push(...renderWarnings);
  await prisma.presentation.update({
    where: { id: presentationId },
    data: { status: 'ready' },
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
