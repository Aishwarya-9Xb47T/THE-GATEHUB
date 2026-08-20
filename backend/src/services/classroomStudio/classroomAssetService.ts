import type { Response } from "express";
import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { type Role } from "../../utils/roles.js";
import { getObjectStream, listObjectKeys } from "../b2StorageService.js";
import { applyUploadCorsHeaders, serveStoredUpload, streamLocalUpload } from "../../middlewares/persistUpload.js";
import { classroomAssetLookupRelatives } from "./classroomAssetUrls.js";
import { classroomAssetAccessDecision } from "./classroomAssetAccess.js";
import { getPresentationOriginalSource } from "./classroomSourceResolver.js";
import {
  CLASSROOM_SOURCE_REST,
  PPTX_MIME,
  classroomAssetMime,
  classroomStorageRelatives,
  requestedAssetBasename,
  sanitizeClassroomAssetRest,
} from "./classroomAssetPath.js";

function classroomListPrefixes(presentationId: string): string[] {
  return [
    `uploads/classroom/${presentationId}/`,
    `uploads/classroom-studio/${presentationId}/`,
  ];
}

function keyMatchesRequested(key: string, rest: string): boolean {
  const normalizedKey = key.replace(/\\/g, "/");
  const wanted = sanitizeClassroomAssetRest(rest);
  if (!wanted) return false;
  if (normalizedKey.endsWith(`/${wanted}`) || normalizedKey.endsWith(wanted)) return true;
  const base = requestedAssetBasename(wanted);
  if (base && normalizedKey.endsWith(`/${base}`)) return true;
  const slide = wanted.match(/slide-(\d+)\.(svg|png)$/i);
  if (slide) {
    const n = Number(slide[1]);
    const ext = slide[2].toLowerCase();
    const other = ext === "png" ? "svg" : "png";
    for (const suffix of [
      `slide-${String(n).padStart(3, "0")}.${ext}`,
      `slide-${n}.${ext}`,
      `slide-${String(n).padStart(3, "0")}.${other}`,
      `slide-${n}.${other}`,
    ]) {
      if (normalizedKey.endsWith(`/${suffix}`)) return true;
    }
  }
  return false;
}

export async function assertCanAccessClassroomPresentation(
  userId: string,
  role: Role | string | undefined,
  presentationId: string,
): Promise<void> {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presentationId },
    select: { id: true, instructorId: true },
  });
  if (!presentation) {
    throw new AppError(404, "Presentation not found", true, {
      code: "ORIGINAL_PPTX_UNAVAILABLE",
      reason: "PRESENTATION_NOT_FOUND",
      stage: "auth",
      presentationId,
    });
  }
  if (classroomAssetAccessDecision({
    userId,
    role,
    instructorId: presentation.instructorId,
    isParticipant: false,
  })) {
    return;
  }

  const participant = await prisma.classroomParticipant.findFirst({
    where: {
      userId,
      session: { presentationId },
    },
    select: { id: true },
  });
  if (!classroomAssetAccessDecision({
    userId,
    role,
    instructorId: presentation.instructorId,
    isParticipant: Boolean(participant),
  })) {
    throw new AppError(403, "Not authorized to access this presentation file", true, {
      code: "CLASSROOM_ASSET_FORBIDDEN",
      stage: "auth",
    });
  }
}

export async function findClassroomAssetRelative(
  presentationId: string,
  rest: string,
): Promise<string | null> {
  const safeRest = sanitizeClassroomAssetRest(rest);
  if (!safeRest) return null;

  for (const prefix of classroomListPrefixes(presentationId)) {
    const keys = await listObjectKeys(prefix, 400);
    const hit = keys.find((key) => keyMatchesRequested(key, safeRest));
    if (hit) {
      const relative = hit.replace(/^uploads\//, "");
      console.info("[CLASSROOM_ASSET] resolved_via_list", {
        presentationId,
        requested: safeRest,
        relative,
      });
      return relative;
    }
  }

  return null;
}

export async function streamClassroomPresentationAsset(
  res: Response,
  presentationId: string,
  rest: string,
  options?: { method?: string; origin?: string; range?: string },
): Promise<boolean> {
  const safeRest = sanitizeClassroomAssetRest(rest);
  if (!safeRest) {
    throw new AppError(400, "Invalid presentation asset path", true, {
      code: "CLASSROOM_ASSET_PATH_INVALID",
      stage: "routing",
      reason: "INVALID_STORAGE_PATH",
      presentationId,
    });
  }

  if (safeRest === CLASSROOM_SOURCE_REST || /(^|\/)original\.pptx$/i.test(safeRest)) {
    const source = await getPresentationOriginalSource(presentationId);
    if (!source.exists) {
      throw new AppError(404, "Original PowerPoint was not found in storage", true, {
        code: "ORIGINAL_PPTX_UNAVAILABLE",
        stage: "storage",
        reason: source.reason || "FILE_NOT_FOUND",
        presentationId,
        sourceKey: source.relativeStoragePath,
      });
    }

    if (source.origin === "local" && source.absoluteStoragePath) {
      const streamed = await streamLocalUpload(res, source.absoluteStoragePath, {
        range: options?.range,
        method: options?.method,
        origin: options?.origin,
        mimeType: PPTX_MIME,
        cacheControl: "private, max-age=3600",
      });
      if (streamed) {
        console.info("[CLASSROOM_ASSET] streamed", {
          presentationId,
          relative: source.relativeStoragePath,
          origin: "local",
          status: 200,
        });
        return true;
      }
    }

    if (source.origin === "b2" && source.key) {
      try {
        const b2Range = options?.range;
        const streamed = await getObjectStream(source.key, b2Range);
        applyUploadCorsHeaders(res, options?.origin);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Type", PPTX_MIME);
        res.setHeader("Cache-Control", "private, max-age=3600");
        if (options?.method === "HEAD") {
          res.status(200);
          if (source.size) res.setHeader("Content-Length", String(source.size));
          res.end();
          streamed.body.resume?.();
          console.info("[CLASSROOM_ASSET] streamed", {
            presentationId,
            relative: source.relativeStoragePath,
            origin: "b2",
            status: 200,
            head: 1,
          });
          return true;
        }
        res.status(streamed.status || (b2Range ? 206 : 200));
        if (streamed.contentLength != null) res.setHeader("Content-Length", String(streamed.contentLength));
        if (streamed.contentRange) res.setHeader("Content-Range", streamed.contentRange);
        streamed.body.on("error", (err) => {
          console.error("[CLASSROOM_ASSET] stream_error", {
            presentationId,
            key: source.key,
            message: err instanceof Error ? err.message : "unknown",
          });
          if (!res.headersSent) res.status(502).end();
          else res.destroy();
        });
        streamed.body.pipe(res);
        console.info("[CLASSROOM_ASSET] streamed", {
          presentationId,
          relative: source.relativeStoragePath,
          origin: "b2",
          status: streamed.status || 200,
        });
        return true;
      } catch (error) {
        console.error("[CLASSROOM_ASSET] b2_get_failed", {
          presentationId,
          key: source.key,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new AppError(404, "Original PowerPoint was not found in storage", true, {
          code: "ORIGINAL_PPTX_UNAVAILABLE",
          stage: "storage",
          reason: "FILE_NOT_FOUND",
          presentationId,
          sourceKey: source.relativeStoragePath,
        });
      }
    }
  }

  const relatives = [
    ...classroomStorageRelatives(presentationId, safeRest),
    ...classroomAssetLookupRelatives(`classroom/${presentationId}/${safeRest}`),
  ];

  for (const relative of [...new Set(relatives)]) {
    const streamed = await serveStoredUpload(res, relative, {
      method: options?.method,
      origin: options?.origin,
      range: options?.range,
      mimeType: classroomAssetMime(safeRest),
      cacheControl: /\.(svg|png)$/i.test(safeRest)
        ? "private, max-age=86400"
        : "private, max-age=3600",
    });
    if (streamed) {
      console.info("[CLASSROOM_ASSET] streamed", { presentationId, relative, status: 200 });
      return true;
    }
  }

  const listed = await findClassroomAssetRelative(presentationId, safeRest);
  if (listed) {
    const streamed = await serveStoredUpload(res, listed, {
      method: options?.method,
      origin: options?.origin,
      range: options?.range,
      mimeType: classroomAssetMime(safeRest),
      cacheControl: /\.(svg|png)$/i.test(safeRest)
        ? "private, max-age=86400"
        : "private, max-age=3600",
    });
    if (streamed) return true;
  }

  console.warn("[CLASSROOM_ASSET] missing", { presentationId, requested: safeRest });
  return false;
}
