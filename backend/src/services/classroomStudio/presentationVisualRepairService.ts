import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { isAdminRole } from "../../utils/roles.js";
import { persistAtPublicRelative } from "../../middlewares/persistUpload.js";
import { resolveSafeUploadPath } from "../../middlewares/uploadAccess.js";
import { headObject, isB2Configured } from "../b2StorageService.js";
import {
  B2_UPLOAD_TIMEOUT_MS,
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
  PNG_MIME,
  buildSlideVisual,
  canonicalPublicPath,
  canonicalSlidePngApi,
  canonicalSlidePngRelative,
  canonicalSlideSvgRelative,
  canonicalSourceRelative,
  aggregatePresentationRenderStatus,
  isStaleSlideRenderWrite,
  isOriginalVisualSource,
  readSlideVisual,
  slideVisualIsInFlight,
  slideVisualIsReady,
  type SlideRenderStatus,
} from "./classroomAssetPath.js";
import { assertRenderablePng } from "./presentationLibreOfficeRender.js";
import { classroomPptxPipelineLog } from "./classroomPipelineLog.js";
import {
  CLASSROOM_RENDERER_VERSION,
  classifyClassroomRenderError,
  renderPresentation,
  type SlidePng,
} from "./presentationRenderer.js";

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
  hasRenderedImage: boolean,
  error?: { code?: string; message?: string },
  extra?: {
    renderStatus?: SlideRenderStatus;
    sourceHash?: string;
    jobId?: string;
    attempt?: number;
    renderGeneration?: number;
  },
): Record<string, unknown> {
  const base =
    content && typeof content === "object" && !Array.isArray(content)
      ? { ...(content as Record<string, unknown>) }
      : {};
  const existing = readSlideVisual(content);
  if (isOriginalVisualSource(existing)) {
    if (hasRenderedImage) {
      base.visual = {
        ...existing,
        renderedImageUrl: canonicalSlidePngApi(presentationId, slideIndex + 1),
        thumbnailUrl: canonicalSlidePngApi(presentationId, slideIndex + 1),
        availability: "available",
        renderStatus: "ready",
        sourceHash: extra?.sourceHash ?? existing.sourceHash,
        jobId: extra?.jobId ?? existing.jobId,
        attempt: extra?.attempt ?? existing.attempt,
        renderGeneration: extra?.renderGeneration ?? existing.renderGeneration,
      };
      return base;
    }
    if (extra?.renderStatus === "rendering" || extra?.renderStatus === "failed") {
      return base;
    }
  }
  base.visual = buildSlideVisual(presentationId, slideIndex, hasRenderedImage, error, {
    ...extra,
    rendererVersion: CLASSROOM_RENDERER_VERSION,
  });
  return base;
}

export type ClassroomRenderJobRecord = {
  jobId: string;
  presentationId: string;
  slideIndex: number | null;
  sourceType: string;
  status: "PENDING" | "RENDERING" | "READY" | "FAILED";
  startedAt: string;
  completedAt?: string;
  error?: string;
  attempt: number;
  generation: number;
};

const renderJobs = new Map<string, ClassroomRenderJobRecord>();

export function getClassroomRenderJob(presentationId: string): ClassroomRenderJobRecord | null {
  return renderJobs.get(presentationId) ?? null;
}

function upsertRenderJob(presentationId: string, patch: Partial<ClassroomRenderJobRecord>): ClassroomRenderJobRecord {
  const existing = renderJobs.get(presentationId);
  const next: ClassroomRenderJobRecord = {
    jobId: patch.jobId || existing?.jobId || randomUUID(),
    presentationId,
    slideIndex: patch.slideIndex ?? existing?.slideIndex ?? null,
    sourceType: patch.sourceType || existing?.sourceType || "powerpoint",
    status: patch.status || existing?.status || "PENDING",
    startedAt: patch.startedAt || existing?.startedAt || new Date().toISOString(),
    completedAt: patch.completedAt ?? existing?.completedAt,
    error: patch.error ?? existing?.error,
    attempt: patch.attempt ?? existing?.attempt ?? 1,
    generation: patch.generation ?? existing?.generation ?? 0,
  };
  renderJobs.set(presentationId, next);
  console.info("[CLASSROOM_RENDER_JOB]", next);
  return next;
}

const inflightVisualRenders = new Map<string, Promise<unknown>>();
const renderGenerations = new Map<string, number>();

export type ClassroomRenderStage =
  | "PPTX_DOWNLOAD"
  | "PPTX_VALIDATION"
  | "PPTX_TO_PDF"
  | "PDF_TO_IMAGES"
  | "VISUAL_UPLOAD"
  | "COMPLETE"
  | "FAILED";

export type ClassroomRenderJobProgress = {
  stage: ClassroomRenderStage;
  currentSlide: number;
  totalSlides: number;
};

const visualRenderProgress = new Map<string, ClassroomRenderJobProgress>();

export function getVisualRenderProgress(presentationId: string): ClassroomRenderJobProgress | null {
  return visualRenderProgress.get(presentationId) ?? null;
}

export function setVisualRenderProgress(presentationId: string, progress: ClassroomRenderJobProgress): void {
  visualRenderProgress.set(presentationId, progress);
  console.info("[CLASSROOM_PPTX]", {
    presentationId,
    stage: progress.stage,
    currentSlide: progress.currentSlide,
    totalSlides: progress.totalSlides,
  });
}

export function isExclusiveVisualRenderRunning(presentationId: string): boolean {
  return inflightVisualRenders.has(presentationId);
}

export function getRenderGeneration(presentationId: string): number {
  return renderGenerations.get(presentationId) ?? 0;
}

export function startExclusiveVisualRender(
  presentationId: string,
  work: () => Promise<unknown>,
): { started: boolean; job: Promise<unknown>; generation: number } {
  const existing = inflightVisualRenders.get(presentationId);
  if (existing) {
    return { started: false, job: existing, generation: getRenderGeneration(presentationId) };
  }
  const generation = getRenderGeneration(presentationId) + 1;
  renderGenerations.set(presentationId, generation);
  const running = Promise.resolve().then(() => work());
  inflightVisualRenders.set(presentationId, running);
  running.finally(() => {
    if (inflightVisualRenders.get(presentationId) === running) {
      inflightVisualRenders.delete(presentationId);
    }
  });
  return { started: true, job: running, generation };
}

function logRenderState(args: {
  presentationId: string;
  slide?: number;
  from?: string;
  to: string;
  reason?: string;
  imageUrl?: string;
  jobId?: string;
}) {
  console.info("[CLASSROOM_RENDER_STATE]", {
    presentation: args.presentationId,
    slide: args.slide ?? null,
    from: args.from ?? null,
    to: args.to,
    reason: args.reason ?? null,
    imageUrl: args.imageUrl ?? null,
    jobId: args.jobId ?? null,
  });
}

async function writePresentationStatusIfCurrentJob(args: {
  presentationId: string;
  jobId?: string;
  generation?: number;
  status: string;
  reason: string;
}) {
  const current = getClassroomRenderJob(args.presentationId);
  if (args.jobId && current?.jobId && current.jobId !== args.jobId) {
    logRenderState({
      presentationId: args.presentationId,
      from: current.status,
      to: args.status,
      reason: "stale_job_skipped_presentation_status",
      jobId: args.jobId,
    });
    return;
  }
  if (args.generation && current?.generation && current.generation > args.generation) {
    logRenderState({
      presentationId: args.presentationId,
      from: current.status,
      to: args.status,
      reason: "stale_generation_skipped_presentation_status",
      jobId: args.jobId,
    });
    return;
  }
  let nextStatus = args.status;
  if (nextStatus !== "ready") {
    const presentation = await prisma.presentation.findUnique({
      where: { id: args.presentationId },
      select: { sourceType: true },
    });
    if (presentation?.sourceType === "powerpoint" || presentation?.sourceType === "google_slides") {
      nextStatus = "ready";
    } else {
      const slides = await prisma.slide.findMany({
        where: { presentationId: args.presentationId },
        select: { content: true },
      });
      if (
        slides.length > 0
        && slides.every((slide) => isOriginalVisualSource(readSlideVisual(slide.content)))
      ) {
        nextStatus = "ready";
      }
    }
  }
  logRenderState({
    presentationId: args.presentationId,
    from: current?.status,
    to: nextStatus,
    reason: args.reason,
    jobId: args.jobId ?? current?.jobId,
  });
  await prisma.presentation.update({
    where: { id: args.presentationId },
    data: { status: nextStatus },
  }).catch(() => undefined);
}

export async function finalizeFailedRenderJob(args: {
  presentationId: string;
  jobId?: string;
  generation?: number;
  expected: number;
  error: unknown;
}) {
  const current = getClassroomRenderJob(args.presentationId);
  if (args.jobId && current?.jobId && current.jobId !== args.jobId) return;
  const slides = await prisma.slide.findMany({
    where: { presentationId: args.presentationId },
    orderBy: { order: "asc" },
  });
  const failure = {
    code: classifyClassroomRenderError(args.error),
    message: args.error instanceof Error ? args.error.message.slice(0, 400) : String(args.error),
  };
  for (const slide of slides) {
    if (!slideVisualIsInFlight(slide.content)) continue;
    const existing = readSlideVisual(slide.content);
    if (isStaleSlideRenderWrite(existing, {
      jobId: args.jobId || current?.jobId,
      attempt: current?.attempt,
      renderGeneration: args.generation ?? current?.generation,
      renderStatus: "failed",
    })) continue;
    logRenderState({
      presentationId: args.presentationId,
      slide: slide.order,
      from: existing?.renderStatus || "RENDERING",
      to: "FAILED",
      reason: failure.code,
      jobId: args.jobId || current?.jobId,
    });
    await prisma.slide.update({
      where: { id: slide.id },
      data: {
        content: withVisual(slide.content, args.presentationId, slide.order - 1, false, failure, {
          renderStatus: "failed",
          jobId: args.jobId || current?.jobId,
          attempt: current?.attempt,
          renderGeneration: args.generation ?? current?.generation,
        }) as object,
      },
    });
  }
  const refreshed = await prisma.slide.findMany({
    where: { presentationId: args.presentationId },
    orderBy: { order: "asc" },
  });
  const status = aggregatePresentationRenderStatus({
    slides: refreshed,
    exclusiveRunning: false,
    jobStatus: "FAILED",
  });
  setVisualRenderProgress(args.presentationId, {
    stage: status === "render_failed" ? "FAILED" : "COMPLETE",
    currentSlide: refreshed.filter((slide) => slideVisualIsReady(slide.content)).length,
    totalSlides: args.expected,
  });
  await writePresentationStatusIfCurrentJob({
    presentationId: args.presentationId,
    jobId: args.jobId,
    generation: args.generation,
    status,
    reason: args.error instanceof Error ? args.error.message.slice(0, 240) : String(args.error),
  });
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
    const pngRelative = canonicalSlidePngRelative(presentationId, slide.order);
    const svgRelative = canonicalSlideSvgRelative(presentationId, slide.order);
    const pngHit = await headFirst(pngRelative);
    const svgHit = pngHit ? null : await headFirst(svgRelative);
    slideReports.push({
      slideId: slide.id,
      order: slide.order,
      visualType: visual?.type ?? null,
      visualSrc: typeof visual?.src === "string" ? visual.src : null,
      pngRelative,
      pngFound: Boolean(pngHit),
      pngBytes: pngHit?.meta.contentLength ?? null,
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

  const googleEmbedReady = presentation.sourceType === "google_slides"
    && presentation.slides.some((slide) => readSlideVisual(slide.content)?.visualSource === "google_embed");
  if (googleEmbedReady || (presentation.sourceType === "google_slides" && presentation.slides.every((slide) => isOriginalVisualSource(readSlideVisual(slide.content))))) {
    return {
      presentationId,
      skipped: true,
      reason: "google_embed",
      slideCount: presentation.slides.length,
    };
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
  console.info("[CLASSROOM_RENDER]", {
    presentationId,
    renderer: CLASSROOM_RENDERER_VERSION,
    sourceType: presentation.sourceType,
  });

  const expected = presentation.slides.length;
  const originalSourceReady = presentation.slides.length > 0
    && presentation.slides.every((slide) => isOriginalVisualSource(readSlideVisual(slide.content)));
  const canonicalRelative = canonicalSourceRelative(presentationId);
  console.info("[CLASSROOM_RENDER]", {
    presentationId,
    slides: expected,
    sourceKey: resolved.key,
    sourceBytes: resolved.bytes,
    reuseSource: resolved.relative === canonicalRelative,
  });
  if (!originalSourceReady) {
    await prisma.presentation.update({
      where: { id: presentationId },
      data: { status: "rendering" },
    });
  }

  const { started, job, generation } = startExclusiveVisualRender(presentationId, async () => {
    setVisualRenderProgress(presentationId, {
      stage: "PPTX_DOWNLOAD",
      currentSlide: 0,
      totalSlides: expected,
    });
    const pptxBuffer = await downloadPresentationPptx(resolved);
    const downloadedSha = sha256OfBuffer(pptxBuffer);
    const storedPdf =
      presentation.sourceType === "google_slides" ? await downloadPresentationExportPdf(presentationId) : null;
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
      renderGeneration: getRenderGeneration(presentationId),
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
      await finalizeFailedRenderJob({
        presentationId,
        expected,
        error,
        generation,
      });
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

async function persistRenderedPng(args: {
  presentationId: string;
  slideOrder: number;
  png: Buffer;
  sourceHash: string;
  jobId: string;
  attempt?: number;
  renderGeneration?: number;
}): Promise<void> {
  const dims = assertRenderablePng(args.png);
  const relative = canonicalSlidePngRelative(args.presentationId, args.slideOrder);
  const dest = resolveSafeUploadPath(relative);
  if (!dest) {
    const error = new Error(`IMAGE_STORAGE_FAILED invalid path slide=${args.slideOrder}`);
    (error as Error & { code?: string }).code = "IMAGE_STORAGE_FAILED";
    throw error;
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, args.png);
  classroomRenderLogPersist(args.presentationId, args.slideOrder, "b2-upload-start", relative);
  try {
    await withDeadline(
      persistAtPublicRelative(dest, relative, PNG_MIME, { keepLocal: true }),
      B2_UPLOAD_TIMEOUT_MS,
      "IMAGE_STORAGE_FAILED",
      `IMAGE_STORAGE_FAILED slide=${args.slideOrder}`,
    );
  } catch (error) {
    const wrapped = error instanceof Error ? error : new Error(String(error));
    (wrapped as Error & { code?: string }).code = "IMAGE_STORAGE_FAILED";
    throw wrapped;
  }
  const local = await stat(dest).catch(() => null);
  const imageUrl = canonicalSlidePngApi(args.presentationId, args.slideOrder);
  let storedBytes = local?.size ?? args.png.length;
  if (isB2Configured()) {
    const stored = await headObject(`uploads/${relative}`);
    if (!stored || !(stored.contentLength && stored.contentLength > 8_000)) {
      const error = new Error(`IMAGE_STORAGE_FAILED slide=${args.slideOrder} B2 verify failed`);
      (error as Error & { code?: string }).code = "IMAGE_STORAGE_FAILED";
      throw error;
    }
    storedBytes = stored.contentLength;
    classroomRenderPersistLog(args.presentationId, args.slideOrder, relative, stored.contentLength);
  } else {
    classroomRenderPersistLog(args.presentationId, args.slideOrder, relative, args.png.length);
  }
  const verified = Boolean(local && local.size > 0 && args.png.length > 0);
  console.info("[CLASSROOM_RENDER_VERIFY]", {
    slide: args.slideOrder,
    imageExists: Boolean(local),
    imageSize: storedBytes,
    imageUrl,
    verified,
    presentationId: args.presentationId,
  });
  if (!verified) {
    const error = new Error(`IMAGE_STORAGE_FAILED slide=${args.slideOrder} local image missing after persist`);
    (error as Error & { code?: string }).code = "IMAGE_STORAGE_FAILED";
    throw error;
  }
  const slide = await prisma.slide.findFirst({
    where: { presentationId: args.presentationId, order: args.slideOrder },
  });
  if (slide) {
    const existing = readSlideVisual(slide.content);
    if (isStaleSlideRenderWrite(existing, {
      jobId: args.jobId,
      attempt: args.attempt,
      renderGeneration: args.renderGeneration,
      renderStatus: "ready",
    })) {
      logRenderState({
        presentationId: args.presentationId,
        slide: args.slideOrder,
        from: existing?.renderStatus,
        to: "READY",
        reason: "stale_job_skipped_ready",
        imageUrl,
        jobId: args.jobId,
      });
      return;
    }
    logRenderState({
      presentationId: args.presentationId,
      slide: args.slideOrder,
      from: existing?.renderStatus || "RENDERING",
      to: "READY",
      reason: "image_stored_verified",
      imageUrl,
      jobId: args.jobId,
    });
    await prisma.slide.update({
      where: { id: slide.id },
      data: {
        thumbnail: imageUrl,
        content: withVisual(slide.content, args.presentationId, args.slideOrder - 1, true, undefined, {
          renderStatus: "ready",
          sourceHash: args.sourceHash,
          jobId: args.jobId,
          attempt: args.attempt,
          renderGeneration: args.renderGeneration,
        }) as object,
      },
    });
  }
  console.info("[CLASSROOM_RENDER_SLIDE]", {
    slide: args.slideOrder,
    pngGenerated: true,
    pngSize: args.png.length,
    width: dims.width,
    height: dims.height,
    storageSuccess: true,
    presentationId: args.presentationId,
  });
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
    pages?: number[];
    jobId?: string;
    attempt?: number;
    renderGeneration?: number;
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
  const job = upsertRenderJob(presentationId, {
    jobId: options?.jobId,
    sourceType: presentation.sourceType,
    status: "RENDERING",
    slideIndex: options?.pages?.[0] ?? null,
    attempt: options?.attempt,
    generation: options?.renderGeneration ?? getRenderGeneration(presentationId),
    startedAt: new Date().toISOString(),
  });
  console.info("[CLASSROOM_SOURCE]", {
    presentationId,
    bytes: pptxBuffer.length,
    sha256: inputSha256,
  });
  if (options?.sourceSha256 && options.sourceSha256 !== inputSha256) {
    upsertRenderJob(presentationId, { status: "FAILED", error: "SOURCE_INVALID hash mismatch", completedAt: new Date().toISOString() });
    throw new AppError(500, "Render input SHA-256 does not match the stored PowerPoint source", true, {
      code: "SOURCE_INVALID",
      stage: "render",
      reason: "SHA256_MISMATCH",
      presentationId,
    });
  }

  const alreadyRendered = new Set<number>();
  if (options?.skipExisting) {
    for (const slide of presentation.slides) {
      const visual = (slide.content as { visual?: { sourceHash?: string; rendererVersion?: string; renderStatus?: string } } | null)?.visual;
      const pngRelative = canonicalSlidePngRelative(presentationId, slide.order);
      const existingPng = await headFirst(pngRelative);
      if (existingPng?.meta.contentLength && existingPng.meta.contentLength > 8_000) {
        const reusable = !visual?.sourceHash
          || (visual.sourceHash === inputSha256 && visual.rendererVersion === CLASSROOM_RENDERER_VERSION);
        if (reusable) alreadyRendered.add(slide.order - 1);
      }
    }
  }

  const requestedPages = (options?.pages?.length
    ? options.pages
    : presentation.slides.map((slide) => slide.order)
  ).filter((page) => page >= 1 && !alreadyRendered.has(page - 1));
  requestedPages.sort((a, b) => a - b);
  if (requestedPages.includes(1)) {
    requestedPages.splice(requestedPages.indexOf(1), 1);
    requestedPages.unshift(1);
  }

  for (const slide of presentation.slides) {
    if (alreadyRendered.has(slide.order - 1) || (options?.pages && !options.pages.includes(slide.order))) continue;
    const existing = readSlideVisual(slide.content);
    if (isOriginalVisualSource(existing)) continue;
    if (isStaleSlideRenderWrite(existing, {
      jobId: job.jobId,
      attempt: job.attempt,
      renderGeneration: job.generation,
      renderStatus: "rendering",
    })) continue;
    logRenderState({
      presentationId,
      slide: slide.order,
      from: existing?.renderStatus || "PENDING",
      to: "RENDERING",
      reason: "job_started",
      jobId: job.jobId,
    });
    await prisma.slide.update({
      where: { id: slide.id },
      data: {
        content: withVisual(slide.content, presentationId, slide.order - 1, false, undefined, {
          renderStatus: "rendering",
          sourceHash: inputSha256,
          jobId: job.jobId,
          attempt: job.attempt,
          renderGeneration: job.generation,
        }) as object,
      },
    });
  }

  const storedPdf =
    options?.pdfBuffer
    ?? (presentation.sourceType === "google_slides" ? await downloadPresentationExportPdf(presentationId) : null)
    ?? await downloadPresentationExportPdf(presentationId);
  setVisualRenderProgress(presentationId, {
    stage: storedPdf ? "PDF_TO_IMAGES" : "PPTX_TO_PDF",
    currentSlide: requestedPages[0] ?? 0,
    totalSlides: expected,
  });

  const persistImages = async (images: SlidePng[]) => {
    for (const image of images) {
      setVisualRenderProgress(presentationId, {
        stage: "VISUAL_UPLOAD",
        currentSlide: image.page,
        totalSlides: expected,
      });
      try {
        await persistRenderedPng({
          presentationId,
          slideOrder: image.page,
          png: image.buffer,
          sourceHash: inputSha256,
          jobId: job.jobId,
          attempt: job.attempt,
          renderGeneration: job.generation,
        });
        alreadyRendered.add(image.page - 1);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[CLASSROOM_RENDER_ERROR]", {
          presentationId,
          slide: image.page,
          stage: "IMAGE_STORAGE",
          error: message.slice(0, 800),
        });
        const slide = presentation.slides.find((item) => item.order === image.page);
        if (slide) {
          const latest = await prisma.slide.findUnique({ where: { id: slide.id } });
          const existing = readSlideVisual(latest?.content);
          if (isStaleSlideRenderWrite(existing, {
            jobId: job.jobId,
            attempt: job.attempt,
            renderGeneration: job.generation,
            renderStatus: "failed",
          })) {
            continue;
          }
          logRenderState({
            presentationId,
            slide: image.page,
            from: existing?.renderStatus || "RENDERING",
            to: "FAILED",
            reason: classifyClassroomRenderError(error),
            jobId: job.jobId,
          });
          await prisma.slide.update({
            where: { id: slide.id },
            data: {
              content: withVisual(slide.content, presentationId, image.page - 1, false, {
                code: classifyClassroomRenderError(error),
                message,
              }, {
                renderStatus: "failed",
                sourceHash: inputSha256,
                jobId: job.jobId,
                attempt: job.attempt,
                renderGeneration: job.generation,
              }) as object,
            },
          });
        }
      }
    }
  };

  const errors: string[] = [];
  const warnings: string[] = [];
  let method = "libreoffice-pdf";
  let canonicalPdf = storedPdf ?? undefined;

  if (requestedPages.length > 0) {
    const firstPages = requestedPages[0] === 1 ? [1] : [requestedPages[0]];
    const restPages = requestedPages.filter((page) => !firstPages.includes(page));
    const firstResult = await renderPresentation({
      presentationId,
      pptxBuffer,
      pdfBuffer: canonicalPdf,
      expectedSlideCount: expected,
      pages: firstPages,
      sourceHash: inputSha256,
    });
    method = firstResult.provider;
    errors.push(...firstResult.errors);
    warnings.push(...firstResult.warnings);
    if (firstResult.pdf?.buffer) {
      canonicalPdf = firstResult.pdf.buffer;
      await persistPdfBuffer(presentationId, firstResult.pdf.buffer).catch((error) => {
        console.warn("[CLASSROOM_SOURCE] canonical_pdf_persist_failed", {
          presentationId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
    await persistImages(firstResult.images);

    if (restPages.length && canonicalPdf) {
      const restResult = await renderPresentation({
        presentationId,
        pptxBuffer,
        pdfBuffer: canonicalPdf,
        expectedSlideCount: expected,
        pages: restPages,
        sourceHash: inputSha256,
      });
      method = restResult.provider;
      errors.push(...restResult.errors);
      warnings.push(...restResult.warnings);
      await persistImages(restResult.images);
    } else if (restPages.length && !canonicalPdf) {
      errors.push("PDF_GENERATION_FAILED canonical PDF unavailable for remaining slides");
    }
  }

  const refreshed = await prisma.slide.findMany({
    where: { presentationId },
    orderBy: { order: "asc" },
  });
  const targetedOrders = new Set(options?.pages?.length ? options.pages : refreshed.map((slide) => slide.order));
  const readyIndexes = new Set<number>();
  for (const slide of refreshed) {
    const existing = readSlideVisual(slide.content);
    if (existing?.renderStatus === "ready" || existing?.availability === "available" || alreadyRendered.has(slide.order - 1)) {
      readyIndexes.add(slide.order - 1);
      continue;
    }
    if (!targetedOrders.has(slide.order)) continue;
    if (isStaleSlideRenderWrite(existing, {
      jobId: job.jobId,
      attempt: job.attempt,
      renderGeneration: job.generation,
      renderStatus: "failed",
    })) {
      continue;
    }
    const failure = {
      code: errors.some((item) => /PAGE_COUNT_MISMATCH/.test(item))
        ? "PDF_PAGE_COUNT_MISMATCH"
        : (readyIndexes.size === 0 ? "CLASSROOM_RENDER_FAILED" : "CLASSROOM_RENDER_SLIDE_FAILED"),
      message: errors[0] || "Slide visual could not be rendered from the original presentation",
    };
    logRenderState({
      presentationId,
      slide: slide.order,
      from: existing?.renderStatus || "RENDERING",
      to: "FAILED",
      reason: failure.code,
      jobId: job.jobId,
    });
    await prisma.slide.update({
      where: { id: slide.id },
      data: {
        content: withVisual(slide.content, presentationId, slide.order - 1, false, failure, {
          renderStatus: "failed",
          sourceHash: inputSha256,
          jobId: job.jobId,
          attempt: job.attempt,
          renderGeneration: job.generation,
        }) as object,
      },
    });
  }

  const afterWrites = await prisma.slide.findMany({
    where: { presentationId },
    orderBy: { order: "asc" },
  });
  for (const slide of afterWrites) {
    if (slideVisualIsReady(slide.content) || alreadyRendered.has(slide.order - 1)) {
      readyIndexes.add(slide.order - 1);
    }
  }
  const failedSlideNumbers = afterWrites
    .filter((slide) => targetedOrders.has(slide.order) && !readyIndexes.has(slide.order - 1) && !slideVisualIsInFlight(slide.content))
    .map((slide) => slide.order);
  const status = aggregatePresentationRenderStatus({
    slides: afterWrites.map((slide) => ({
      content: readyIndexes.has(slide.order - 1)
        ? { visual: { renderStatus: "ready", availability: "available" } }
        : slide.content,
    })),
    exclusiveRunning: false,
    jobStatus: "READY",
  });

  await writePresentationStatusIfCurrentJob({
    presentationId,
    jobId: job.jobId,
    generation: job.generation,
    status,
    reason: "job_complete",
  });
  await prisma.presentation.update({
    where: { id: presentationId },
    data: {
      ...(presentation.sourceType === "google_slides" ? {} : { sourceUrl: canonicalPublicPath(sourceRelative) }),
      thumbnail: readyIndexes.has(0) ? canonicalSlidePngApi(presentationId, 1) : undefined,
    },
  }).catch(() => undefined);
  upsertRenderJob(presentationId, {
    status: status === "ready" ? "READY" : status === "render_failed" ? "FAILED" : "RENDERING",
    completedAt: status === "rendering_partial" ? undefined : new Date().toISOString(),
    error: errors[0],
  });
  setVisualRenderProgress(presentationId, {
    stage: status === "render_failed" ? "FAILED" : "COMPLETE",
    currentSlide: readyIndexes.size,
    totalSlides: expected,
  });
  console.info("[CLASSROOM_RENDER_COMPLETE]", {
    presentationId,
    slidesReady: readyIndexes.size,
    failed: failedSlideNumbers.length,
    status,
    method,
  });

  return {
    presentationId,
    rendered: readyIndexes.size,
    skipped: alreadyRendered.size,
    slideCount: expected,
    sourceRelative,
    sourceKey: `uploads/${sourceRelative}`,
    sourceBytes: options?.sourceBytes,
    method,
    code: status === "ready"
      ? "CLASSROOM_REGENERATE_OK"
      : status === "rendering_partial"
        ? "CLASSROOM_RENDER_PARTIAL"
        : "CLASSROOM_RENDER_FAILED",
    slidesSucceeded: readyIndexes.size,
    slidesFailed: failedSlideNumbers.length,
    failedSlideNumbers,
    warnings: [...warnings, ...errors],
    errors,
    jobId: job.jobId,
  };
}

export async function retrySlideVisual(
  presentationId: string,
  slideId: string,
  actorUserId: string,
  actorRole?: string,
) {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presentationId },
    include: { slides: { orderBy: { order: "asc" } } },
  });
  if (!presentation) throw new AppError(404, "Presentation not found");
  if (presentation.instructorId !== actorUserId && !isAdminRole(actorRole)) {
    throw new AppError(403, "You do not have access to this presentation", true, {
      code: "CLASSROOM_ASSET_FORBIDDEN",
      stage: "auth",
    });
  }
  const slide = presentation.slides.find((item) => item.id === slideId);
  if (!slide) throw new AppError(404, "Slide not found");

  if (slideVisualIsReady(slide.content)) {
    return {
      presentationId,
      rendered: 1,
      skipped: 1,
      slideCount: presentation.slides.length,
      code: "CLASSROOM_REGENERATE_OK",
      slidesSucceeded: 1,
      slidesFailed: 0,
      failedSlideNumbers: [],
      alreadyReady: true,
    };
  }
  if (slideVisualIsInFlight(slide.content) && isExclusiveVisualRenderRunning(presentationId)) {
    return {
      presentationId,
      rendered: 0,
      skipped: 0,
      slideCount: presentation.slides.length,
      code: "CLASSROOM_RENDERING",
      alreadyRunning: true,
      slidesSucceeded: 0,
      slidesFailed: 0,
      failedSlideNumbers: [],
    };
  }

  const resolved = await resolvePresentationSource(presentationId);
  if (!resolved.ok) {
    throw new AppError(404, "The original PowerPoint file was not found in storage", true, {
      code: "SOURCE_NOT_FOUND",
      stage: "source-lookup",
    });
  }
  const pptxBuffer = await downloadPresentationPptx(resolved);
  const pdfBuffer = await downloadPresentationExportPdf(presentationId);
  const visual = readSlideVisual(slide.content);
  const attempt = (visual?.attempt || 0) + 1;
  await prisma.slide.update({
    where: { id: slide.id },
    data: {
      content: withVisual(slide.content, presentationId, slide.order - 1, false, undefined, {
        renderStatus: "rendering",
        attempt,
        renderGeneration: getRenderGeneration(presentationId) + 1,
      }) as object,
    },
  });
  const { started, job } = startExclusiveVisualRender(presentationId, () =>
    renderAndPersistPresentationVisuals(presentationId, pptxBuffer, {
      skipExisting: false,
      pages: [slide.order],
      pdfBuffer: pdfBuffer ?? undefined,
      sourceSha256: sha256OfBuffer(pptxBuffer),
      attempt,
      renderGeneration: getRenderGeneration(presentationId),
    }),
  );
  if (!started) {
    return {
      presentationId,
      rendered: 0,
      skipped: 0,
      slideCount: presentation.slides.length,
      code: "CLASSROOM_RENDERING",
      alreadyRunning: true,
      slidesSucceeded: 0,
      slidesFailed: 0,
      failedSlideNumbers: [],
    };
  }
  return await job as Awaited<ReturnType<typeof renderAndPersistPresentationVisuals>>;
}
