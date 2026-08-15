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
  isVideoPublicPath,
  getSignedGetUrl,
  getObjectStream,
  headObject,
  deleteObject,
  downloadObjectToFile,
  unlinkQuietly,
  detectContentType,
  type B2Prefix,
} from "../services/b2StorageService.js";
import { getUploadRoot, resolveSafeUploadPath } from "./uploadAccess.js";

export type { B2Prefix };

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
  await uploadFile({
    filePath: file.path,
    key,
    contentType: file.mimetype || detectContentType(file.originalname || file.filename),
  });
  const meta = await headObject(key);
  if (!meta) {
    throw new Error("B2 upload verification failed");
  }
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
  await uploadFile({
    filePath: params.localPath,
    key,
    contentType: params.contentType || detectContentType(params.originalName || fileName),
  });
  const meta = await headObject(key);
  if (!meta) throw new Error("B2 upload verification failed");
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
  contentType?: string
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
  await uploadFile({
    filePath: localPath,
    key,
    contentType: contentType || detectContentType(cleaned),
  });
  const meta = await headObject(key);
  if (!meta) throw new Error("B2 upload verification failed");
  await unlinkQuietly(localPath);
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
  const existing = localPathIfExists(stored);
  if (existing) return existing;
  if (!isB2Configured()) return null;
  const key = b2KeyFromPublicPath(stored);
  if (!key) return null;
  const relative = key.replace(/^uploads\//, "");
  const dest = resolveSafeUploadPath(relative);
  if (!dest) return null;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await downloadObjectToFile(key, dest);
  return dest;
}

export async function serveStoredUpload(
  res: Response,
  relativePath: string,
  options?: { range?: string; asVideo?: boolean }
): Promise<boolean> {
  const local = resolveSafeUploadPath(relativePath);
  if (local && fs.existsSync(local)) {
    return false;
  }

  if (!isB2Configured()) return false;
  const key = `uploads/${relativePath.replace(/^\/+/, "")}`;
  const meta = await headObject(key);
  if (!meta) return false;

  if (options?.asVideo) {
    const signed = await getSignedGetUrl(key);
    res.redirect(302, signed);
    return true;
  }

  const streamed = await getObjectStream(key, options?.range);
  res.status(streamed.status);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (streamed.contentType) res.setHeader("Content-Type", streamed.contentType);
  if (streamed.contentLength != null) res.setHeader("Content-Length", String(streamed.contentLength));
  if (streamed.contentRange) res.setHeader("Content-Range", streamed.contentRange);
  if (options?.range) res.setHeader("Accept-Ranges", "bytes");
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
