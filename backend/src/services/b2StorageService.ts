/**
 * Backblaze B2 via S3-compatible API.
 * Credentials come only from environment variables — never hard-code secrets.
 */
import { createReadStream, createWriteStream } from "fs";
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
}): Promise<void> {
  const client = getClient();
  const bucket = requireBucket();
  const contentType = params.contentType || detectContentType(params.key);
  const body = createReadStream(params.filePath);
  console.log("[MEDIA_B2] upload_start key=" + params.key);
  try {
    const upload = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: params.key,
        Body: body,
        ContentType: contentType,
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

export async function headObject(key: string): Promise<{ contentType?: string; contentLength?: number } | null> {
  if (!isB2Configured()) return null;
  try {
    const out = await getClient().send(
      new HeadObjectCommand({
        Bucket: requireBucket(),
        Key: key,
      })
    );
    return { contentType: out.ContentType, contentLength: out.ContentLength };
  } catch {
    return null;
  }
}

export async function downloadObjectToFile(key: string, destPath: string): Promise<void> {
  const { body } = await getObjectStream(key);
  await pipeline(body, createWriteStream(destPath));
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
