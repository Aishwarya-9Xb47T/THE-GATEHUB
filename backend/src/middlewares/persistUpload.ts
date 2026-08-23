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
  extraPath?: string
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
    return `/uploads/${file.filename}`;
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
  await unlinkQuietly(file.path);
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
  return [...new Set([primary, ...classroomAssetLookupRelatives(primary)])];
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

  let key = "";
  let meta: Awaited<ReturnType<typeof headObject>> = null;
  const candidateKeys: string[] = [];
  for (const relative of relatives) {
    const normalized = normalizeUploadRelativePath(relative);
    candidateKeys.push(`uploads/${normalized}`);
    candidateKeys.push(normalized);
  }
  for (const candidateKey of [...new Set(candidateKeys)]) {
    const candidateMeta = await headObject(candidateKey);
    if (candidateMeta) {
      key = candidateKey;
      meta = candidateMeta;
      break;
    }
  }
  if (!meta) {
    for (const candidateKey of [...new Set(candidateKeys)]) {
      try {
        const streamed = await getObjectStream(candidateKey);
        const size = streamed.contentLength ?? 0;
        const mime =
          options?.mimeType ||
          (streamed.contentType && streamed.contentType !== "application/octet-stream"
            ? streamed.contentType
            : mimeFromUploadPath(candidateKey, streamed.contentType));
        applyUploadCorsHeaders(res, options?.origin);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Type", mime);
        if (options?.cacheControl) res.setHeader("Cache-Control", options.cacheControl);
        mediaLog("MEDIA_B2", { key: candidateKey, mime, size, found: 1, via: "get_fallback" });
        mediaLog("MEDIA_STREAM", {
          key: candidateKey,
          mime,
          range: "none",
          status: streamed.status || 200,
          length: streamed.contentLength,
          source: "b2",
        });
        if (options?.method === "HEAD") {
          res.status(200);
          if (size) res.setHeader("Content-Length", String(size));
          res.end();
          streamed.body.resume?.();
          return true;
        }
        res.status(streamed.status || 200);
        if (streamed.contentLength != null) res.setHeader("Content-Length", String(streamed.contentLength));
        streamed.body.on("error", (err) => {
          console.error(
            `[MEDIA_STREAM] stream_error key=${candidateKey} message=${err instanceof Error ? err.message : "unknown"}`,
          );
          if (!res.headersSent) res.status(502).end();
          else res.destroy();
        });
        streamed.body.pipe(res);
        return true;
      } catch (err) {
        if (!isMissingObjectError(err) && httpStatusOfGet(err) !== 404) {
          console.warn(
            "[MEDIA_B2] get_fallback_error key=" +
              candidateKey +
              " message=" +
              (err instanceof Error ? err.message : "unknown"),
          );
        }
      }
    }
    mediaLog("MEDIA_B2", { path: relativePath, keysTried: candidateKeys.length, found: 0 });
    return false;
  }

  const size = meta.contentLength ?? 0;
  const mime =
    options?.mimeType ||
    (meta.contentType && meta.contentType !== "application/octet-stream"
      ? meta.contentType
      : mimeFromUploadPath(key, meta.contentType));
  const inspected = inspectByteRange(options?.range, size);
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
  });
  mediaLog("MEDIA_B2", { key, mime, size, found: 1 });

  if (inspected.type === "unsatisfiable") {
    sendUnsatisfiableRange(res, size);
    return true;
  }

  const b2Range =
    inspected.type === "valid" ? `bytes=${inspected.start}-${inspected.end}` : undefined;

  if (options?.method === "HEAD") {
    if (inspected.type === "valid") {
      const chunkSize = inspected.end - inspected.start + 1;
      mediaLog("MEDIA_RANGE", { key, mime, range: options?.range, status: 206, head: 1 });
      res.status(206);
      res.setHeader("Content-Range", `bytes ${inspected.start}-${inspected.end}/${size}`);
      res.setHeader("Content-Length", String(chunkSize));
    } else {
      mediaLog("MEDIA_STREAM", { key, mime, range: "none", status: 200, head: 1 });
      res.status(200);
      if (size) res.setHeader("Content-Length", String(size));
    }
    res.end();
    return true;
  }

  const streamed = await getObjectStream(key, b2Range);
  const status = streamed.status || (b2Range ? 206 : 200);
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
  if (streamed.contentLength != null) res.setHeader("Content-Length", String(streamed.contentLength));
  if (streamed.contentRange) res.setHeader("Content-Range", streamed.contentRange);
  streamed.body.on("error", (err) => {
    console.error(
      `[MEDIA_STREAM] stream_error key=${key} message=${err instanceof Error ? err.message : "unknown"}`
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
