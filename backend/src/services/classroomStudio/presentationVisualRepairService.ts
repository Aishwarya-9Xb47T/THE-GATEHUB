import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { isAdminRole } from "../../utils/roles.js";
import { hydrateLocalUpload, persistAtPublicRelative } from "../../middlewares/persistUpload.js";
import { headObject, isB2Configured } from "../b2StorageService.js";
import { renderPresentationSlides } from "./presentationRenderService.js";
import { findClassroomAssetRelative } from "./classroomAssetService.js";
import { classroomAssetLookupRelatives } from "./classroomAssetUrls.js";
import {
  CLASSROOM_SOURCE_REST,
  PPTX_MIME,
  SVG_MIME,
  canonicalPublicPath,
  canonicalSlideSvgRelative,
  canonicalSourceRelative,
} from "./classroomAssetPath.js";

async function locateSourcePptx(presentationId: string): Promise<{ relative: string; localPath: string }> {
  const relatives = classroomAssetLookupRelatives(canonicalSourceRelative(presentationId));
  for (const relative of relatives) {
    const localPath = await hydrateLocalUpload(canonicalPublicPath(relative));
    if (localPath) return { relative, localPath };
  }

  const listed = await findClassroomAssetRelative(presentationId, CLASSROOM_SOURCE_REST);
  if (listed) {
    const localPath = await hydrateLocalUpload(canonicalPublicPath(listed));
    if (localPath) return { relative: listed, localPath };
  }

  throw new AppError(404, "PowerPoint source file was not found in storage", true, {
    code: "CLASSROOM_PPTX_NOT_FOUND",
    stage: "storage",
    retryable: false,
  });
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
  for (const candidate of classroomAssetLookupRelatives(relative)) {
    const meta = await headObject(`uploads/${candidate}`);
    if (meta) return { relative: candidate, meta };
  }
  return null;
}

export async function inspectPresentationVisuals(presentationId: string) {
  const sourceRelative = canonicalSourceRelative(presentationId);
  const sourceHit = await headFirst(sourceRelative);
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
    sourceRelative,
    sourceFound: Boolean(sourceHit),
    sourceBytes: sourceHit?.meta.contentLength ?? null,
    sourceContentType: sourceHit?.meta.contentType ?? null,
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

  const located = await locateSourcePptx(presentationId);
  const pptxBuffer = await readFile(located.localPath);
  if (pptxBuffer.length < 4 || pptxBuffer[0] !== 0x50 || pptxBuffer[1] !== 0x4b) {
    throw new AppError(422, "PowerPoint source file is not a valid PPTX", true, {
      code: "CLASSROOM_PPTX_INVALID",
      stage: "validation",
    });
  }

  if (located.relative !== canonicalSourceRelative(presentationId)) {
    await persistAtPublicRelative(located.localPath, canonicalSourceRelative(presentationId), PPTX_MIME, {
      keepLocal: true,
    });
  }

  const outputDir = path.join(os.tmpdir(), `classroom-repair-${presentationId}`);
  const renderResult = await renderPresentationSlides(pptxBuffer, outputDir);
  const persistedIndexes = new Set<number>();

  try {
    for (const render of renderResult.renders) {
      const relative = canonicalSlideSvgRelative(presentationId, render.index + 1);
      const diskPath = path.join(outputDir, path.basename(render.path));
      await persistAtPublicRelative(diskPath, relative, SVG_MIME, { keepLocal: true });
      if (isB2Configured()) {
        const stored = await headObject(`uploads/${relative}`);
        if (!stored) {
          console.warn("[CLASSROOM_REPAIR] svg_not_stored", { presentationId, relative });
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
  } finally {
    await rm(outputDir, { recursive: true, force: true }).catch(() => undefined);
  }

  if (!renderResult.success || persistedIndexes.size === 0) {
    throw new AppError(500, "Slide visuals could not be regenerated from the PowerPoint source", true, {
      code: "CLASSROOM_RENDER_FAILED",
      stage: "render",
      retryable: true,
    });
  }

  console.info("[CLASSROOM_REPAIR] regenerated", {
    presentationId,
    rendered: persistedIndexes.size,
    sourceRelative: canonicalSourceRelative(presentationId),
  });

  return {
    presentationId,
    rendered: persistedIndexes.size,
    slideCount: renderResult.slideCount,
    sourceRelative: canonicalSourceRelative(presentationId),
    warnings: renderResult.warnings,
  };
}
