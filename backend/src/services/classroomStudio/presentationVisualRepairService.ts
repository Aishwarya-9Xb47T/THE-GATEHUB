import { readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { isAdminRole } from "../../utils/roles.js";
import { persistAtPublicRelative } from "../../middlewares/persistUpload.js";
import { headObject, isB2Configured } from "../b2StorageService.js";
import {
  B2_UPLOAD_TIMEOUT_MS,
  describeClassroomRenderer,
  isValidRenderedSvg,
  renderPresentationSlides,
  withDeadline,
} from "./presentationRenderService.js";
import {
  downloadPresentationPptx,
  downloadPresentationExportPdf,
  persistPptxBuffer,
  persistPdfBuffer,
  resolvePresentationSource,
  sha256OfBuffer,
} from "./classroomSourceResolver.js";
import {
  SVG_MIME,
  buildSlideVisual,
  canonicalPublicPath,
  canonicalSlideSvgRelative,
  canonicalSourceRelative,
} from "./classroomAssetPath.js";
import { CLASSROOM_RENDER_JOB_TIMEOUT_MS } from "./presentationAccess.js";
import { classroomPptxPipelineLog } from "./classroomPipelineLog.js";

function classroomRenderPersistLog(
  presentationId: string,
  slide: number,
  relative: string,
  bytes: number,
) {
  console.info(
    `[CLASSROOM_RENDER] slide=${slide} success bytes=${bytes} key=uploads/${relative} presentationId=${presentationId}`,
  );
}

function classroomRenderLogPersist(
  presentationId: string,
  slide: number,
  stage: string,
  relative: string,
) {
  console.info(
    `[CLASSROOM_RENDER] stage=${stage} presentationId=${presentationId} slide=${slide} key=uploads/${relative}`,
  );
}

function withVisual(
  content: unknown,
  presentationId: string,
  slideIndex: number,
  hasSvg: boolean,
  error?: { code?: string; message?: string },
): Record<string, unknown> {
  const base =
    content && typeof content === "object" && !Array.isArray(content)
      ? { ...(content as Record<string, unknown>) }
      : {};
  base.visual = buildSlideVisual(presentationId, slideIndex, hasSvg, error);
  return base;
}

const inflightVisualRenders = new Map<string, Promise<unknown>>();

export function isExclusiveVisualRenderRunning(presentationId: string): boolean {
  return inflightVisualRenders.has(presentationId);
}

export function startExclusiveVisualRender(
  presentationId: string,
  work: () => Promise<unknown>,
): { started: boolean; job: Promise<unknown> } {
  const existing = inflightVisualRenders.get(presentationId);
  if (existing) return { started: false, job: existing };
  const job = withDeadline(
    work(),
    CLASSROOM_RENDER_JOB_TIMEOUT_MS,
    "CLASSROOM_RENDER_TIMEOUT",
    `CLASSROOM_RENDER_TIMEOUT overall render job presentationId=${presentationId}`,
  ).finally(() => {
    inflightVisualRenders.delete(presentationId);
  });
  inflightVisualRenders.set(presentationId, job);
  return { started: true, job };
}

async function headFirst(relative: string) {
  if (!isB2Configured()) return null;
  const keys = [`uploads/${relative}`, relative];
  for (const key of keys) {
    const meta = await headObject(key);
    if (meta) return { relative, key, meta };
  }
  return null;
}

export async function inspectPresentationVisuals(presentationId: string) {
  const source = await resolvePresentationSource(presentationId);
  const slides = await prisma.slide.findMany({
    where: { presentationId },
    orderBy: { order: "asc" },
    select: { id: true, order: true, content: true },
  });

  const slideReports = [];
  for (const slide of slides) {
    const visual = (slide.content as { visual?: { src?: string; type?: string } } | null)?.visual;
    const svgRelative = canonicalSlideSvgRelative(presentationId, slide.order);
    const svgHit = await headFirst(svgRelative);
    slideReports.push({
      slideId: slide.id,
      order: slide.order,
      visualType: visual?.type ?? null,
      visualSrc: typeof visual?.src === "string" ? visual.src : null,
      svgRelative,
      svgFound: Boolean(svgHit),
      svgBytes: svgHit?.meta.contentLength ?? null,
    });
  }

  return {
    presentationId,
    source: source.ok
      ? {
          found: true,
          relative: source.relative,
          key: source.key,
          bytes: source.bytes,
          contentType: source.contentType,
          origin: source.origin,
        }
      : {
          found: false,
          keysChecked: source.keysChecked,
        },
    slides: slideReports,
  };
}

export async function regeneratePresentationVisuals(
  presentationId: string,
  actorUserId: string,
  actorRole?: string,
) {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presentationId },
    include: { slides: { orderBy: { order: "asc" } } },
  });
  if (!presentation) {
    throw new AppError(404, "Presentation not found");
  }
  if (presentation.instructorId !== actorUserId && !isAdminRole(actorRole)) {
    throw new AppError(403, "You do not have access to this presentation", true, {
      code: "CLASSROOM_ASSET_FORBIDDEN",
      stage: "auth",
    });
  }

  const resolved = await resolvePresentationSource(presentationId);
  if (!resolved.ok) {
    console.warn("[CLASSROOM_REPAIR] source_not_found", {
      presentationId,
      stage: resolved.stage,
      keysChecked: resolved.keysChecked,
    });
    throw new AppError(404, "The original PowerPoint file was not found in storage", true, {
      code: "CLASSROOM_SOURCE_NOT_FOUND",
      stage: "source-lookup",
      retryable: false,
      keysChecked: resolved.keysChecked,
    });
  }

  console.info("[CLASSROOM_REPAIR] source_resolved", {
    presentationId,
    stage: "source-lookup",
    origin: resolved.origin,
    key: resolved.key,
    bytes: resolved.bytes,
  });
  console.info("[CLASSROOM_RENDER]", describeClassroomRenderer());

  const expected = presentation.slides.length;
  const canonicalRelative = canonicalSourceRelative(presentationId);
  console.info("[CLASSROOM_RENDER]", {
    presentationId,
    slides: expected,
    sourceKey: resolved.key,
    sourceBytes: resolved.bytes,
    reuseSource: resolved.relative === canonicalRelative,
  });
  await prisma.presentation.update({
    where: { id: presentationId },
    data: { status: "rendering" },
  });

  const { started, job } = startExclusiveVisualRender(presentationId, async () => {
    const pptxBuffer = await downloadPresentationPptx(resolved);
    const downloadedSha = sha256OfBuffer(pptxBuffer);
    const storedPdf = await downloadPresentationExportPdf(presentationId);
    classroomPptxPipelineLog("source_download_complete", {
      presentationId,
      sourceType: presentation.sourceType,
      sourceKey: resolved.key,
      storedBytes: resolved.bytes,
      downloadedBytes: pptxBuffer.length,
      bytesMatch: resolved.bytes === pptxBuffer.length,
      hasStoredPdf: Boolean(storedPdf),
    });
    console.info("[CLASSROOM_SOURCE]", {
      presentationId,
      origin: resolved.origin,
      key: resolved.key,
      bytes: pptxBuffer.length,
      sha256: downloadedSha,
      hasStoredPdf: Boolean(storedPdf),
      pdfBytes: storedPdf?.length,
    });
    const persistedSource =
      resolved.relative === canonicalRelative
        ? { relative: resolved.relative, bytes: resolved.bytes, sha256: downloadedSha }
        : await persistPptxBuffer(presentationId, pptxBuffer);
    return renderAndPersistPresentationVisuals(presentationId, pptxBuffer, {
      skipExisting: true,
      sourceRelative: persistedSource.relative,
      sourceBytes: persistedSource.bytes,
      sourceSha256: persistedSource.sha256 ?? downloadedSha,
      pdfBuffer: storedPdf ?? undefined,
    });
  });

  if (!started) {
    console.info("[CLASSROOM_RENDER] already_running", { presentationId });
  } else {
    job.catch(async (error) => {
      console.error("[CLASSROOM_RENDER] background_failed", {
        presentationId,
        error: error instanceof Error ? error.message : String(error),
        details: error instanceof AppError ? error.details : undefined,
      });
      const current = await prisma.presentation.findUnique({
        where: { id: presentationId },
        select: { status: true },
      });
      if (current?.status === "rendering") {
        await prisma.presentation.update({
          where: { id: presentationId },
          data: { status: "render_failed" },
        }).catch(() => undefined);
      }
    });
  }

  return {
    presentationId,
    slideCount: expected,
    sourceKey: resolved.key,
    sourceBytes: resolved.bytes,
    code: "CLASSROOM_RENDERING",
    alreadyRunning: !started,
  };
}

export async function renderAndPersistPresentationVisuals(
  presentationId: string,
  pptxBuffer: Buffer,
  options?: {
    skipExisting?: boolean;
    sourceRelative?: string;
    sourceBytes?: number;
    sourceSha256?: string;
    pdfBuffer?: Buffer;
  },
) {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presentationId },
    include: { slides: { orderBy: { order: "asc" } } },
  });
  if (!presentation) {
    throw new AppError(404, "Presentation not found");
  }

  const expected = presentation.slides.length;
  const sourceRelative = options?.sourceRelative ?? canonicalSourceRelative(presentationId);
  const inputSha256 = sha256OfBuffer(pptxBuffer);
  console.info("[CLASSROOM_SOURCE]", {
    presentationId,
    bytes: pptxBuffer.length,
    sha256: inputSha256,
  });
  console.info("[CLASSROOM_RENDER]", {
    presentationId,
    inputBytes: pptxBuffer.length,
    inputSha256,
    sourceBytes: options?.sourceBytes,
    sourceSha256: options?.sourceSha256,
  });
  if (options?.sourceSha256 && options.sourceSha256 !== inputSha256) {
    throw new AppError(500, "Render input SHA-256 does not match the stored PowerPoint source", true, {
      code: "CLASSROOM_RENDER_SOURCE_FAILED",
      stage: "render",
      reason: "SHA256_MISMATCH",
      presentationId,
    });
  }
  const alreadyRendered = new Set<number>();
  if (options?.skipExisting) {
    for (const slide of presentation.slides) {
      const svgRelative = canonicalSlideSvgRelative(presentationId, slide.order);
      const existing = await headFirst(svgRelative);
      if (existing?.meta.contentLength && existing.meta.contentLength > 8_000) {
        alreadyRendered.add(slide.order - 1);
      }
    }
  }

  console.info("[CLASSROOM_RENDER]", {
    presentationId,
    slides: expected,
    skipExisting: alreadyRendered.size,
    renderer: describeClassroomRenderer().renderer,
  });

  const outputDir = path.join(os.tmpdir(), `classroom-render-${presentationId}`);
  const persistedIndexes = new Set<number>(alreadyRendered);
  const persistOne = async (render: { index: number; path: string; svgLength: number; svgText?: string }) => {
    if (persistedIndexes.has(render.index)) return;
    const relative = canonicalSlideSvgRelative(presentationId, render.index + 1);
    const diskPath = path.join(outputDir, path.basename(render.path));
    classroomRenderLogPersist(presentationId, render.index + 1, "b2-upload-start", relative);
    classroomPptxPipelineLog("visual_upload_started", {
      presentationId,
      slideNumber: render.index + 1,
      sourceKey: `uploads/${relative}`,
    });
    let svgText = render.svgText;
    if (!svgText) {
      try {
        svgText = await readFile(diskPath, "utf8");
      } catch {
        const error = new Error(`CLASSROOM_RENDER_INVALID_SVG slide=${render.index + 1} reason=missing on disk`);
        (error as Error & { code?: string }).code = "CLASSROOM_RENDER_INVALID_SVG";
        throw error;
      }
    }
    if (!isValidRenderedSvg(svgText)) {
      const error = new Error(`CLASSROOM_RENDER_INVALID_SVG slide=${render.index + 1}`);
      (error as Error & { code?: string }).code = "CLASSROOM_RENDER_INVALID_SVG";
      throw error;
    }
    await writeFile(diskPath, svgText, "utf8");
    try {
      await withDeadline(
        persistAtPublicRelative(diskPath, relative, SVG_MIME, { keepLocal: !isB2Configured() }),
        B2_UPLOAD_TIMEOUT_MS,
        "CLASSROOM_RENDER_B2_UPLOAD_FAILED",
        `CLASSROOM_RENDER_B2_UPLOAD_FAILED slide=${render.index + 1}`,
      );
    } catch (error) {
      const wrapped = error instanceof Error ? error : new Error(String(error));
      (wrapped as Error & { code?: string }).code =
        (wrapped as Error & { code?: string }).code || "CLASSROOM_RENDER_B2_UPLOAD_FAILED";
      throw wrapped;
    }
    if (isB2Configured()) {
      const stored = await headObject(`uploads/${relative}`);
      if (!stored || !(stored.contentLength && stored.contentLength > 8_000)) {
        const error = new Error(`CLASSROOM_RENDER_B2_VERIFY_FAILED slide=${render.index + 1}`);
        (error as Error & { code?: string }).code = "CLASSROOM_RENDER_B2_VERIFY_FAILED";
        throw error;
      }
      if (stored.contentType && !/svg/i.test(stored.contentType)) {
        const error = new Error(`CLASSROOM_RENDER_B2_VERIFY_FAILED slide=${render.index + 1} reason=contentType=${stored.contentType}`);
        (error as Error & { code?: string }).code = "CLASSROOM_RENDER_B2_VERIFY_FAILED";
        throw error;
      }
      classroomRenderLogPersist(presentationId, render.index + 1, "B2_HEAD_VERIFIED", relative);
      classroomRenderPersistLog(presentationId, render.index + 1, relative, stored.contentLength);
    } else {
      classroomRenderPersistLog(presentationId, render.index + 1, relative, render.svgLength);
    }
    classroomRenderLogPersist(presentationId, render.index + 1, "b2-upload-complete", relative);
    classroomPptxPipelineLog("visual_upload_completed", {
      presentationId,
      slideNumber: render.index + 1,
      sourceKey: `uploads/${relative}`,
    });
    const slide = presentation.slides.find((item) => item.order === render.index + 1);
    if (slide) {
      classroomRenderLogPersist(presentationId, render.index + 1, "db-persist-start", relative);
      await prisma.slide.update({
        where: { id: slide.id },
        data: {
          content: withVisual(slide.content, presentationId, render.index, true) as object,
        },
      });
      classroomRenderLogPersist(presentationId, render.index + 1, "db-persist-complete", relative);
      classroomPptxPipelineLog("slide_persisted", {
        presentationId,
        slideId: slide.id,
        slideNumber: render.index + 1,
      });
    }
    persistedIndexes.add(render.index);
  };

  const missingIndexes = presentation.slides
    .map((slide) => slide.order - 1)
    .filter((index) => !alreadyRendered.has(index));
  const storedPdf = options?.pdfBuffer ?? (await downloadPresentationExportPdf(presentationId)) ?? undefined;
  classroomPptxPipelineLog("source_resolved", {
    presentationId,
    sourceKey: `uploads/${sourceRelative}`,
    originalBytes: pptxBuffer.length,
    pdfBytes: storedPdf?.length,
    pdfSource: storedPdf ? "stored-or-google-pdf" : "libreoffice-pptx",
    slideCount: expected,
  });
  console.info("[CLASSROOM_RENDER]", {
    presentationId,
    pdfSource: storedPdf ? "stored-or-google-pdf" : "libreoffice-pptx",
    pdfBytes: storedPdf?.length,
  });
  const renderResult = missingIndexes.length === 0
    ? { success: true, slideCount: expected, renders: [], warnings: [], errors: [], method: describeClassroomRenderer().renderer }
    : await renderPresentationSlides(pptxBuffer, outputDir, {
      skipIndexes: alreadyRendered,
      onSlideRendered: persistOne,
      presentationId,
      pdfBuffer: storedPdf,
      sourceSha256: options?.sourceSha256 ?? inputSha256,
    });

  if (!storedPdf && renderResult.pdfBuffer) {
    await persistPdfBuffer(presentationId, renderResult.pdfBuffer).catch((error) => {
      console.warn("[CLASSROOM_SOURCE] libreoffice_pdf_persist_failed", {
        presentationId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  try {
    for (const render of renderResult.renders) {
      if (persistedIndexes.has(render.index)) continue;
      try {
        await persistOne(render);
      } catch (error) {
        console.warn("[CLASSROOM_REPAIR] persist_failed", {
          presentationId,
          slide: render.index + 1,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const firstError = renderResult.errors[0]?.slice(0, 220);
    for (const slide of presentation.slides) {
      const hasSvg = persistedIndexes.has(slide.order - 1);
      const failure = hasSvg
        ? undefined
        : {
            code: persistedIndexes.size === 0 ? "CLASSROOM_RENDER_FAILED" : "CLASSROOM_RENDER_SLIDE_FAILED",
            message: firstError || "Slide visual could not be rendered from the PowerPoint source",
          };
      await prisma.slide.update({
        where: { id: slide.id },
        data: {
          content: withVisual(slide.content, presentationId, slide.order - 1, hasSvg, failure) as object,
        },
      });
    }

    const failedSlideNumbers = presentation.slides
      .filter((slide) => !persistedIndexes.has(slide.order - 1))
      .map((slide) => slide.order);
    const status = persistedIndexes.size === expected && expected > 0
      ? "ready"
      : persistedIndexes.size > 0
        ? "rendering_partial"
        : "render_failed";

    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        sourceUrl: canonicalPublicPath(sourceRelative),
        status,
      },
    });

    console.info(
      `[CLASSROOM_RENDER] complete requested=${expected} rendered=${persistedIndexes.size} failed=${failedSlideNumbers.length} skipped=${alreadyRendered.size} status=${status} presentationId=${presentationId}`,
    );
    classroomPptxPipelineLog("render_complete", {
      presentationId,
      overallRenderStatus: status,
      slidesSucceeded: persistedIndexes.size,
      slidesFailed: failedSlideNumbers.length,
      method: renderResult.method,
    });

    if (persistedIndexes.size === 0) {
      throw new AppError(500, "Slide visuals could not be generated from the PowerPoint source", true, {
        code: "CLASSROOM_RENDER_FAILED",
        stage: "render",
        retryable: true,
        presentationId,
        slidesSucceeded: 0,
        slidesFailed: failedSlideNumbers.length,
        failedSlideNumbers,
        sourceKey: `uploads/${sourceRelative}`,
        method: renderResult.method,
        reason: firstError?.includes("LIBREOFFICE_UNAVAILABLE")
          ? "LIBREOFFICE_UNAVAILABLE"
          : firstError?.includes("LIBREOFFICE_CONVERSION_FAILED")
            ? "LIBREOFFICE_CONVERSION_FAILED"
            : firstError?.includes("PDF_RENDER_FAILED")
              ? "PDF_RENDER_FAILED"
              : firstError?.includes("B2_UPLOAD_FAILED")
                ? "B2_UPLOAD_FAILED"
                : "CLASSROOM_RENDER_FAILED",
        rendererErrors: renderResult.errors.slice(0, 12),
      });
    }

    return {
      presentationId,
      rendered: persistedIndexes.size,
      skipped: alreadyRendered.size,
      slideCount: expected,
      sourceRelative,
      sourceKey: `uploads/${sourceRelative}`,
      sourceBytes: options?.sourceBytes,
      method: renderResult.method,
      code: failedSlideNumbers.length ? "CLASSROOM_RENDER_PARTIAL" : "CLASSROOM_REGENERATE_OK",
      slidesSucceeded: persistedIndexes.size,
      slidesFailed: failedSlideNumbers.length,
      failedSlideNumbers,
      warnings: [...renderResult.warnings, ...renderResult.errors],
    };
  } finally {
    await rm(outputDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
