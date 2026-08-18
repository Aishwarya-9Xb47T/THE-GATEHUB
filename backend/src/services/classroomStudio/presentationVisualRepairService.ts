import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { isAdminRole } from "../../utils/roles.js";
import { persistAtPublicRelative } from "../../middlewares/persistUpload.js";
import { headObject, isB2Configured } from "../b2StorageService.js";
import { renderPresentationSlides } from "./presentationRenderService.js";
import {
  downloadPresentationPptx,
  persistPptxBuffer,
  resolvePresentationSource,
} from "./classroomSourceResolver.js";
import {
  SVG_MIME,
  canonicalPublicPath,
  canonicalSlideSvgRelative,
  canonicalSourceRelative,
} from "./classroomAssetPath.js";

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
  const source = {
    type: "pptx",
    src: canonicalPublicPath(canonicalSourceRelative(presentationId)),
    slideIndex,
  };
  base.visual = hasSvg
    ? {
        type: "svg",
        src: canonicalPublicPath(canonicalSlideSvgRelative(presentationId, slideIndex + 1)),
        slideIndex,
        source,
      }
    : {
        type: "pptx",
        src: canonicalPublicPath(canonicalSourceRelative(presentationId)),
        slideIndex,
      };
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

  const pptxBuffer = await downloadPresentationPptx(resolved);
  const persistedSource = await persistPptxBuffer(presentationId, pptxBuffer);

  const outputDir = path.join(os.tmpdir(), `classroom-repair-${presentationId}`);
  const renderResult = await renderPresentationSlides(pptxBuffer, outputDir);
  const persistedIndexes = new Set<number>();
  const renderErrors = [...renderResult.errors];

  try {
    for (const render of renderResult.renders) {
      const relative = canonicalSlideSvgRelative(presentationId, render.index + 1);
      const diskPath = path.join(outputDir, path.basename(render.path));
      await persistAtPublicRelative(diskPath, relative, SVG_MIME, { keepLocal: true });
      if (isB2Configured()) {
        const stored = await headObject(`uploads/${relative}`);
        if (!stored || !(stored.contentLength && stored.contentLength > 0)) {
          console.warn("[CLASSROOM_REPAIR] svg_not_stored", { presentationId, relative, stage: "svg-upload" });
          continue;
        }
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

    await prisma.presentation.update({
      where: { id: presentationId },
      data: {
        sourceUrl: canonicalPublicPath(persistedSource.relative),
        status: persistedIndexes.size > 0 || persistedSource.bytes > 0 ? "ready" : presentation.status,
      },
    });
  } finally {
    await rm(outputDir, { recursive: true, force: true }).catch(() => undefined);
  }

  const fallback = persistedIndexes.size === 0;
  console.info("[CLASSROOM_REPAIR] complete", {
    presentationId,
    stage: fallback ? "render-fallback" : "render",
    rendered: persistedIndexes.size,
    sourceKey: `uploads/${persistedSource.relative}`,
    fallback: fallback ? "client-pptx-wasm" : undefined,
    renderErrors: renderErrors.slice(0, 3),
  });

  return {
    presentationId,
    rendered: persistedIndexes.size,
    slideCount: renderResult.slideCount || presentation.slides.length,
    sourceRelative: persistedSource.relative,
    sourceKey: `uploads/${persistedSource.relative}`,
    sourceBytes: persistedSource.bytes,
    code: fallback ? "CLASSROOM_RENDER_FALLBACK" : "CLASSROOM_REGENERATE_OK",
    fallback: fallback ? "client-pptx-wasm" : undefined,
    warnings: [
      ...renderResult.warnings,
      ...(fallback
        ? ["Server-side SVG render was unavailable; slides will display from the stored PowerPoint source."]
        : []),
    ],
  };
}
