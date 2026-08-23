/**
 * Backblaze B2 via S3-compatible API.
 * Credentials come only from environment variables — never hard-code secrets.
 */
import { createReadStream, createWriteStream, statSync } from "fs";
import { unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { pipeline } from "stream/promises";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import { lookup as lookupMime } from "mime-types";

export const B2_PREFIXES = [
  "videos",
  "images",
  "banners",
  "pdfs",
  "attachments",
  "projects",
  "certificates",
  "invoices",
  "classroom",
  "music",
  "avatars",
  "latex",
  "other",
] as const;

export type B2Prefix = (typeof B2_PREFIXES)[number];

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".ogv", ".ogg"]);
const SIGNED_URL_TTL_SECONDS = 10 * 60;
const MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024;

let cachedClient: S3Client | null | undefined;

export function isB2Configured(): boolean {
  return Boolean(
    process.env.B2_APPLICATION_KEY_ID?.trim() &&
      process.env.B2_APPLICATION_KEY?.trim() &&
      process.env.B2_BUCKET_NAME?.trim() &&
      process.env.B2_ENDPOINT?.trim() &&
      process.env.B2_REGION?.trim()
  );
}

/** Safe production log — never includes keys/secrets. */
export function describeB2ConfigSafe(): {
  configured: boolean;
  bucket: string | null;
  endpoint: string | null;
  region: string | null;
  prefix: string;
} {
  return {
    configured: isB2Configured(),
    bucket: process.env.B2_BUCKET_NAME?.trim() || null,
    endpoint: process.env.B2_ENDPOINT?.trim() || null,
    region: process.env.B2_REGION?.trim() || null,
    prefix: "uploads/classroom/",
  };
}

function httpStatusOf(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  return (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireBucket(): string {
  const bucket = process.env.B2_BUCKET_NAME?.trim();
  if (!bucket) throw new Error("B2_BUCKET_NAME is not configured");
  return bucket;
}

function getClient(): S3Client {
  if (!isB2Configured()) {
    throw new Error("Backblaze B2 is not configured");
  }
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: process.env.B2_REGION!.trim(),
    endpoint: process.env.B2_ENDPOINT!.trim(),
    credentials: {
      accessKeyId: process.env.B2_APPLICATION_KEY_ID!.trim(),
      secretAccessKey: process.env.B2_APPLICATION_KEY!.trim(),
    },
    forcePathStyle: true,
    // AWS SDK v3 defaults to sending checksums B2 does not fully honor (wrong/missing HEAD sizes, 400s).
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return cachedClient;
}

export function detectContentType(fileName: string, fallback?: string): string {
  const mime = lookupMime(fileName);
  if (mime) return mime;
  return fallback || "application/octet-stream";
}

function sanitizeFileName(originalName?: string): { base: string; ext: string } {
  const raw = (originalName || "file").replace(/\\/g, "/").split("/").pop() || "file";
  const ext = path.extname(raw).toLowerCase().replace(/[^a-z0-9.]/g, "") || "";
  return { base: randomUUID(), ext };
}

export function buildObjectKey(prefix: B2Prefix, originalName?: string, extraPath?: string): string {
  const { base, ext } = sanitizeFileName(originalName);
  const fileName = `${base}${ext}`;
  const extra = extraPath
    ? extraPath
        .replace(/\\/g, "/")
        .split("/")
        .filter((p) => p && p !== ".." && p !== ".")
        .join("/")
    : "";
  return extra ? `uploads/${prefix}/${extra}/${fileName}` : `uploads/${prefix}/${fileName}`;
}

export function buildObjectKeyWithName(prefix: B2Prefix, fileName: string, extraPath?: string): string {
  const safe = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  const extra = extraPath
    ? extraPath
        .replace(/\\/g, "/")
        .split("/")
        .filter((p) => p && p !== ".." && p !== ".")
        .join("/")
    : "";
  return extra ? `uploads/${prefix}/${extra}/${safe}` : `uploads/${prefix}/${safe}`;
}

/** Durable app path stored in Neon, e.g. /uploads/videos/<uuid>.mp4 */
export function publicPathFromKey(key: string): string {
  const cleaned = key.replace(/^\/+/, "");
  return `/${cleaned}`;
}

/** Map a stored /uploads/... path (or absolute URL containing /uploads/) to a B2 object key. */
export function b2KeyFromPublicPath(stored: string): string | null {
  const trimmed = String(stored || "").trim().replace(/[\r\n]+/g, "");
  if (!trimmed) return null;
  let relative = trimmed;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      relative = new URL(trimmed).pathname;
    }
  } catch {
    /* keep */
  }
  const marker = "/uploads/";
  const idx = relative.indexOf(marker);
  if (idx === -1) {
    if (relative.startsWith("uploads/")) return relative.replace(/^\/+/, "");
    return null;
  }
  return `uploads/${relative.slice(idx + marker.length).replace(/^\/+/, "").split("?")[0]}`;
}

/** Backblaze S3 GetObject/HeadObject miss — message is often exactly "Key not found". */
export function isMissingObjectError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const rec = err as {
    name?: string;
    Code?: string;
    code?: string;
    message?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const name = String(rec.name || rec.Code || rec.code || "");
  if (/NoSuchKey|NoSuchObject/i.test(name)) return true;
  const message = String(rec.message || "").trim();
  if (/^key not found$/i.test(message)) return true;
  if (/specified key does not exist/i.test(message)) return true;
  return false;
}

/** Persist relative /uploads/... paths in Neon — never localhost or signed URLs. */
export function toRelativeUploadPath(stored: string): string {
  const key = b2KeyFromPublicPath(stored);
  if (key) return publicPathFromKey(key);
  return stored.replace(/\?.*$/, "");
}

export function isVideoPublicPath(stored: string): boolean {
  const key = b2KeyFromPublicPath(stored) || stored;
  const ext = path.extname(key.split("?")[0]).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

export async function uploadFile(params: {
  filePath: string;
  key: string;
  contentType?: string;
}): Promise<{ etag?: string; bytes: number }> {
  const client = getClient();
  const bucket = requireBucket();
  const contentType = params.contentType || detectContentType(params.key);
  const bytes = statSync(params.filePath).size;
  const body = createReadStream(params.filePath);
  console.log("[MEDIA_B2] upload_start key=" + params.key + " bytes=" + bytes + " mime=" + contentType);
  try {
    const upload = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: params.key,
        Body: body,
        ContentType: contentType,
        ContentLength: bytes,
      },
      queueSize: 3,
      partSize: MULTIPART_THRESHOLD_BYTES,
      leavePartsOnError: false,
    });
    const done = await upload.done();
    console.log("[MEDIA_B2] upload_complete key=" + params.key + " bytes=" + bytes + " etag=" + (done.ETag || ""));
    return { etag: done.ETag, bytes };
  } catch (err) {
    console.error("[MEDIA_B2] upload_failed key=" + params.key + " message=" + (err instanceof Error ? err.message : "unknown"));
    throw err;
  }
}

export async function uploadBuffer(params: {
  body: Buffer;
  key: string;
  contentType?: string;
}): Promise<{ etag?: string; bytes: number }> {
  return uploadExactBuffer(params);
}

/** Single PutObject. Do not multipart classroom PPTX — B2 HEAD after multipart often omits/wrong ContentLength. */
export async function uploadExactBuffer(params: {
  body: Buffer;
  key: string;
  contentType?: string;
}): Promise<{ etag?: string; bytes: number }> {
  const client = getClient();
  const bucket = requireBucket();
  const contentType = params.contentType || detectContentType(params.key);
  const body = Buffer.from(params.body);
  const bytes = body.length;
  console.log("[MEDIA_B2] upload_start key=" + params.key + " bytes=" + bytes + " mime=" + contentType + " method=PutObject");
  try {
    const out = await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: params.key,
        Body: body,
        ContentType: contentType,
        ContentLength: bytes,
      }),
    );
    console.log("[MEDIA_B2] upload_complete key=" + params.key + " bytes=" + bytes + " etag=" + (out.ETag || "") + " method=PutObject");
    return { etag: out.ETag, bytes };
  } catch (err) {
    console.error("[MEDIA_B2] upload_failed key=" + params.key + " message=" + (err instanceof Error ? err.message : "unknown"));
    throw err;
  }
}

export async function uploadStream(params: {
  body: NodeJS.ReadableStream;
  key: string;
  contentType?: string;
}): Promise<void> {
  const client = getClient();
  const bucket = requireBucket();
  console.log("[MEDIA_B2] upload_start key=" + params.key);
  try {
    const upload = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: params.key,
        Body: params.body as never,
        ContentType: params.contentType || detectContentType(params.key),
      },
      queueSize: 3,
      partSize: MULTIPART_THRESHOLD_BYTES,
      leavePartsOnError: false,
    });
    await upload.done();
    console.log("[MEDIA_B2] upload_complete key=" + params.key);
  } catch (err) {
    console.error("[MEDIA_B2] upload_failed key=" + params.key + " message=" + (err instanceof Error ? err.message : "unknown"));
    throw err;
  }
}

/** Small files only (banners already in memory, tiny HTML). Do not use for videos. */
export async function uploadSmallBuffer(params: {
  body: Buffer;
  key: string;
  contentType?: string;
}): Promise<void> {
  if (params.body.length > 8 * 1024 * 1024) {
    throw new Error("uploadSmallBuffer refused: file exceeds 8 MB; use uploadFile/stream");
  }
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: requireBucket(),
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType || detectContentType(params.key),
    })
  );
}

export async function getObjectStream(
  key: string,
  range?: string
): Promise<{ body: NodeJS.ReadableStream; contentType?: string; contentLength?: number; contentRange?: string; status: number }> {
  const client = getClient();
  const out: GetObjectCommandOutput = await client.send(
    new GetObjectCommand({
      Bucket: requireBucket(),
      Key: key,
      Range: range,
    })
  );
  if (!out.Body) {
    throw new Error("Empty B2 object body");
  }
  return {
    body: out.Body as NodeJS.ReadableStream,
    contentType: out.ContentType,
    contentLength: out.ContentLength,
    contentRange: out.ContentRange,
    status: out.$metadata.httpStatusCode || (range ? 206 : 200),
  };
}

export async function getSignedGetUrl(key: string, expiresInSeconds = SIGNED_URL_TTL_SECONDS): Promise<string> {
  const client = getClient();
  const command = new GetObjectCommand({
    Bucket: requireBucket(),
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export async function deleteObject(key: string): Promise<void> {
  if (!isB2Configured()) return;
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: requireBucket(),
      Key: key,
    })
  );
}

export async function headObject(key: string): Promise<{ contentType?: string; contentLength?: number; etag?: string } | null> {
  if (!isB2Configured()) return null;
  try {
    const out = await getClient().send(
      new HeadObjectCommand({
        Bucket: requireBucket(),
        Key: key,
      })
    );
    return { contentType: out.ContentType, contentLength: out.ContentLength, etag: out.ETag };
  } catch (err) {
    const status = httpStatusOf(err);
    const message = err instanceof Error ? err.message : String(err);
    if (status === 404 || isMissingObjectError(err)) {
      return null;
    }
    console.error("[MEDIA_B2] head_error key=" + key + " status=" + (status ?? "unknown") + " message=" + message);
    return null;
  }
}

export async function headObjectWithRetry(
  key: string,
  attempts = 4,
): Promise<{
  meta: { contentType?: string; contentLength?: number; etag?: string } | null;
  status?: number;
  error?: string;
}> {
  let lastStatus: number | undefined;
  let lastError: string | undefined;
  const waits = [0, 500, 1000, 2000];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) {
      await sleep(waits[Math.min(attempt - 1, waits.length - 1)] || 2000);
    }
    try {
      const out = await getClient().send(
        new HeadObjectCommand({
          Bucket: requireBucket(),
          Key: key,
        }),
      );
      return {
        meta: { contentType: out.ContentType, contentLength: out.ContentLength, etag: out.ETag },
        status: out.$metadata?.httpStatusCode,
      };
    } catch (err) {
      lastStatus = httpStatusOf(err);
      lastError = err instanceof Error ? err.message : String(err);
      const missing = lastStatus === 404 || isMissingObjectError(err);
      console.warn("[MEDIA_B2] head_retry key=" + key + " attempt=" + attempt + " status=" + (lastStatus ?? "unknown") + " message=" + lastError);
      if (!missing) {
        return { meta: null, status: lastStatus, error: lastError };
      }
    }
  }
  return { meta: null, status: lastStatus, error: lastError };
}

/**
 * Decide whether a completed PutObject/Upload should be persisted.
 * B2 S3 HeadObject often returns 403 when the application key has writeFiles
 * but not listFiles. Playback already uses GetObject (backend proxy), so HEAD
 * 403 is a verification-permission issue — not proof the object is missing.
 */
export function interpretUploadVerification(input: {
  putSucceeded: boolean;
  putBytes: number;
  headStatus?: number;
  readableViaGetOrList: boolean;
}): { accept: boolean; missing: boolean; permissionDenied: boolean } {
  if (!input.putSucceeded || input.putBytes <= 0) {
    return { accept: false, missing: true, permissionDenied: false };
  }
  if (input.readableViaGetOrList) {
    return { accept: true, missing: false, permissionDenied: false };
  }
  if (input.headStatus === 404) {
    return { accept: false, missing: true, permissionDenied: false };
  }
  if (input.headStatus === 403) {
    return { accept: true, missing: false, permissionDenied: true };
  }
  return { accept: true, missing: false, permissionDenied: false };
}

/** After PutObject succeeds: HEAD, then list/range-GET. 403 must not fail the upload. */
export async function confirmUploadedObject(
  key: string,
  uploaded: { etag?: string; bytes: number },
): Promise<{
  accepted: boolean;
  missing: boolean;
  permissionDenied: boolean;
  source: "head" | "list" | "range" | "put";
  bytes?: number;
  status?: number;
  error?: string;
}> {
  const stat = await statObjectBytes(key);
  const readable = stat.source === "head" || stat.source === "list" || stat.source === "range";
  const decision = interpretUploadVerification({
    putSucceeded: uploaded.bytes > 0,
    putBytes: uploaded.bytes,
    headStatus: stat.status,
    readableViaGetOrList: readable && (stat.source !== "head" || (Number(stat.bytes) > 0 || Boolean(stat.etag))),
  });
  if (readable && (Number(stat.bytes) > 0 || stat.source === "head")) {
    return {
      accepted: true,
      missing: false,
      permissionDenied: false,
      source: stat.source,
      bytes: stat.bytes ?? uploaded.bytes,
      status: stat.status,
    };
  }
  if (decision.missing) {
    return {
      accepted: false,
      missing: true,
      permissionDenied: false,
      source: "put",
      status: stat.status,
      error: stat.error,
    };
  }
  if (decision.permissionDenied) {
    console.warn(
      "[MEDIA_B2] verify_permission_denied key=" +
        key +
        " status=403 putBytes=" +
        uploaded.bytes +
        " — PutObject succeeded; HEAD is not required. Playback uses GetObject.",
    );
  } else {
    console.warn(
      "[MEDIA_B2] verify_inconclusive key=" +
        key +
        " status=" +
        (stat.status ?? "unknown") +
        " putBytes=" +
        uploaded.bytes +
        " — persisting PutObject result",
    );
  }
  return {
    accepted: true,
    missing: false,
    permissionDenied: decision.permissionDenied,
    source: "put",
    bytes: uploaded.bytes,
    status: stat.status,
    error: stat.error,
  };
}

export function parseContentRangeTotal(contentRange?: string | null): number | undefined {
  if (!contentRange) return undefined;
  const match = String(contentRange).match(/\/(\d+)\s*$/);
  if (!match) return undefined;
  const total = Number(match[1]);
  return Number.isFinite(total) && total >= 0 ? total : undefined;
}

async function drainStream(body: NodeJS.ReadableStream): Promise<void> {
  for await (const _chunk of body as AsyncIterable<unknown>) {
    /* discard */
  }
}

/** B2 HeadObject often omits ContentLength. Fall back to ListObjects Size, then a 1-byte Range GET. */
export async function statObjectBytes(key: string): Promise<{
  bytes?: number;
  etag?: string;
  contentType?: string;
  status?: number;
  source: "head" | "list" | "range" | "missing";
  error?: string;
}> {
  const head = await headObjectWithRetry(key);
  const headLen = Number(head.meta?.contentLength);
  if (head.meta && Number.isFinite(headLen) && headLen > 0) {
    return {
      bytes: headLen,
      etag: head.meta.etag,
      contentType: head.meta.contentType,
      status: head.status,
      source: "head",
    };
  }
  try {
    const listed = await getClient().send(
      new ListObjectsV2Command({
        Bucket: requireBucket(),
        Prefix: key,
        MaxKeys: 8,
      }),
    );
    const match = (listed.Contents ?? []).find((obj) => obj.Key === key);
    if (match && typeof match.Size === "number" && match.Size > 0) {
      return {
        bytes: match.Size,
        etag: match.ETag,
        contentType: head.meta?.contentType,
        status: head.status,
        source: "list",
      };
    }
  } catch (err) {
    console.warn("[MEDIA_B2] list_stat_failed key=" + key + " message=" + (err instanceof Error ? err.message : "unknown"));
  }
  try {
    const ranged = await getObjectStream(key, "bytes=0-0");
    await drainStream(ranged.body);
    const total = parseContentRangeTotal(ranged.contentRange);
    if (typeof total === "number" && total > 0) {
      return {
        bytes: total,
        contentType: ranged.contentType,
        status: ranged.status,
        source: "range",
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      source: "missing",
      status: head.status,
      error: head.error || message,
    };
  }
  if (head.meta) {
    return {
      etag: head.meta.etag,
      contentType: head.meta.contentType,
      status: head.status,
      source: "head",
      error: "HEAD succeeded but ContentLength was missing",
    };
  }
  return { source: "missing", status: head.status, error: head.error };
}

export async function downloadObjectToBuffer(key: string): Promise<Buffer> {
  const { body } = await getObjectStream(key);
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function downloadObjectToFile(key: string, destPath: string): Promise<void> {
  const { body } = await getObjectStream(key);
  await pipeline(body, createWriteStream(destPath));
}

export async function listObjectKeys(prefix: string, maxKeys = 250): Promise<string[]> {
  if (!isB2Configured()) return [];
  const cleaned = prefix.replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("..")) return [];
  const keys: string[] = [];
  let token: string | undefined;
  try {
    do {
      const out = await getClient().send(
        new ListObjectsV2Command({
          Bucket: requireBucket(),
          Prefix: cleaned,
          MaxKeys: Math.min(1000, Math.max(1, maxKeys - keys.length)),
          ContinuationToken: token,
        }),
      );
      for (const obj of out.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
        if (keys.length >= maxKeys) return keys;
      }
      token = out.IsTruncated ? out.NextContinuationToken : undefined;
    } while (token);
  } catch (err) {
    console.error(
      "[MEDIA_B2] list_failed prefix=" +
        cleaned +
        " message=" +
        (err instanceof Error ? err.message : "unknown"),
    );
  }
  return keys;
}

export async function pingB2Storage(): Promise<"connected" | "unconfigured" | "error"> {
  if (!isB2Configured()) return "unconfigured";
  try {
    await getClient().send(new HeadBucketCommand({ Bucket: requireBucket() }));
    return "connected";
  } catch {
    return "error";
  }
}

export async function unlinkQuietly(filePath: string | undefined | null): Promise<void> {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch {
    /* already gone */
  }
}
