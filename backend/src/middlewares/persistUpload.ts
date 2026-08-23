import fs from "fs";
import path from "path";
import type { Response } from "express";
import {
  isB2Configured,
  uploadFile,
  buildObjectKey,
  buildObjectKeyWithName,
  publicPathFromKey,
  b2KeyFromPublicPath,
  getObjectStream,
  headObject,
  confirmUploadedObject,
  deleteObject,
  downloadObjectToFile,
  unlinkQuietly,
  detectContentType,
  isMissingObjectError,
  isB2CapExceededError,
  statObjectBytes,
  type B2Prefix,
} from "../services/b2StorageService.js";
import { getUploadRoot, resolveSafeUploadPath, normalizeUploadRelativePath } from "./uploadAccess.js";
import {
  inspectByteRange,
  isVideoUploadPath,
  mimeFromUploadPath as mimeFromExt,
} from "../utils/uploadMedia.js";
import { classroomAssetLookupRelatives } from "../services/classroomStudio/classroomAssetUrls.js";
import { isAllowedCorsOrigin } from "../config/corsOrigins.js";

export type { B2Prefix };
export { isVideoUploadPath };

function httpStatusOfGet(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  return (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
}

export function applyUploadCorsHeaders(res: Response, originHeader?: string): void {
  const origin = originHeader?.replace(/\/$/, "");
  if (origin && isAllowedCorsOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else if (process.env.CLIENT_URL) {
    res.setHeader("Access-Control-Allow-Origin", String(process.env.CLIENT_URL).replace(/\/$/, ""));
  }
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Accept-Ranges, Content-Range, Content-Length, Content-Type"
  );
}

function mediaLog(
  tag: "MEDIA_RESOLVE" | "MEDIA_STREAM" | "MEDIA_RANGE" | "MEDIA_B2",
  fields: Record<string, string | number | boolean | undefined>
): void {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`);
  console.log(`[${tag}] ${parts.join(" ")}`);
}

function sendUnsatisfiableRange(res: Response, fileSize: number): void {
  mediaLog("MEDIA_RANGE", { status: 416, size: fileSize });
  res.status(416);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Range", `bytes */${fileSize}`);
  res.end();
}

export function mimeFromUploadPath(filePath: string, fallback?: string): string {
  const fromExt = mimeFromExt(filePath, "");
  if (fromExt) return fromExt;
  return detectContentType(filePath, fallback);
}

function prefixFromMime(file: Express.Multer.File, explicit?: B2Prefix): B2Prefix {
  if (explicit) return explicit;
  if (file.mimetype.startsWith("video/")) return "videos";
  if (file.mimetype.startsWith("image/")) return "images";
  if (file.mimetype === "application/pdf") return "pdfs";
  if (file.mimetype.startsWith("audio/")) return "music";
  return "other";
}

/**
 * After Multer diskStorage: stream temp file to B2 when configured, then delete temp.
 * Returns the durable /uploads/... path to store in Neon.
 */
export async function persistMulterFile(
  file: Express.Multer.File,
  prefix?: B2Prefix,
  extraPath?: string,
  options?: { keepLocal?: boolean }
): Promise<string> {
  const chosen = prefixFromMime(file, prefix);
  if (!isB2Configured()) {
    if (extraPath) {
      return `/uploads/${chosen}/${extraPath}/${file.filename}`.replace(/\/+/g, "/");
    }
    const relative = path.relative(getUploadRoot(), file.path).replace(/\\/g, "/");
    if (relative.startsWith(`${chosen}/`)) {
      return `/uploads/${relative}`;
    }
    // Canonical local layout matches B2: /uploads/videos|<prefix>/<filename>
    try {
      const destDir = path.join(getUploadRoot(), chosen);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      const destFile = path.join(destDir, file.filename);
      if (file.path !== destFile && fs.existsSync(file.path)) {
        fs.copyFileSync(file.path, destFile);
      }
    } catch {
      /* ignore */
    }
    return `/uploads/${chosen}/${file.filename}`;
  }

  const key = extraPath
    ? buildObjectKeyWithName(chosen, file.filename, extraPath)
    : `uploads/${chosen}/${file.filename}`;
  const uploaded = await uploadFile({
    filePath: file.path,
    key,
    contentType: file.mimetype || detectContentType(file.originalname || file.filename),
  });
  const confirmed = await confirmUploadedObject(key, uploaded);
  if (!confirmed.accepted) {
    throw new Error(
      `B2 upload failed: object is missing after PutObject key=${key} status=${confirmed.status ?? "unknown"} ${confirmed.error || ""}`.trim(),
    );
  }
  console.log(
    "[MEDIA_B2] upload_persisted key=" +
      key +
      " source=" +
      confirmed.source +
      " bytes=" +
      (confirmed.bytes ?? uploaded.bytes) +
      (confirmed.permissionDenied ? " head=403" : ""),
  );
  if (options?.keepLocal) {
    try {
      const destDir = path.join(getUploadRoot(), chosen);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      const destFile = path.join(destDir, file.filename);
      if (file.path !== destFile && fs.existsSync(file.path)) {
        fs.copyFileSync(file.path, destFile);
      }
    } catch {
      /* ignore copy error on keepLocal */
    }
  } else {
    await unlinkQuietly(file.path);
  }
  return publicPathFromKey(key);
}

export async function persistLocalPathToB2(params: {
  localPath: string;
  prefix: B2Prefix;
  fileName?: string;
  extraPath?: string;
  contentType?: string;
  originalName?: string;
}): Promise<string> {
  const fileName = params.fileName || path.basename(params.localPath);
  if (!isB2Configured()) {
    const relative = path.relative(getUploadRoot(), params.localPath).replace(/\\/g, "/");
    if (relative && !relative.startsWith("..")) {
      return `/uploads/${relative}`;
    }
    return `/uploads/${fileName}`;
  }
  const key = params.extraPath
    ? buildObjectKeyWithName(params.prefix, fileName, params.extraPath)
    : buildObjectKeyWithName(params.prefix, fileName);
  const uploaded = await uploadFile({
    filePath: params.localPath,
    key,
    contentType: params.contentType || detectContentType(params.originalName || fileName),
  });
  const confirmed = await confirmUploadedObject(key, uploaded);
  if (!confirmed.accepted) {
    throw new Error(
      `B2 upload failed: object is missing after PutObject key=${key} status=${confirmed.status ?? "unknown"} ${confirmed.error || ""}`.trim(),
    );
  }
  console.log(
    "[MEDIA_B2] upload_persisted key=" +
      key +
      " source=" +
      confirmed.source +
      " bytes=" +
      (confirmed.bytes ?? uploaded.bytes) +
      (confirmed.permissionDenied ? " head=403" : ""),
  );
  await unlinkQuietly(params.localPath);
  return publicPathFromKey(key);
}

export async function persistGeneratedFile(params: {
  localPath: string;
  prefix: B2Prefix;
  fileName: string;
  extraPath?: string;
  contentType?: string;
}): Promise<string> {
  return persistLocalPathToB2(params);
}

/** Persist a temp file at an exact /uploads/<relative> contract path (nested keys allowed). */
export async function persistAtPublicRelative(
  localPath: string,
  relativeUnderUploads: string,
  contentType?: string,
  options?: { keepLocal?: boolean }
): Promise<string> {
  const cleaned = relativeUnderUploads
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((p) => p && p !== ".." && p !== ".")
    .join("/");
  const publicPath = `/uploads/${cleaned}`;
  if (!isB2Configured()) return publicPath;
  const key = `uploads/${cleaned}`;
  let expectedBytes = 0;
  try {
    expectedBytes = fs.statSync(localPath).size;
  } catch {
    expectedBytes = 0;
  }
  console.info("[CLASSROOM_B2] stage=upload-start key=" + key + " bytes=" + expectedBytes + " mime=" + (contentType || detectContentType(cleaned)));
  const uploaded = await uploadFile({
    filePath: localPath,
    key,
    contentType: contentType || detectContentType(cleaned),
  });
  console.info("[CLASSROOM_B2] stage=upload-complete key=" + key + " uploadedBytes=" + uploaded.bytes + " etag=" + (uploaded.etag || ""));
  console.info("[CLASSROOM_B2] stage=verify-start key=" + key);
  const confirmed = await confirmUploadedObject(key, uploaded);
  console.info(
    "[CLASSROOM_B2] stage=verify-result key=" +
      key +
      " accepted=" +
      confirmed.accepted +
      " source=" +
      confirmed.source +
      " bytes=" +
      (confirmed.bytes ?? "missing") +
      " status=" +
      (confirmed.status ?? "") +
      (confirmed.permissionDenied ? " head=403" : ""),
  );
  if (!confirmed.accepted) {
    console.error("[CLASSROOM_B2] stage=verify-failed key=" + key + " expectedBytes=" + expectedBytes + " actualBytes=" + (confirmed.bytes ?? "missing") + " error=" + (confirmed.error || "object missing after PutObject"));
    throw new Error(
      `B2 upload failed: object is missing after PutObject key=${key} expectedBytes=${expectedBytes} status=${confirmed.status ?? "unknown"} ${confirmed.error || ""}`.trim(),
    );
  }
  if (!options?.keepLocal) {
    await unlinkQuietly(localPath);
  }
  return publicPath;
}

/** Delete a stored object using a Neon-stored /uploads path. Never takes a raw B2 URL from the client. */
export async function deleteStoredPublicPath(stored: string | null | undefined): Promise<void> {
  if (!stored) return;
  const key = b2KeyFromPublicPath(stored);
  if (key && isB2Configured()) {
    try {
      await deleteObject(key);
    } catch (err) {
      console.warn("[storage] B2 delete failed:", key, err instanceof Error ? err.message : err);
    }
  }
  const relative = key ? key.replace(/^uploads\//, "") : null;
  if (relative) {
    const local = resolveSafeUploadPath(relative);
    if (local && fs.existsSync(local)) {
      try {
        fs.unlinkSync(local);
      } catch {
        /* ignore */
      }
    }
  }
}

export function localPathIfExists(stored: string): string | null {
  const key = b2KeyFromPublicPath(stored);
  const relative = key ? key.replace(/^uploads\//, "") : stored.replace(/^\/uploads\//, "");
  const local = resolveSafeUploadPath(relative.split("?")[0]);
  if (local && fs.existsSync(local)) return local;
  return null;
}

export async function hydrateLocalUpload(stored: string): Promise<string | null> {
  if (!stored?.trim()) return null;
  const existing = localPathIfExists(stored);
  if (existing) return existing;
  if (!isB2Configured()) return null;
  const primaryKey = b2KeyFromPublicPath(stored);
  if (!primaryKey) return null;
  const relatives = uploadRelativesToTry(primaryKey.replace(/^uploads\//, ""));
  for (const relative of relatives) {
    const localHit = resolveSafeUploadPath(relative);
    if (localHit && fs.existsSync(localHit)) return localHit;
  }
  for (const relative of relatives) {
    const key = `uploads/${normalizeUploadRelativePath(relative)}`;
    const dest = resolveSafeUploadPath(relative);
    if (!dest) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      await downloadObjectToFile(key, dest);
      return dest;
    } catch (err) {
      await unlinkQuietly(dest);
      if (isMissingObjectError(err)) continue;
      throw err;
    }
  }
  console.warn("[storage] B2 object missing during hydrate:", primaryKey);
  return null;
}

export function streamMemoryUpload(
  res: Response,
  body: Buffer,
  options?: { range?: string; method?: string; mimeType?: string; origin?: string; cacheControl?: string }
): boolean {
  const size = body.length;
  if (size <= 0) return false;
  const mime = options?.mimeType || "application/octet-stream";
  const inspected = inspectByteRange(options?.range, size);
  applyUploadCorsHeaders(res, options?.origin);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (options?.cacheControl) res.setHeader("Cache-Control", options.cacheControl);

  if (inspected.type === "unsatisfiable") {
    sendUnsatisfiableRange(res, size);
    return true;
  }

  if (inspected.type === "valid") {
    const chunk = body.subarray(inspected.start, inspected.end + 1);
    res.status(206);
    res.setHeader("Content-Range", `bytes ${inspected.start}-${inspected.end}/${size}`);
    res.setHeader("Content-Length", String(chunk.length));
    if (options?.method === "HEAD") {
      res.end();
      return true;
    }
    res.end(chunk);
    return true;
  }

  res.status(200);
  res.setHeader("Content-Length", String(size));
  if (options?.method === "HEAD") {
    res.end();
    return true;
  }
  res.end(body);
  return true;
}

export function streamLocalUpload(
  res: Response,
  filePath: string,
  options?: { range?: string; method?: string; mimeType?: string; origin?: string; cacheControl?: string }
): boolean {
  if (!fs.existsSync(filePath)) return false;
  const stat = fs.statSync(filePath);
  const mime = options?.mimeType || mimeFromUploadPath(filePath);
  const inspected = inspectByteRange(options?.range, stat.size);
  applyUploadCorsHeaders(res, options?.origin);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (options?.cacheControl) res.setHeader("Cache-Control", options.cacheControl);
  if (mime === "application/pdf") res.removeHeader("X-Frame-Options");

  mediaLog("MEDIA_RESOLVE", {
    path: path.basename(filePath),
    mime,
    range: options?.range || "none",
    source: "local",
  });

  if (inspected.type === "unsatisfiable") {
    sendUnsatisfiableRange(res, stat.size);
    return true;
  }

  if (inspected.type === "valid") {
    const chunkSize = inspected.end - inspected.start + 1;
    mediaLog("MEDIA_RANGE", {
      path: path.basename(filePath),
      mime,
      range: options?.range,
      status: 206,
      length: chunkSize,
    });
    mediaLog("MEDIA_STREAM", {
      path: path.basename(filePath),
      mime,
      status: 206,
      source: "local",
    });
    res.status(206);
    res.setHeader("Content-Range", `bytes ${inspected.start}-${inspected.end}/${stat.size}`);
    res.setHeader("Content-Length", String(chunkSize));
    if (options?.method === "HEAD") {
      res.end();
      return true;
    }
    fs.createReadStream(filePath, { start: inspected.start, end: inspected.end }).pipe(res);
    return true;
  }

  mediaLog("MEDIA_STREAM", {
    path: path.basename(filePath),
    mime,
    range: "none",
    status: 200,
    length: stat.size,
    source: "local",
  });
  res.status(200);
  res.setHeader("Content-Length", String(stat.size));
  if (options?.method === "HEAD") {
    res.end();
    return true;
  }
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function uploadRelativesToTry(relativePath: string): string[] {
  const primary = normalizeUploadRelativePath(relativePath);
  const relatives: string[] = [primary, ...classroomAssetLookupRelatives(primary)];

  // Legacy LU copies: learning-universes/<id>/<uuid>.mp4 → also try canonical videos/<uuid>.mp4
  const luCopy = primary.match(/^learning-universes\/[^/]+\/([^/]+)$/i);
  if (luCopy?.[1]) {
    const base = luCopy[1];
    relatives.push(`videos/${base}`);
    relatives.push(base);
  }

  // If primary has no directory segment, search standard upload category prefixes
  if (!primary.includes("/")) {
    const ext = path.extname(primary).toLowerCase();
    if (/\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(ext)) {
      relatives.push(`videos/${primary}`);
    } else if (/\.(png|jpg|jpeg|webp|svg|gif|avif)$/i.test(ext)) {
      relatives.push(`images/${primary}`);
      relatives.push(`banners/${primary}`);
    } else if (/\.pdf$/i.test(ext)) {
      relatives.push(`pdfs/${primary}`);
      relatives.push(`latex/pdfs/${primary}`);
    } else if (/\.(mp3|wav|ogg|m4a|aac)$/i.test(ext)) {
      relatives.push(`music/${primary}`);
    }
    relatives.push(`attachments/${primary}`);
    relatives.push(`other/${primary}`);
  }

  return [...new Set(relatives)];
}

export class StorageStreamError extends Error {
  constructor(
    public code:
      | "OBJECT_NOT_FOUND"
      | "ACCESS_DENIED"
      | "BANDWIDTH_LIMIT"
      | "TRANSACTION_LIMIT"
      | "NETWORK_ERROR"
      | "INVALID_KEY",
    message: string,
    public httpStatus: number,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "StorageStreamError";
  }
}

function classifyStreamError(err: unknown, key?: string): StorageStreamError {
  if (err instanceof StorageStreamError) return err;
  if (isB2CapExceededError(err)) {
    return new StorageStreamError(
      "BANDWIDTH_LIMIT",
      err instanceof Error ? err.message : "B2 download/transaction cap exceeded",
      503,
      { key, storageErrorCode: "BANDWIDTH_LIMIT" }
    );
  }
  const status = httpStatusOfGet(err);
  const message = err instanceof Error ? err.message : String(err);
  if (status === 404 || isMissingObjectError(err)) {
    return new StorageStreamError("OBJECT_NOT_FOUND", message || "Object not found", 404, { key });
  }
  if (status === 403) {
    return new StorageStreamError("ACCESS_DENIED", message || "Access denied", 403, { key });
  }
  return new StorageStreamError("NETWORK_ERROR", message || "Storage network error", 502, {
    key,
    status,
  });
}

async function resolveB2StreamTarget(relativePath: string): Promise<{
  key: string;
  size: number;
  contentType?: string;
  sizeKnown: boolean;
} | null> {
  const relatives = uploadRelativesToTry(relativePath);
  const candidateKeys: string[] = [];
  for (const relative of relatives) {
    const normalized = normalizeUploadRelativePath(relative);
    candidateKeys.push(`uploads/${normalized}`);
    candidateKeys.push(normalized);
  }
  const uniqueKeys = [...new Set(candidateKeys)];

  for (const candidateKey of uniqueKeys) {
    try {
      const meta = await headObject(candidateKey);
      if (!meta) continue;
      let size = Number(meta.contentLength) || 0;
      if (size <= 0) {
        const stat = await statObjectBytes(candidateKey);
        size = Number(stat.bytes) || 0;
        if (size <= 0 && (stat.source === "head" || Boolean(meta.etag))) {
          // Object exists but length unknown — stream with client Range forwarded to B2.
          return {
            key: candidateKey,
            size: 0,
            contentType: meta.contentType || stat.contentType,
            sizeKnown: false,
          };
        }
      }
      if (size > 0 || meta.etag) {
        return {
          key: candidateKey,
          size,
          contentType: meta.contentType,
          sizeKnown: size > 0,
        };
      }
    } catch (err) {
      if (isB2CapExceededError(err)) throw classifyStreamError(err, candidateKey);
      // keep trying other keys
    }
  }

  // Head often 403 without listFiles — probe via list / 1-byte range (not full download).
  for (const candidateKey of uniqueKeys) {
    try {
      const stat = await statObjectBytes(candidateKey);
      if (stat.source === "list" || stat.source === "range" || (stat.source === "head" && Number(stat.bytes) > 0)) {
        return {
          key: candidateKey,
          size: Number(stat.bytes) || 0,
          contentType: stat.contentType,
          sizeKnown: Number(stat.bytes) > 0,
        };
      }
      if (stat.status === 403) {
        // Likely exists; allow stream attempt with unknown size.
        return { key: candidateKey, size: 0, contentType: stat.contentType, sizeKnown: false };
      }
    } catch (err) {
      if (isB2CapExceededError(err)) throw classifyStreamError(err, candidateKey);
    }
  }

  return null;
}

export async function serveStoredUpload(
  res: Response,
  relativePath: string,
  options?: { range?: string; asVideo?: boolean; method?: string; origin?: string; mimeType?: string; cacheControl?: string }
): Promise<boolean> {
  const relatives = uploadRelativesToTry(relativePath);
  for (const relative of relatives) {
    const local = resolveSafeUploadPath(relative);
    if (local && fs.existsSync(local)) {
      return streamLocalUpload(res, local, {
        range: options?.range,
        method: options?.method,
        origin: options?.origin,
        mimeType: options?.mimeType,
        cacheControl: options?.cacheControl,
      });
    }
  }

  if (!isB2Configured()) return false;

  const target = await resolveB2StreamTarget(relativePath);
  if (!target) {
    mediaLog("MEDIA_B2", { path: relativePath, found: 0 });
    return false;
  }

  const { key, sizeKnown } = target;
  let size = target.size;
  const mime =
    options?.mimeType ||
    (target.contentType && target.contentType !== "application/octet-stream"
      ? target.contentType
      : mimeFromUploadPath(key, target.contentType));

  applyUploadCorsHeaders(res, options?.origin);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", mime);
  if (options?.cacheControl) res.setHeader("Cache-Control", options.cacheControl);
  if (mime === "application/pdf") res.removeHeader("X-Frame-Options");

  mediaLog("MEDIA_RESOLVE", {
    path: relativePath,
    key,
    mime,
    range: options?.range || "none",
    source: "b2",
    sizeKnown: sizeKnown ? 1 : 0,
  });
  mediaLog("MEDIA_B2", { key, mime, size, found: 1 });

  // Known size → RFC 7233 validation. Unknown size → forward Range to B2.
  let b2Range: string | undefined;
  let responseStatus = 200;
  let contentLength: number | undefined = sizeKnown && size > 0 ? size : undefined;
  let contentRangeHeader: string | undefined;

  if (sizeKnown && size > 0) {
    const inspected = inspectByteRange(options?.range, size);
    if (inspected.type === "unsatisfiable") {
      sendUnsatisfiableRange(res, size);
      return true;
    }
    if (inspected.type === "valid") {
      b2Range = `bytes=${inspected.start}-${inspected.end}`;
      responseStatus = 206;
      contentLength = inspected.end - inspected.start + 1;
      contentRangeHeader = `bytes ${inspected.start}-${inspected.end}/${size}`;
    }
  } else if (options?.range?.trim()) {
    b2Range = options.range.trim();
    responseStatus = 206;
  }

  if (options?.method === "HEAD") {
    if (responseStatus === 206 && contentRangeHeader && contentLength != null) {
      mediaLog("MEDIA_RANGE", { key, mime, range: options?.range, status: 206, head: 1 });
      res.status(206);
      res.setHeader("Content-Range", contentRangeHeader);
      res.setHeader("Content-Length", String(contentLength));
    } else {
      mediaLog("MEDIA_STREAM", { key, mime, range: "none", status: 200, head: 1 });
      res.status(200);
      if (sizeKnown && size > 0) res.setHeader("Content-Length", String(size));
    }
    res.end();
    return true;
  }

  let streamed: Awaited<ReturnType<typeof getObjectStream>>;
  try {
    streamed = await getObjectStream(key, b2Range);
  } catch (err) {
    throw classifyStreamError(err, key);
  }

  const status = streamed.status || responseStatus;
  const contentType =
    streamed.contentType && streamed.contentType !== "application/octet-stream"
      ? streamed.contentType
      : mime;

  if (b2Range) {
    mediaLog("MEDIA_RANGE", {
      key,
      mime: contentType,
      range: b2Range,
      status,
      length: streamed.contentLength,
    });
  }
  mediaLog("MEDIA_STREAM", {
    key,
    mime: contentType,
    range: b2Range || "none",
    status,
    length: streamed.contentLength,
    source: "b2",
  });

  res.status(status);
  res.setHeader("Content-Type", contentType);
  if (contentType === "application/pdf") res.removeHeader("X-Frame-Options");
  if (streamed.contentLength != null) {
    res.setHeader("Content-Length", String(streamed.contentLength));
  } else if (contentLength != null) {
    res.setHeader("Content-Length", String(contentLength));
  }
  if (streamed.contentRange) {
    res.setHeader("Content-Range", streamed.contentRange);
  } else if (contentRangeHeader) {
    res.setHeader("Content-Range", contentRangeHeader);
  }

  streamed.body.on("error", (err) => {
    console.error(
      `[VIDEO_STREAM_ERROR] key=${key} range=${b2Range || "none"} message=${err instanceof Error ? err.message : "unknown"}`
    );
    if (!res.headersSent) res.status(502).end();
    else res.destroy();
  });
  streamed.body.pipe(res);
  return true;
}

export async function readSmallStoredFile(stored: string, maxBytes = 8 * 1024 * 1024): Promise<Buffer | null> {
  const local = localPathIfExists(stored);
  if (local) {
    const buf = fs.readFileSync(local);
    if (buf.length > maxBytes) return null;
    return buf;
  }
  if (!isB2Configured()) {
    if (path.isAbsolute(stored) && fs.existsSync(stored)) {
      return fs.readFileSync(stored);
    }
    return null;
  }
  const key = b2KeyFromPublicPath(stored);
  if (!key) {
    if (path.isAbsolute(stored) && fs.existsSync(stored)) return fs.readFileSync(stored);
    return null;
  }
  const meta = await headObject(key);
  if (!meta || (meta.contentLength && meta.contentLength > maxBytes)) return null;
  const { body } = await getObjectStream(key);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) return null;
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}
