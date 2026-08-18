import type { Response } from "express";
import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { type Role } from "../../utils/roles.js";
import { listObjectKeys } from "../b2StorageService.js";
import { serveStoredUpload } from "../../middlewares/persistUpload.js";
import { classroomAssetLookupRelatives } from "./classroomAssetUrls.js";
import { classroomAssetAccessDecision } from "./classroomAssetAccess.js";
import {
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
  const slide = wanted.match(/slide-(\d+)\.svg$/i);
  if (slide) {
    const n = Number(slide[1]);
    const padded = `slide-${String(n).padStart(3, "0")}.svg`;
    const short = `slide-${n}.svg`;
    return normalizedKey.endsWith(`/${padded}`) || normalizedKey.endsWith(`/${short}`);
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
    throw new AppError(404, "Presentation not found");
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
  if (!safeRest) return false;

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
      cacheControl: safeRest.endsWith(".svg")
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
      cacheControl: safeRest.endsWith(".svg")
        ? "private, max-age=86400"
        : "private, max-age=3600",
    });
    if (streamed) return true;
  }

  console.warn("[CLASSROOM_ASSET] missing", { presentationId, requested: safeRest });
  return false;
}
