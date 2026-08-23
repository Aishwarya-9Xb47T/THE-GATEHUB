/**
 * Sync AI Architect uploaded videos into Learning Universe assets so publish validation passes.
 *
 * Canonical contract:
 * - Upload persists at uploads/videos/<uuid>.mp4 (B2 key) → public /uploads/videos/<uuid>.mp4
 * - LearningUniverseAsset.filename = basename (matching publish refs)
 * - LearningUniverseAsset.storedFilename = durable relative key under /uploads (e.g. videos/<uuid>.mp4)
 * - Publish MUST NOT full-download videos merely to register them
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "../../utils/prisma.js";
import type { VideoMapping } from "./types.js";
import {
  architectUploadStorageRefs,
  relativeUploadPathFromRef,
} from "./videoAssignmentEngine.js";
import type { ParsedLearningUniverse } from "../../controllers/learning-universe-parser.js";
import { collectMediaReferences, isPublishableMediaAssetRef } from "../learningUniverseMedia.js";
import { loadProjectFiles } from "../luProject/luProjectFiles.js";
import {
  isProjectImageAsset,
  isProjectVideoAsset,
  resolveProjectAssetRef,
} from "../luProject/luProjectAssetResolver.js";
import { mimeFromUploadPath } from "../../utils/uploadMedia.js";
import {
  b2KeyFromPublicPath,
  isB2Configured,
  probeStorageObject,
  type StorageProbeCode,
} from "../b2StorageService.js";

const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR || "uploads");
const ASSETS_DIR = path.join(UPLOAD_DIR, "learning-universes");

function physicalFilenameFromS3Url(s3Url: string): string {
  try {
    return path.basename(new URL(s3Url).pathname);
  } catch {
    return path.basename(s3Url.split("?")[0].replace(/\\/g, "/"));
  }
}

async function resolveStoredUploadPath(stored: string): Promise<string | null> {
  const { hydrateLocalUpload } = await import("../../middlewares/persistUpload.js");
  return hydrateLocalUpload(stored);
}

async function resolveProjectAssetPathFromFiles(
  projectId: string,
  ref: string,
  files?: Awaited<ReturnType<typeof loadProjectFiles>>
): Promise<string | null> {
  const projectFiles = files ?? (await loadProjectFiles(projectId));
  const hit = resolveProjectAssetRef(ref, projectFiles);
  if (!hit?.s3Url) return null;
  const physical = physicalFilenameFromS3Url(hit.s3Url);
  const p = path.join(UPLOAD_DIR, "projects", projectId, physical);
  if (fs.existsSync(p)) return p;
  return resolveStoredUploadPath(hit.s3Url);
}

function isCanonicalUploadRelative(relative: string): boolean {
  const cleaned = relative.replace(/^\/+/, "");
  return /^(videos|images|banners|pdfs|learning-universes|projects)\//i.test(cleaned);
}

function localPathForRelative(relative: string): string | null {
  const cleaned = relative.replace(/^\/+/, "").replace(/^uploads\//, "");
  const candidates = [
    path.join(UPLOAD_DIR, cleaned),
    path.join(UPLOAD_DIR, path.basename(cleaned)),
    path.join(UPLOAD_DIR, "videos", path.basename(cleaned)),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

type ResolvedVideoStorage = {
  relativeKey: string;
  publicUrl: string;
  b2Key: string;
  size: number;
  probeCode: StorageProbeCode | "LOCAL";
  bucket: string | null;
};

/**
 * Resolve the durable storage key for an upload mapping without downloading the full object.
 */
export async function resolveCanonicalVideoStorage(
  mapping: VideoMapping
): Promise<ResolvedVideoStorage | null> {
  const refs = architectUploadStorageRefs(mapping);
  let lastAuthKey: ResolvedVideoStorage | null = null;

  for (const publicPath of refs) {
    const relative = relativeUploadPathFromRef(publicPath);
    if (!relative) continue;
    const publicUrl = `/uploads/${relative}`;
    const b2Key = b2KeyFromPublicPath(publicUrl) || `uploads/${relative}`;

    const local = localPathForRelative(relative);
    if (local) {
      return {
        relativeKey: relative,
        publicUrl,
        b2Key,
        size: fs.statSync(local).size,
        probeCode: "LOCAL",
        bucket: process.env.B2_BUCKET_NAME?.trim() || null,
      };
    }

    if (!isB2Configured()) continue;

    const probe = await probeStorageObject(b2Key);
    console.info(
      `[PUBLISH VIDEO DEBUG] probe key=${probe.key} bucket=${probe.bucket ?? ""} code=${probe.code} bytes=${probe.bytes ?? 0} status=${probe.status ?? ""}`
    );

    if (probe.code === "EXISTS") {
      return {
        relativeKey: relative,
        publicUrl,
        b2Key,
        size: probe.bytes || mapping.size || 0,
        probeCode: probe.code,
        bucket: probe.bucket,
      };
    }

    if (probe.code === "STORAGE_AUTHORIZATION_ERROR") {
      // Object likely exists; B2 HEAD/list capability gap. Prefer durable videos/ key.
      const candidate: ResolvedVideoStorage = {
        relativeKey: relative,
        publicUrl,
        b2Key,
        size: mapping.size || 0,
        probeCode: probe.code,
        bucket: probe.bucket,
      };
      if (relative.startsWith("videos/") || !lastAuthKey) {
        lastAuthKey = candidate;
      }
      continue;
    }

    if (
      probe.code === "STORAGE_BANDWIDTH_LIMIT" ||
      probe.code === "STORAGE_RATE_LIMIT" ||
      probe.code === "STORAGE_NETWORK_ERROR"
    ) {
      const err = new Error(
        `Asset validation failed: type=VIDEO storageKey=${relative} reason=${probe.code}`
      );
      (err as Error & { code?: string; stage?: string }).code = probe.code;
      (err as Error & { code?: string; stage?: string }).stage = "ASSET_VALIDATION";
      throw err;
    }
  }

  if (lastAuthKey) return lastAuthKey;

  // Repair: local orphan still on disk under alternate layout → re-upload to canonical videos/ key
  const basename = path.basename(
    relativeUploadPathFromRef(mapping.file || mapping.url || "")
  );
  if (basename) {
    const orphanLocal =
      localPathForRelative(basename) ||
      localPathForRelative(`videos/${basename}`);
    if (orphanLocal && fs.existsSync(orphanLocal)) {
      const relativeKey = `videos/${basename}`;
      const { persistAtPublicRelative } = await import("../../middlewares/persistUpload.js");
      const publicUrl = await persistAtPublicRelative(
        orphanLocal,
        relativeKey,
        mimeFromUploadPath(basename, "video/mp4"),
        { keepLocal: true }
      );
      console.info(`[PUBLISH VIDEO DEBUG] repaired orphan local → ${publicUrl}`);
      return {
        relativeKey,
        publicUrl,
        b2Key: b2KeyFromPublicPath(publicUrl) || `uploads/${relativeKey}`,
        size: fs.statSync(orphanLocal).size,
        probeCode: "EXISTS",
        bucket: process.env.B2_BUCKET_NAME?.trim() || null,
      };
    }
  }

  return null;
}

/** Copy all image assets from a LaTeX project into universe storage (publish safety net). */
export async function syncAllProjectImagesToUniverse(
  universeId: string,
  projectId: string
): Promise<number> {
  const files = await loadProjectFiles(projectId);
  const universeAssetsDir = path.join(ASSETS_DIR, universeId);
  if (!fs.existsSync(universeAssetsDir)) fs.mkdirSync(universeAssetsDir, { recursive: true });

  let synced = 0;
  const seen = new Set<string>();

  for (const file of files) {
    if (!isProjectImageAsset(file) || !file.s3Url) continue;
    const basename =
      file.name?.trim() ||
      path.basename(file.path.replace(/\\/g, "/")) ||
      "";
    if (!basename || seen.has(basename.toLowerCase())) continue;
    seen.add(basename.toLowerCase());

    const srcPath =
      (fs.existsSync(
        path.join(UPLOAD_DIR, "projects", projectId, physicalFilenameFromS3Url(file.s3Url))
      )
        ? path.join(UPLOAD_DIR, "projects", projectId, physicalFilenameFromS3Url(file.s3Url))
        : null) || (await resolveStoredUploadPath(file.s3Url));
    if (!srcPath || !fs.existsSync(srcPath)) continue;

    const existing = await prisma.learningUniverseAsset.findFirst({
      where: { learningUniverseId: universeId, filename: basename },
    });
    if (existing) continue;

    const ext = path.extname(basename) || path.extname(srcPath) || ".png";
    const storedFilename = `${randomUUID()}${ext}`;
    const destPath = path.join(universeAssetsDir, storedFilename);
    fs.copyFileSync(srcPath, destPath);
    const { persistAtPublicRelative } = await import("../../middlewares/persistUpload.js");
    await persistAtPublicRelative(destPath, `learning-universes/${universeId}/${storedFilename}`);
    const statSize = fs.existsSync(destPath) ? fs.statSync(destPath).size : fs.statSync(srcPath).size;

    await prisma.learningUniverseAsset.create({
      data: {
        filename: basename,
        storedFilename,
        mimeType: mimeFromUploadPath(basename, `image/${ext.replace(".", "") || "png"}`),
        size: statSize,
        learningUniverseId: universeId,
      },
    });
    synced++;
  }

  return synced;
}

/** Copy all video assets from a LaTeX project into universe storage (publish safety net). */
export async function syncAllProjectVideosToUniverse(
  universeId: string,
  projectId: string
): Promise<number> {
  const files = await loadProjectFiles(projectId);
  let synced = 0;
  const seen = new Set<string>();

  for (const file of files) {
    if (!isProjectVideoAsset(file) || !file.s3Url) continue;
    const basename = file.name;
    if (!basename || seen.has(basename.toLowerCase())) continue;
    seen.add(basename.toLowerCase());

    const relative = relativeUploadPathFromRef(file.s3Url);
    const mapping: VideoMapping = {
      type: "upload",
      file: relative,
      url: file.s3Url.startsWith("/") ? file.s3Url : `/uploads/${relative}`,
      title: basename,
    };
    const n = await syncArchitectMediaAssets(universeId, [mapping]);
    synced += n;
  }

  return synced;
}

async function resolveUploadSourcePath(ref: string): Promise<string | null> {
  const trimmed = ref.trim().replace(/[\r\n]+/g, "");
  if (!trimmed) return null;

  const basename = path.basename(trimmed.replace(/\\/g, "/"));
  const relative = trimmed.replace(/^\/uploads\//, "").replace(/^uploads\//, "");
  const candidates = [
    path.join(UPLOAD_DIR, trimmed),
    path.join(UPLOAD_DIR, relative),
    path.join(UPLOAD_DIR, "videos", basename),
    path.join(UPLOAD_DIR, basename),
    trimmed.startsWith("/uploads/") ? path.join(process.cwd(), trimmed.replace(/^\//, "")) : null,
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  for (const stored of architectUploadStorageRefs({ file: trimmed, url: trimmed })) {
    const hydrated = await resolveStoredUploadPath(stored);
    if (hydrated && fs.existsSync(hydrated)) return hydrated;
  }
  return null;
}

/** Register uploaded video files as LearningUniverseAsset records (canonical key, no full download). */
export async function syncArchitectMediaAssets(
  universeId: string,
  mappings: VideoMapping[]
): Promise<number> {
  const uploadVideos = mappings.filter((m) => m.type === "upload" && (m.file || m.url));
  if (!uploadVideos.length) return 0;

  let synced = 0;
  const seen = new Set<string>();

  for (const mapping of uploadVideos) {
    const basename = path
      .basename(relativeUploadPathFromRef(mapping.file || mapping.url || ""))
      .trim();
    if (!basename || seen.has(basename.toLowerCase())) continue;
    seen.add(basename.toLowerCase());

    console.info(
      `[PUBLISH VIDEO DEBUG] courseId=${universeId} assetBasename=${basename} mappingFile=${mapping.file || ""} mappingUrl=${mapping.url || ""} size=${mapping.size || 0}`
    );

    let resolved: ResolvedVideoStorage | null;
    try {
      resolved = await resolveCanonicalVideoStorage(mapping);
    } catch (err) {
      console.error(
        `[PUBLISH VIDEO DEBUG] resolve_failed basename=${basename} error=${err instanceof Error ? err.message : err}`
      );
      throw err;
    }

    if (!resolved) {
      console.warn(
        `[PUBLISH VIDEO DEBUG] ORPHANED_ASSET basename=${basename} reason=STORAGE_OBJECT_NOT_FOUND — not registering fake READY asset`
      );
      continue;
    }

    const existing = await prisma.learningUniverseAsset.findFirst({
      where: { learningUniverseId: universeId, filename: basename },
    });

    const storedFilename = resolved.relativeKey;
    const mimeType = mimeFromUploadPath(basename, "video/mp4");
    const size = resolved.size || mapping.size || 0;

    console.info(
      `[PUBLISH VIDEO DEBUG] assetId=${existing?.id || "(new)"} storageKey=${storedFilename} bucket=${resolved.bucket ?? ""} probe=${resolved.probeCode} publicUrl=${resolved.publicUrl}`
    );

    if (existing) {
      const needsRepair =
        existing.storedFilename !== storedFilename ||
        (existing.size || 0) !== size ||
        (!isCanonicalUploadRelative(existing.storedFilename) &&
          isCanonicalUploadRelative(storedFilename));
      if (needsRepair) {
        await prisma.learningUniverseAsset.update({
          where: { id: existing.id },
          data: { storedFilename, mimeType, size },
        });
        console.info(
          `[PUBLISH VIDEO DEBUG] repaired assetId=${existing.id} storedFilename ${existing.storedFilename} → ${storedFilename}`
        );
        synced++;
      }
      continue;
    }

    await prisma.learningUniverseAsset.create({
      data: {
        filename: basename,
        storedFilename,
        mimeType,
        size,
        learningUniverseId: universeId,
      },
    });
    synced++;
  }

  return synced;
}

function videoMappingFromMediaRef(filename: string, lessonTitle: string): VideoMapping {
  const relative = relativeUploadPathFromRef(filename);
  const withVideosPrefix =
    relative.includes("/") || !/\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(relative)
      ? relative
      : `videos/${relative}`;
  return {
    type: "upload",
    file: withVideosPrefix,
    url: `/uploads/${withVideosPrefix}`,
    title: lessonTitle,
  };
}

/** Before publish: auto-register referenced upload media (videos + images). */
export async function ensureUniverseMediaFromReferences(
  universeId: string,
  parsed: ParsedLearningUniverse,
  sourceProjectId?: string,
  architectMappings?: VideoMapping[]
): Promise<void> {
  if (sourceProjectId) {
    await syncAllProjectImagesToUniverse(universeId, sourceProjectId);
    await syncAllProjectVideosToUniverse(universeId, sourceProjectId);
  }

  const refs = collectMediaReferences(parsed).filter((r) => isPublishableMediaAssetRef(r.filename));
  const uploadFromArchitect = (architectMappings || []).filter(
    (m) => m.type === "upload" && (m.file || m.url)
  );

  const videoMappings: VideoMapping[] = [];
  const seenVideo = new Set<string>();

  for (const m of uploadFromArchitect) {
    const base = path.basename(relativeUploadPathFromRef(m.file || m.url || "")).toLowerCase();
    if (!base || seenVideo.has(base)) continue;
    seenVideo.add(base);
    videoMappings.push(m);
  }

  for (const r of refs.filter((x) => x.blockType === "video")) {
    const base = path.basename(r.filename.replace(/\\/g, "/")).toLowerCase();
    if (!base || seenVideo.has(base)) continue;
    seenVideo.add(base);
    videoMappings.push(videoMappingFromMediaRef(r.filename, r.lessonTitle));
  }

  if (videoMappings.length) {
    await syncArchitectMediaAssets(universeId, videoMappings);
  }

  if (!refs.length) return;

  const projectFiles = sourceProjectId ? await loadProjectFiles(sourceProjectId) : undefined;
  const imageRefs = refs.filter((r) => r.blockType === "image");
  if (!imageRefs.length) return;

  const universeAssetsDir = path.join(ASSETS_DIR, universeId);
  if (!fs.existsSync(universeAssetsDir)) fs.mkdirSync(universeAssetsDir, { recursive: true });

  const seen = new Set<string>();
  for (const ref of imageRefs) {
    const basename = path.basename(ref.filename.replace(/\\/g, "/"));
    if (!basename || seen.has(basename.toLowerCase())) continue;
    seen.add(basename.toLowerCase());

    const existing = await prisma.learningUniverseAsset.findFirst({
      where: { learningUniverseId: universeId, filename: basename },
    });
    if (existing) continue;

    const relative = relativeUploadPathFromRef(ref.filename);
    const publicUrl = relative.includes("/")
      ? `/uploads/${relative}`
      : `/uploads/images/${basename}`;
    const b2Key = b2KeyFromPublicPath(publicUrl) || `uploads/${relativeUploadPathFromRef(publicUrl)}`;

    if (isB2Configured()) {
      const probe = await probeStorageObject(b2Key);
      if (probe.code === "EXISTS" || probe.code === "STORAGE_AUTHORIZATION_ERROR") {
        await prisma.learningUniverseAsset.create({
          data: {
            filename: basename,
            storedFilename: relativeUploadPathFromRef(publicUrl),
            mimeType: mimeFromUploadPath(basename, "image/png"),
            size: probe.bytes || 0,
            learningUniverseId: universeId,
          },
        });
        continue;
      }
    }

    const srcPath =
      (await resolveUploadSourcePath(ref.filename)) ??
      (await resolveUploadSourcePath(basename)) ??
      (sourceProjectId
        ? await resolveProjectAssetPathFromFiles(sourceProjectId, ref.filename, projectFiles)
        : null);
    if (!srcPath) {
      console.warn(
        `[AI Architect] Image ORPHANED_ASSET basename=${basename} — not registering fake READY asset`
      );
      continue;
    }

    const ext = path.extname(basename) || path.extname(srcPath) || ".png";
    const storedFilename = `images/${randomUUID()}${ext}`;
    const destPath = path.join(UPLOAD_DIR, storedFilename);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    const size = fs.statSync(destPath).size;
    const { persistAtPublicRelative } = await import("../../middlewares/persistUpload.js");
    await persistAtPublicRelative(destPath, storedFilename, undefined, { keepLocal: true });

    await prisma.learningUniverseAsset.create({
      data: {
        filename: basename,
        storedFilename,
        mimeType: mimeFromUploadPath(basename, "image/png"),
        size,
        learningUniverseId: universeId,
      },
    });
  }
}
