import { createHash } from "node:crypto";
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
  describeB2ConfigSafe,
  headObject,
  isB2Configured,
  b2KeyFromPublicPath,
  uploadExactBuffer,
  statObjectBytes,
} from "../b2StorageService.js";
import { classroomAssetLookupRelatives } from "./classroomAssetUrls.js";
import {
  CLASSROOM_PREFIX,
  PDF_MIME,
  PPTX_MIME,
  canonicalExportPdfRelative,
  canonicalPublicPath,
  canonicalSourceRelative,
  getClassroomSourceKey,
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
      code: "CLASSROOM_B2_NOT_CONFIGURED",
      stage: "storage",
    });
  }
}

export function sha256OfBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function persistPptxBuffer(presentationId: string, buffer: Buffer): Promise<{ relative: string; bytes: number; sha256: string }> {
  return storeClassroomSourcePptx(presentationId, buffer);
}

export async function storeClassroomSourcePptx(presentationId: string, buffer: Buffer): Promise<{ relative: string; bytes: number; sha256: string }> {
  const body = Buffer.from(buffer);
  if (!isValidPptxBuffer(body)) {
    throw new AppError(422, "PowerPoint source file is not a valid PPTX", true, {
      code: "CLASSROOM_PPTX_INVALID",
      stage: "validation",
    });
  }
  const expectedBytes = body.length;
  const maxBytes = 100 * 1024 * 1024;
  if (expectedBytes > maxBytes) {
    console.warn("[CLASSROOM_SOURCE] fileBytes=" + expectedBytes + " maxBytes=" + maxBytes);
    throw new AppError(413, `PowerPoint files must be 100 MB or smaller (maxBytes=${maxBytes} actualBytes=${expectedBytes})`, true, {
      code: "CLASSROOM_PPTX_TOO_LARGE",
      stage: "validation",
    });
  }
  requireDurableClassroomStorage();
  const relative = canonicalSourceRelative(presentationId);
  const key = getClassroomSourceKey(presentationId);
  const sha256 = sha256OfBuffer(body);
  const b2 = describeB2ConfigSafe();
  console.info("[CLASSROOM_SOURCE]", {
    presentationId,
    bytes: expectedBytes,
    sha256,
    pptxValid: true,
    key,
    uploadKey: key,
    verifyKey: key,
    sourceResolverKey: key,
    rendererSourceKey: key,
  });
  console.info("[CLASSROOM_B2]", {
    stage: "config",
    configured: b2.configured,
    bucket: b2.bucket,
    endpoint: b2.endpoint,
    region: b2.region,
    prefix: b2.prefix,
  });
  console.info("[CLASSROOM_B2] stage=upload_start presentationId=" + presentationId + " key=" + key + " expectedBytes=" + expectedBytes + " mimeType=" + PPTX_MIME);

  if (!isB2Configured()) {
    const dest = resolveSafeUploadPath(relative);
    if (!dest) {
      throw new AppError(500, "Invalid classroom storage path", true, {
        code: "CLASSROOM_ASSET_PATH_INVALID",
        stage: "storage",
      });
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, body);
    return { relative, bytes: expectedBytes, sha256 };
  }

  const existing = await statObjectBytes(key);
  if (existing.bytes === expectedBytes) {
    console.info("[CLASSROOM_SOURCE] reuse_existing", {
      presentationId,
      key,
      bytes: existing.bytes,
      sha256,
      contentType: existing.contentType,
      source: existing.source,
    });
    return { relative, bytes: existing.bytes, sha256 };
  }
  if (existing.bytes && existing.bytes !== expectedBytes) {
    console.warn("[CLASSROOM_B2] stage=replace_stale key=" + key + " existingBytes=" + existing.bytes + " expectedBytes=" + expectedBytes);
  }

  const putAndVerify = async (attempt: number) => {
    let uploaded: { etag?: string; bytes: number };
    try {
      uploaded = await uploadExactBuffer({ body, key, contentType: PPTX_MIME });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[CLASSROOM_B2] stage=upload-failed key=" + key + " error=" + message);
      const tooLarge = /too large|entitytoo large|maxpostsize|request too long|payload too large/i.test(message);
      throw new AppError(tooLarge ? 413 : 400, `B2 upload failed: ${message}`, true, {
        code: tooLarge ? "CLASSROOM_B2_SIZE_LIMIT" : "CLASSROOM_B2_UPLOAD_FAILED",
        stage: "source-upload",
        presentationId,
        sourceKey: key,
      });
    }
    console.info("[CLASSROOM_B2] stage=upload_complete key=" + key + " expectedBytes=" + expectedBytes + " uploadedBytes=" + uploaded.bytes + " etag=" + (uploaded.etag || "") + " attempt=" + attempt);
    console.info("[CLASSROOM_B2] stage=verify key=" + key + " expectedBytes=" + expectedBytes);
    const verified = await statObjectBytes(key);
    console.info("[CLASSROOM_B2] stage=verify", {
      key,
      expectedBytes,
      actualBytes: verified.bytes ?? "missing",
      contentLength: verified.bytes ?? "missing",
      etag: verified.etag || "",
      status: verified.status ?? "unknown",
      source: verified.source,
    });
    return { uploaded, verified };
  };

  let { uploaded, verified } = await putAndVerify(1);
  if (verified.bytes !== expectedBytes) {
    console.warn("[CLASSROOM_B2] stage=verify_retry key=" + key + " expectedBytes=" + expectedBytes + " actualBytes=" + (verified.bytes ?? "missing"));
    ({ uploaded, verified } = await putAndVerify(2));
  }

  const actualBytes = verified.bytes;
  if (actualBytes !== expectedBytes) {
    const detail = `uploadedBytes=${uploaded.bytes} verificationBytes=${actualBytes ?? "missing"} expectedBytes=${expectedBytes} key=${key} source=${verified.source} status=${verified.status ?? "unknown"} ${verified.error || ""}`.trim();
    console.error("[CLASSROOM_B2] stage=verify_failed key=" + key + " expectedBytes=" + expectedBytes + " actualBytes=" + (actualBytes ?? "missing") + " contentLength=" + (actualBytes ?? "missing") + " error=" + (verified.error || "size mismatch"));
    throw new AppError(400, "PowerPoint upload verification failed. Please retry.", true, {
      code: "CLASSROOM_B2_VERIFY_FAILED",
      stage: "source-upload",
      presentationId,
      reason: detail,
      sourceKey: key,
    });
  }
  if (verified.contentType && !isCompatiblePptxContentType(verified.contentType)) {
    console.warn("[CLASSROOM_SOURCE] unexpected_content_type", {
      presentationId,
      contentType: verified.contentType,
    });
  }
  return { relative, bytes: actualBytes, sha256 };
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

export function isValidPdfBuffer(buffer: Buffer | Uint8Array | null | undefined): boolean {
  if (!buffer || buffer.length < 100) return false;
  return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
}

export async function persistPdfBuffer(presentationId: string, buffer: Buffer): Promise<{ relative: string; bytes: number; sha256: string } | null> {
  if (!isValidPdfBuffer(buffer)) return null;
  requireDurableClassroomStorage();
  const relative = canonicalExportPdfRelative(presentationId);
  const sha256 = sha256OfBuffer(buffer);
  console.info("[CLASSROOM_SOURCE] export_pdf", {
    presentationId,
    bytes: buffer.length,
    sha256,
  });
  if (!isB2Configured()) {
    const dest = resolveSafeUploadPath(relative);
    if (!dest) return null;
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, buffer);
    return { relative, bytes: buffer.length, sha256 };
  }
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "classroom-pdf-"));
  const tmpPath = path.join(tmpDir, "export.pdf");
  await writeFile(tmpPath, buffer);
  await persistAtPublicRelative(tmpPath, relative, PDF_MIME, { keepLocal: false });
  return { relative, bytes: buffer.length, sha256 };
}

export async function downloadPresentationExportPdf(presentationId: string): Promise<Buffer | null> {
  const relative = canonicalExportPdfRelative(presentationId);
  try {
    if (isB2Configured()) {
      for (const key of keysForRelative(relative)) {
        const meta = await headObject(key);
        if (meta && (meta.contentLength ?? 0) > 100) {
          const buffer = await downloadObjectToBuffer(key);
          return isValidPdfBuffer(buffer) ? buffer : null;
        }
      }
    }
    const localPath = await hydrateLocalUpload(canonicalPublicPath(relative));
    if (localPath && existsSync(localPath)) {
      const buffer = await readFile(localPath);
      return isValidPdfBuffer(buffer) ? buffer : null;
    }
  } catch (error) {
    console.warn("[CLASSROOM_SOURCE] export_pdf_missing", {
      presentationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return null;
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
