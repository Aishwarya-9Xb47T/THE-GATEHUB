import { createHash } from "node:crypto";
import { mkdtemp, writeFile, mkdir, readFile, stat } from "node:fs/promises";
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
  getObjectStream,
} from "../b2StorageService.js";
import { classroomAssetLookupRelatives } from "./classroomAssetUrls.js";
import {
  CLASSROOM_PREFIX,
  PDF_MIME,
  PPTX_MIME,
  canonicalExportPdfRelative,
  canonicalPublicPath,
  canonicalSourceApi,
  canonicalSourceRelative,
  getClassroomSourceKey,
} from "./classroomAssetPath.js";

export type ClassroomSourceOrigin = "b2" | "local" | "database";

export type ResolvedPresentationSource = {
  ok: true;
  presentationId: string;
  relative: string;
  key: string;
  origin: ClassroomSourceOrigin;
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

export type OriginalSourceMissReason =
  | "FILE_NOT_FOUND"
  | "INVALID_STORAGE_PATH"
  | "PRESENTATION_NOT_FOUND"
  | "WRONG_PRESENTATION_ID"
  | "DEPLOYED_FILESYSTEM_MISMATCH"
  | "UPLOAD_NOT_PERSISTED"
  | "AUTH_ROUTE_MISMATCH"
  | "BAD_SOURCE_URL"
  | "B2_NOT_CONFIGURED";

export type PresentationOriginalSource = {
  presentationId: string;
  absoluteStoragePath: string | null;
  relativeStoragePath: string;
  publicAssetPath: string;
  sourceType: string | null;
  exists: boolean;
  size: number;
  mimeType: string;
  origin: ClassroomSourceOrigin | null;
  key: string;
  reason?: OriginalSourceMissReason;
};

export function isEphemeralHost(): boolean {
  const env = String(process.env.NODE_ENV || "").toLowerCase();
  return env === "production"
    || Boolean(process.env.RENDER)
    || Boolean(process.env.RENDER_SERVICE_ID)
    || Boolean(process.env.FLY_APP_NAME)
    || Boolean(process.env.RAILWAY_ENVIRONMENT)
    || Boolean(process.env.K_SERVICE);
}

export function diagnoseMissingOriginalSource(args: {
  presentationFound: boolean;
  sourceUrl?: string | null;
  b2Configured: boolean;
  ephemeralHost: boolean;
  sourceUrlMatchesPresentation?: boolean;
  databaseHasFile?: boolean;
}): OriginalSourceMissReason {
  if (!args.presentationFound) return "PRESENTATION_NOT_FOUND";
  if (args.databaseHasFile) return "FILE_NOT_FOUND";
  if (!args.sourceUrl) return "UPLOAD_NOT_PERSISTED";
  if (args.sourceUrlMatchesPresentation === false) return "BAD_SOURCE_URL";
  return "FILE_NOT_FOUND";
}

/** Kept for callers. Object storage is optional; Postgres holds original.pptx when B2 is unset. */
export function requireDurableClassroomStorage(): void {
  if (isEphemeralHost() && !isB2Configured()) {
    console.info("[CLASSROOM_SOURCE] durable_store=database reason=b2_not_configured");
  }
}

export async function persistOriginalPptxToDatabase(args: {
  presentationId: string;
  body: Buffer;
  sha256: string;
}): Promise<{ size: number }> {
  try {
    await prisma.presentationOriginalFile.upsert({
      where: { presentationId: args.presentationId },
      create: {
        presentationId: args.presentationId,
        bytes: args.body,
        size: args.body.length,
        sha256: args.sha256,
        mimeType: PPTX_MIME,
      },
      update: {
        bytes: args.body,
        size: args.body.length,
        sha256: args.sha256,
        mimeType: PPTX_MIME,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[CLASSROOM_SOURCE] database_persist_failed", {
      presentationId: args.presentationId,
      bytes: args.body.length,
      error: message,
    });
    throw new AppError(500, "The PowerPoint file could not be stored. Please retry the upload.", true, {
      code: "ORIGINAL_PPTX_STORAGE_FAILED",
      stage: "source-upload",
      reason: "UPLOAD_NOT_PERSISTED",
      presentationId: args.presentationId,
    });
  }
  console.info("[CLASSROOM_SOURCE] durable_store=database", {
    presentationId: args.presentationId,
    bytes: args.body.length,
    sha256: args.sha256,
  });
  return { size: args.body.length };
}

export async function readOriginalPptxFromDatabase(
  presentationId: string,
): Promise<{ buffer: Buffer; size: number; sha256: string } | null> {
  const record = await prisma.presentationOriginalFile.findUnique({
    where: { presentationId },
    select: { bytes: true, size: true, sha256: true },
  });
  if (!record?.bytes || record.size <= 0) return null;
  const buffer = Buffer.from(record.bytes);
  if (!isValidPptxBuffer(buffer)) return null;
  return { buffer, size: buffer.length, sha256: record.sha256 };
}

async function writeLocalClassroomFile(relative: string, body: Buffer): Promise<string | null> {
  const dest = resolveSafeUploadPath(relative);
  if (!dest) return null;
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, body);
  return dest;
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
  try {
    await writeLocalClassroomFile(relative, body);
  } catch (error) {
    console.warn("[CLASSROOM_SOURCE] local_copy_failed", {
      presentationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  let storedOnB2 = false;
  if (isB2Configured()) {
    try {
      const existing = await statObjectBytes(key);
      if (existing.bytes === expectedBytes) {
        storedOnB2 = true;
        console.info("[CLASSROOM_SOURCE] reuse_existing", {
          presentationId,
          key,
          bytes: existing.bytes,
          sha256,
          contentType: existing.contentType,
          source: existing.source,
        });
      } else {
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
        if (verified.bytes === expectedBytes) {
          storedOnB2 = true;
          if (verified.contentType && !isCompatiblePptxContentType(verified.contentType)) {
            console.warn("[CLASSROOM_SOURCE] unexpected_content_type", {
              presentationId,
              contentType: verified.contentType,
            });
          }
        } else {
          const detail = `uploadedBytes=${uploaded.bytes} verificationBytes=${verified.bytes ?? "missing"} expectedBytes=${expectedBytes} key=${key} source=${verified.source} status=${verified.status ?? "unknown"} ${verified.error || ""}`.trim();
          console.error("[CLASSROOM_B2] stage=verify_failed key=" + key + " expectedBytes=" + expectedBytes + " actualBytes=" + (verified.bytes ?? "missing") + " error=" + (verified.error || "size mismatch"));
          throw new AppError(400, "PowerPoint upload verification failed. Please retry.", true, {
            code: "CLASSROOM_B2_VERIFY_FAILED",
            stage: "source-upload",
            presentationId,
            reason: detail,
            sourceKey: key,
          });
        }
      }
    } catch (error) {
      if (error instanceof AppError && error.details?.code === "CLASSROOM_B2_SIZE_LIMIT") throw error;
      console.warn("[CLASSROOM_SOURCE] b2_failed_using_database", {
        presentationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!storedOnB2) {
    await persistOriginalPptxToDatabase({ presentationId, body, sha256 });
  }

  return { relative, bytes: expectedBytes, sha256 };
}

export async function persistClassroomAssetBuffer(args: {
  relative: string;
  body: Buffer;
  contentType: string;
}): Promise<{ relative: string; bytes: number }> {
  const body = Buffer.from(args.body);
  if (!body.length) {
    throw new AppError(500, "Classroom asset is empty", true, {
      code: "CLASSROOM_ASSET_EMPTY",
      stage: "storage",
    });
  }
  await writeLocalClassroomFile(args.relative, body);
  if (isB2Configured()) {
    const key = `uploads/${args.relative.replace(/^uploads\//, "")}`;
    await uploadExactBuffer({ body, key, contentType: args.contentType });
  }
  return { relative: args.relative, bytes: body.length };
}

export async function getPresentationOriginalSource(presentationId: string): Promise<PresentationOriginalSource> {
  const relative = canonicalSourceRelative(presentationId);
  const key = getClassroomSourceKey(presentationId);
  const localCanonical = resolveSafeUploadPath(relative);
  const base: Omit<PresentationOriginalSource, "exists" | "size" | "origin"> = {
    presentationId,
    absoluteStoragePath: localCanonical,
    relativeStoragePath: relative,
    publicAssetPath: canonicalSourceApi(presentationId),
    sourceType: null,
    mimeType: PPTX_MIME,
    key,
  };

  if (!presentationId || presentationId.includes("..")) {
    return {
      ...base,
      exists: false,
      size: 0,
      origin: null,
      reason: "WRONG_PRESENTATION_ID",
    };
  }

  const presentation = await prisma.presentation.findUnique({
    where: { id: presentationId },
    select: {
      id: true,
      sourceUrl: true,
      sourceType: true,
      originalFile: { select: { size: true, mimeType: true } },
    },
  });
  base.sourceType = presentation?.sourceType ?? null;

  if (!presentation) {
    console.warn("[CLASSROOM_SOURCE] lookup_failed", {
      presentationId,
      reason: "PRESENTATION_NOT_FOUND",
      key,
    });
    return {
      ...base,
      exists: false,
      size: 0,
      origin: null,
      reason: "PRESENTATION_NOT_FOUND",
    };
  }

  const relatives = collectSourceRelatives(presentationId, presentation.sourceUrl);

  if (isB2Configured()) {
    for (const candidateRelative of relatives) {
      for (const candidateKey of keysForRelative(candidateRelative)) {
        const verified = await statObjectBytes(candidateKey);
        if (verified.bytes && verified.bytes > 0) {
          return {
            ...base,
            relativeStoragePath: candidateRelative.replace(/^uploads\//, ""),
            exists: true,
            size: verified.bytes,
            origin: "b2",
            key: candidateKey,
            mimeType: isCompatiblePptxContentType(verified.contentType) ? PPTX_MIME : (verified.contentType || PPTX_MIME),
          };
        }
      }
    }
  }

  for (const candidateRelative of relatives) {
    const dest = resolveSafeUploadPath(candidateRelative);
    if (!dest || !existsSync(dest)) continue;
    try {
      const info = await stat(dest);
      if (info.size > 0) {
        return {
          ...base,
          absoluteStoragePath: dest,
          relativeStoragePath: candidateRelative,
          exists: true,
          size: info.size,
          origin: "local",
          key: `uploads/${candidateRelative}`,
        };
      }
    } catch {
      /* try next */
    }
  }

  const dbSize = presentation.originalFile?.size ?? 0;
  if (dbSize > 0) {
    return {
      ...base,
      exists: true,
      size: dbSize,
      origin: "database",
      mimeType: presentation.originalFile?.mimeType || PPTX_MIME,
    };
  }

  const sourceUrlMatches = presentation.sourceUrl
    ? Boolean(relativeFromSourceUrl(presentation.sourceUrl, presentationId))
    : undefined;
  const reason = diagnoseMissingOriginalSource({
    presentationFound: true,
    sourceUrl: presentation.sourceUrl,
    b2Configured: isB2Configured(),
    ephemeralHost: isEphemeralHost(),
    sourceUrlMatchesPresentation: sourceUrlMatches,
    databaseHasFile: false,
  });
  console.warn("[CLASSROOM_SOURCE] lookup_failed", {
    presentationId,
    reason,
    key,
    sourceUrl: presentation.sourceUrl ? "set" : "missing",
    b2Configured: isB2Configured(),
    ephemeralHost: isEphemeralHost(),
    relatives: relatives.slice(0, 6),
  });
  return {
    ...base,
    exists: false,
    size: 0,
    origin: null,
    reason,
  };
}

export async function verifyReadableOriginalPptx(presentationId: string): Promise<PresentationOriginalSource> {
  const source = await getPresentationOriginalSource(presentationId);
  if (!source.exists) return source;

  try {
    if (source.origin === "b2" && source.key && isB2Configured()) {
      const ranged = await getObjectStream(source.key, "bytes=0-3");
      const chunks: Buffer[] = [];
      for await (const chunk of ranged.body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const header = Buffer.concat(chunks);
      if (!isValidPptxBuffer(header)) {
        return { ...source, exists: false, reason: "FILE_NOT_FOUND" };
      }
      return source;
    }
    if (source.absoluteStoragePath && existsSync(source.absoluteStoragePath)) {
      const fd = await readFile(source.absoluteStoragePath);
      if (!isValidPptxBuffer(fd) || fd.length <= 0) {
        return { ...source, exists: false, size: 0, reason: "FILE_NOT_FOUND" };
      }
      return { ...source, size: fd.length };
    }
    if (source.origin === "database") {
      const stored = await readOriginalPptxFromDatabase(presentationId);
      if (!stored) return { ...source, exists: false, size: 0, reason: "FILE_NOT_FOUND" };
      try {
        await writeLocalClassroomFile(source.relativeStoragePath, stored.buffer);
      } catch {
        /* local hydrate is optional */
      }
      return { ...source, exists: true, size: stored.size, origin: "database" };
    }
  } catch (error) {
    console.error("[CLASSROOM_SOURCE] verify_read_failed", {
      presentationId,
      key: source.key,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ...source,
      exists: false,
      reason: "FILE_NOT_FOUND",
    };
  }

  return { ...source, exists: false, reason: "FILE_NOT_FOUND" };
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

  const stored = await readOriginalPptxFromDatabase(presentationId);
  if (stored) {
    try {
      await writeLocalClassroomFile(canonicalSourceRelative(presentationId), stored.buffer);
    } catch {
      /* local hydrate is optional */
    }
    return {
      ok: true,
      presentationId,
      relative: canonicalSourceRelative(presentationId),
      key: getClassroomSourceKey(presentationId),
      origin: "database",
      bytes: stored.size,
      contentType: PPTX_MIME,
    };
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
  let buffer: Buffer | null = null;
  try {
    if (resolved.origin === "b2" && isB2Configured()) {
      buffer = await downloadObjectToBuffer(resolved.key);
    } else if (resolved.origin === "database") {
      const stored = await readOriginalPptxFromDatabase(resolved.presentationId);
      buffer = stored?.buffer ?? null;
    } else {
      const localPath = await hydrateLocalUpload(canonicalPublicPath(resolved.relative));
      if (localPath && existsSync(localPath)) {
        buffer = await readFile(localPath);
      }
    }
    if (!buffer) {
      const stored = await readOriginalPptxFromDatabase(resolved.presentationId);
      buffer = stored?.buffer ?? null;
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, "PowerPoint source could not be downloaded", true, {
      code: "CLASSROOM_SOURCE_DOWNLOAD_FAILED",
      stage: "source-download",
    });
  }

  if (!buffer) {
    throw new AppError(404, "PowerPoint source could not be downloaded", true, {
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
