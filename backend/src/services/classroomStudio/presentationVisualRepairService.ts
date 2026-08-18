import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { isAdminRole } from "../../utils/roles.js";
import { persistAtPublicRelative } from "../../middlewares/persistUpload.js";
import { headObject, isB2Configured } from "../b2StorageService.js";
import {
  describeClassroomRenderer,
  isValidRenderedSvg,
  renderPresentationSlides,
} from "./presentationRenderService.js";
import {
  downloadPresentationPptx,
  persistPptxBuffer,
  resolvePresentationSource,
} from "./classroomSourceResolver.js";
import {
  SVG_MIME,
  buildSlideVisual,
  canonicalPublicPath,
  canonicalSlideSvgRelative,
  canonicalSourceRelative,
} from "./classroomAssetPath.js";

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

function withVisual(
  content: unknown,
  presentationId: string,
  slideIndex: number,
  hasSvg: boolean,
): Record<string, unknown> {
  const base =
    content && typeof content === "object" && !Array.isArray(content)
      ? { ...(content as Record<string, unknown>) }
      : {};
  base.visual = buildSlideVisual(presentationId, slideIndex, hasSvg);
  return base;
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

  const pptxBuffer = await downloadPresentationPptx(resolved);
  const expected = presentation.slides.length;
  const canonicalRelative = canonicalSourceRelative(presentationId);
  console.info("[CLASSROOM_RENDER]", {
    presentationId,
    slides: expected,
    sourceKey: resolved.key,
    sourceBytes: resolved.bytes,
    reuseSource: resolved.relative === canonicalRelative,
  });
  const persistedSource =
    resolved.relative === canonicalRelative
      ? { relative: resolved.relative, bytes: resolved.bytes }
      : await persistPptxBuffer(presentationId, pptxBuffer);

  return renderAndPersistPresentationVisuals(presentationId, pptxBuffer, {
    skipExisting: true,
    sourceRelative: persistedSource.relative,
    sourceBytes: persistedSource.bytes,
  });
}

export async function renderAndPersistPresentationVisuals(
  presentationId: string,
  pptxBuffer: Buffer,
  options?: {
    skipExisting?: boolean;
    sourceRelative?: string;
    sourceBytes?: number;
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
  const alreadyRendered = new Set<number>();
  if (options?.skipExisting) {
    for (const slide of presentation.slides) {
      const svgRelative = canonicalSlideSvgRelative(presentationId, slide.order);
      const existing = await headFirst(svgRelative);
      if (existing?.meta.contentLength && existing.meta.contentLength > 32) {
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
  const missingIndexes = presentation.slides
    .map((slide) => slide.order - 1)
    .filter((index) => !alreadyRendered.has(index));
  const renderResult = missingIndexes.length === 0
    ? { success: true, slideCount: expected, renders: [], warnings: [], errors: [], method: "puppeteer-pptx-svg" as const }
    : await renderPresentationSlides(pptxBuffer, outputDir, { skipIndexes: alreadyRendered });
  const persistedIndexes = new Set<number>(alreadyRendered);

  try {
    for (const render of renderResult.renders) {
      if (persistedIndexes.has(render.index)) continue;
      const relative = canonicalSlideSvgRelative(presentationId, render.index + 1);
      const diskPath = path.join(outputDir, path.basename(render.path));
      let svgText: string;
      try {
        svgText = await readFile(diskPath, "utf8");
      } catch {
        console.warn("[CLASSROOM_REPAIR] svg_missing_on_disk", { presentationId, relative, stage: "svg-validate" });
        continue;
      }
      if (!isValidRenderedSvg(svgText)) {
        console.warn("[CLASSROOM_REPAIR] svg_invalid", { presentationId, relative, stage: "svg-validate", bytes: svgText.length });
        continue;
      }
      await persistAtPublicRelative(diskPath, relative, SVG_MIME, { keepLocal: !isB2Configured() });
      if (isB2Configured()) {
        const stored = await headObject(`uploads/${relative}`);
        if (!stored || !(stored.contentLength && stored.contentLength > 32)) {
          console.warn("[CLASSROOM_REPAIR] svg_not_stored", { presentationId, relative, stage: "svg-upload" });
          continue;
        }
        classroomRenderPersistLog(presentationId, render.index + 1, relative, stored.contentLength);
      } else {
        classroomRenderPersistLog(presentationId, render.index + 1, relative, render.svgLength);
      }
      persistedIndexes.add(render.index);
    }

    for (const slide of presentation.slides) {
      const hasSvg = persistedIndexes.has(slide.order - 1);
      await prisma.slide.update({
        where: { id: slide.id },
        data: {
          content: withVisual(slide.content, presentationId, slide.order - 1, hasSvg) as object,
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
