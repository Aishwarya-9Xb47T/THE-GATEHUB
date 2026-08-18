import { mkdtemp, writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { persistAtPublicRelative, hydrateLocalUpload } from "../../middlewares/persistUpload.js";
import { resolveSafeUploadPath } from "../../middlewares/uploadAccess.js";
import {
  downloadObjectToBuffer,
  headObject,
  isB2Configured,
  b2KeyFromPublicPath,
} from "../b2StorageService.js";
import { classroomAssetLookupRelatives } from "./classroomAssetUrls.js";
import {
  CLASSROOM_PREFIX,
  PPTX_MIME,
  canonicalPublicPath,
  canonicalSourceRelative,
} from "./classroomAssetPath.js";

export type ResolvedPresentationSource = {
  ok: true;
  presentationId: string;
  relative: string;
  key: string;
  origin: "b2" | "local";
  bytes: number;
  contentType: string | null;
};

export type MissingPresentationSource = {
  ok: false;
  code: "CLASSROOM_SOURCE_NOT_FOUND";
  stage: "source-lookup";
  presentationId: string;
  keysChecked: string[];
};

export function isValidPptxBuffer(buffer: Buffer | Uint8Array | null | undefined): boolean {
  if (!buffer || buffer.length < 4) return false;
  return buffer[0] === 0x50 && buffer[1] === 0x4b;
}

export function isCompatiblePptxContentType(contentType: string | null | undefined): boolean {
  const type = (contentType || "").toLowerCase();
  if (!type) return true;
  if (type.includes("json") || type.includes("html")) return false;
  return type.includes("presentationml") || type.includes("pptx") || type.includes("octet-stream") || type.includes("zip");
}

export function relativeFromSourceUrl(sourceUrl: string | null | undefined, presentationId: string): string | null {
  if (!sourceUrl) return null;
  const key = b2KeyFromPublicPath(sourceUrl) || (sourceUrl.startsWith("/uploads/") ? `uploads/${sourceUrl.replace(/^\/uploads\//, "").split("?")[0]}` : null);
  if (!key) return null;
  const relative = key.replace(/^uploads\//, "");
  if (!relative.includes(presentationId) || !relative.toLowerCase().endsWith(".pptx")) return null;
  if (relative.split("/").some((part) => part === ".." || part === ".")) return null;
  return relative;
}

export function collectSourceRelatives(presentationId: string, sourceUrl?: string | null): string[] {
  const relatives = classroomAssetLookupRelatives(canonicalSourceRelative(presentationId));
  const fromDb = relativeFromSourceUrl(sourceUrl, presentationId);
  if (fromDb && !relatives.includes(fromDb)) relatives.unshift(fromDb);
  return relatives;
}

function keysForRelative(relative: string): string[] {
  return [`uploads/${relative}`, relative];
}

export function requireDurableClassroomStorage(): void {
  if (process.env.NODE_ENV === "production" && !isB2Configured()) {
    throw new AppError(500, "Classroom media storage is not configured", true, {
      code: "CLASSROOM_STORAGE_NOT_CONFIGURED",
      stage: "storage",
    });
  }
}

export async function persistPptxBuffer(presentationId: string, buffer: Buffer): Promise<{ relative: string; bytes: number }> {
  if (!isValidPptxBuffer(buffer)) {
    throw new AppError(422, "PowerPoint source file is not a valid PPTX", true, {
      code: "CLASSROOM_PPTX_INVALID",
      stage: "validation",
    });
  }
  requireDurableClassroomStorage();
  const relative = canonicalSourceRelative(presentationId);
  if (isB2Configured()) {
    for (const key of [`uploads/${relative}`, relative]) {
      const existing = await headObject(key);
      if (existing?.contentLength && existing.contentLength > 32 && isCompatiblePptxContentType(existing.contentType ?? null)) {
        console.info("[CLASSROOM_SOURCE] reuse_existing", {
          presentationId,
          key,
          bytes: existing.contentLength,
        });
        return { relative, bytes: existing.contentLength };
      }
    }
  }
  if (!isB2Configured()) {
    const dest = resolveSafeUploadPath(relative);
    if (!dest) {
      throw new AppError(500, "Invalid classroom storage path", true, {
        code: "CLASSROOM_ASSET_PATH_INVALID",
        stage: "storage",
      });
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, buffer);
    return { relative, bytes: buffer.length };
  }
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "classroom-pptx-"));
  const tmpPath = path.join(tmpDir, "original.pptx");
  await writeFile(tmpPath, buffer);
  await persistAtPublicRelative(tmpPath, relative, PPTX_MIME, { keepLocal: false });
  if (isB2Configured()) {
    const meta = await headObject(`uploads/${relative}`);
    if (!meta || !(meta.contentLength && meta.contentLength > 0)) {
      throw new AppError(500, "PowerPoint source file was not stored", true, {
        code: "CLASSROOM_SOURCE_UPLOAD_FAILED",
        stage: "source-upload",
      });
    }
    if (!isCompatiblePptxContentType(meta.contentType ?? null)) {
      console.warn("[CLASSROOM_SOURCE] unexpected_content_type", {
        presentationId,
        contentType: meta.contentType,
      });
    }
    return { relative, bytes: meta.contentLength };
  }
  return { relative, bytes: buffer.length };
}

export async function resolvePresentationSource(presentationId: string): Promise<ResolvedPresentationSource | MissingPresentationSource> {
  const presentation = await prisma.presentation.findUnique({
    where: { id: presentationId },
    select: { id: true, sourceUrl: true },
  });
  const relatives = collectSourceRelatives(presentationId, presentation?.sourceUrl);
  const keysChecked: string[] = [];

  if (isB2Configured()) {
    for (const relative of relatives) {
      for (const key of keysForRelative(relative)) {
        keysChecked.push(key);
        const meta = await headObject(key);
        if (meta && (meta.contentLength ?? 0) > 0) {
          return {
            ok: true,
            presentationId,
            relative: relative.startsWith(CLASSROOM_PREFIX) || relative.startsWith("classroom-studio/")
              ? relative
              : relative.replace(/^uploads\//, ""),
            key,
            origin: "b2",
            bytes: meta.contentLength ?? 0,
            contentType: meta.contentType ?? null,
          };
        }
      }
    }
  }

  for (const relative of relatives) {
    const localPath = await hydrateLocalUpload(canonicalPublicPath(relative));
    if (localPath && existsSync(localPath)) {
      const buffer = await readFile(localPath);
      if (!isValidPptxBuffer(buffer)) continue;
      if (isB2Configured()) {
        await persistAtPublicRelative(localPath, canonicalSourceRelative(presentationId), PPTX_MIME, {
          keepLocal: true,
        });
        const canonicalKey = `uploads/${canonicalSourceRelative(presentationId)}`;
        const meta = await headObject(canonicalKey);
        if (meta && (meta.contentLength ?? 0) > 0) {
          return {
            ok: true,
            presentationId,
            relative: canonicalSourceRelative(presentationId),
            key: canonicalKey,
            origin: "b2",
            bytes: meta.contentLength ?? 0,
            contentType: meta.contentType ?? PPTX_MIME,
          };
        }
      }
      return {
        ok: true,
        presentationId,
        relative,
        key: `uploads/${relative}`,
        origin: "local",
        bytes: buffer.length,
        contentType: PPTX_MIME,
      };
    }
  }

  return {
    ok: false,
    code: "CLASSROOM_SOURCE_NOT_FOUND",
    stage: "source-lookup",
    presentationId,
    keysChecked: [...new Set(keysChecked.length ? keysChecked : relatives.map((relative) => `uploads/${relative}`))],
  };
}

export async function downloadPresentationPptx(resolved: ResolvedPresentationSource): Promise<Buffer> {
  let buffer: Buffer;
  try {
    if (resolved.origin === "b2" && isB2Configured()) {
      buffer = await downloadObjectToBuffer(resolved.key);
    } else {
      const localPath = await hydrateLocalUpload(canonicalPublicPath(resolved.relative));
      if (!localPath) {
        throw new AppError(404, "PowerPoint source could not be downloaded", true, {
          code: "CLASSROOM_SOURCE_DOWNLOAD_FAILED",
          stage: "source-download",
        });
      }
      buffer = await readFile(localPath);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, "PowerPoint source could not be downloaded", true, {
      code: "CLASSROOM_SOURCE_DOWNLOAD_FAILED",
      stage: "source-download",
    });
  }

  if (!isValidPptxBuffer(buffer)) {
    throw new AppError(422, "PowerPoint source file is not a valid PPTX", true, {
      code: "CLASSROOM_PPTX_INVALID",
      stage: "validation",
    });
  }
  if (resolved.contentType && !isCompatiblePptxContentType(resolved.contentType)) {
    throw new AppError(422, "PowerPoint source Content-Type is not a PPTX file", true, {
      code: "CLASSROOM_PPTX_INVALID",
      stage: "validation",
    });
  }
  return buffer;
}
