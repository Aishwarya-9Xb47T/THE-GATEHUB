/**
 * Sync AI Architect uploaded videos into Learning Universe assets so publish validation passes.
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "../../utils/prisma.js";
import type { VideoMapping } from "./types.js";
import { architectUploadStorageRefs } from "./videoAssignmentEngine.js";
import type { ParsedLearningUniverse } from "../../controllers/learning-universe-parser.js";
import { collectMediaReferences } from "../learningUniverseMedia.js";
import { loadProjectFiles } from "../luProject/luProjectFiles.js";
import {
  isProjectImageAsset,
  isProjectVideoAsset,
  resolveProjectAssetRef,
} from "../luProject/luProjectAssetResolver.js";
import { mimeFromUploadPath } from "../../utils/uploadMedia.js";

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
  const universeAssetsDir = path.join(ASSETS_DIR, universeId);
  if (!fs.existsSync(universeAssetsDir)) fs.mkdirSync(universeAssetsDir, { recursive: true });

  let synced = 0;
  const seen = new Set<string>();

  for (const file of files) {
    if (!isProjectVideoAsset(file) || !file.s3Url) continue;
    const basename = file.name;
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

    const ext = path.extname(basename) || path.extname(srcPath) || ".mp4";
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
        mimeType: mimeFromUploadPath(basename, `video/${ext.replace(".", "") || "mp4"}`),
        size: statSize,
        learningUniverseId: universeId,
      },
    });
    synced++;
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

  const projectsRoot = path.join(UPLOAD_DIR, "projects");
  if (fs.existsSync(projectsRoot)) {
    for (const projectId of fs.readdirSync(projectsRoot)) {
      const projectDir = path.join(projectsRoot, projectId);
      if (!fs.statSync(projectDir).isDirectory()) continue;
      candidates.push(path.join(projectDir, basename));
      try {
        for (const entry of fs.readdirSync(projectDir)) {
          if (entry.toLowerCase() === basename.toLowerCase()) {
            candidates.push(path.join(projectDir, entry));
          }
        }
      } catch {
        /* ignore unreadable project dir */
      }
    }
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  for (const stored of architectUploadStorageRefs({ file: trimmed, url: trimmed })) {
    const hydrated = await resolveStoredUploadPath(stored);
    if (hydrated && fs.existsSync(hydrated)) return hydrated;
  }
  return null;
}

/** Register uploaded video files as LearningUniverseAsset records. */
export async function syncArchitectMediaAssets(
  universeId: string,
  mappings: VideoMapping[]
): Promise<number> {
  const uploadVideos = mappings.filter((m) => m.type === "upload" && (m.file || m.url));
  if (!uploadVideos.length) return 0;

  const universeAssetsDir = path.join(ASSETS_DIR, universeId);
  if (!fs.existsSync(universeAssetsDir)) fs.mkdirSync(universeAssetsDir, { recursive: true });

  let synced = 0;
  const seen = new Set<string>();

  for (const mapping of uploadVideos) {
    const basename = path
      .basename((mapping.file || mapping.url || "").replace(/^.*\/uploads\//, "").replace(/\\/g, "/"))
      .trim();
    if (!basename || seen.has(basename.toLowerCase())) continue;
    seen.add(basename.toLowerCase());

    const existing = await prisma.learningUniverseAsset.findFirst({
      where: { learningUniverseId: universeId, filename: basename },
    });
    if (existing) continue;

    let srcPath: string | null = null;
    try {
      for (const stored of architectUploadStorageRefs(mapping)) {
        srcPath = await resolveUploadSourcePath(stored);
        if (srcPath) break;
      }
      if (!srcPath) {
        srcPath = await resolveUploadSourcePath(mapping.file || mapping.url || basename);
      }
    } catch (err) {
      console.warn(
        `[AI Architect] Video hydrate failed for ${basename}:`,
        err instanceof Error ? err.message : err
      );
      continue;
    }
    if (!srcPath) {
      console.info(`[AI Architect] Registering pre-uploaded video asset metadata: ${basename}`);
      const ext = path.extname(basename) || ".mp4";
      await prisma.learningUniverseAsset.create({
        data: {
          filename: basename,
          storedFilename: basename,
          mimeType: mimeFromUploadPath(basename, "video/mp4"),
          size: mapping.size || 0,
          learningUniverseId: universeId,
        },
      });
      synced++;
      continue;
    }

    const ext = path.extname(basename) || path.extname(srcPath) || ".mp4";
    const storedFilename = `${randomUUID()}${ext}`;
    const destPath = path.join(universeAssetsDir, storedFilename);
    const size = fs.statSync(srcPath).size;
    fs.copyFileSync(srcPath, destPath);
    const { persistAtPublicRelative } = await import("../../middlewares/persistUpload.js");
    await persistAtPublicRelative(destPath, `learning-universes/${universeId}/${storedFilename}`, undefined, { keepLocal: true });

    await prisma.learningUniverseAsset.create({
      data: {
        filename: basename,
        storedFilename,
        mimeType: mimeFromUploadPath(basename, "video/mp4"),
        size,
        learningUniverseId: universeId,
      },
    });
    synced++;
  }

  return synced;
}

/** Before publish: auto-register referenced upload media (videos + images) found in /uploads. */
export async function ensureUniverseMediaFromReferences(
  universeId: string,
  parsed: ParsedLearningUniverse,
  sourceProjectId?: string
): Promise<void> {
  if (sourceProjectId) {
    await syncAllProjectImagesToUniverse(universeId, sourceProjectId);
    await syncAllProjectVideosToUniverse(universeId, sourceProjectId);
  }

  const refs = collectMediaReferences(parsed);
  if (!refs.length) return;

  const projectFiles = sourceProjectId ? await loadProjectFiles(sourceProjectId) : undefined;

  const videoMappings: VideoMapping[] = refs
    .filter((r) => r.blockType === "video")
    .map((r) => ({
      type: "upload" as const,
      file: path.basename(r.filename),
      url: `/uploads/videos/${path.basename(r.filename)}`,
      title: r.lessonTitle,
    }));

  if (videoMappings.length) {
    await syncArchitectMediaAssets(universeId, videoMappings);
  }

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

    const srcPath =
      (await resolveUploadSourcePath(ref.filename)) ??
      (await resolveUploadSourcePath(basename)) ??
      (sourceProjectId
        ? await resolveProjectAssetPathFromFiles(sourceProjectId, ref.filename, projectFiles)
        : null);
    if (!srcPath) {
      console.info(`[AI Architect] Registering pre-uploaded image asset metadata: ${basename}`);
      const ext = path.extname(basename) || ".png";
      await prisma.learningUniverseAsset.create({
        data: {
          filename: basename,
          storedFilename: basename,
          mimeType: mimeFromUploadPath(basename, "image/png"),
          size: 0,
          learningUniverseId: universeId,
        },
      });
      continue;
    }

    const ext = path.extname(basename) || path.extname(srcPath) || ".png";
    const storedFilename = `${randomUUID()}${ext}`;
    const destPath = path.join(universeAssetsDir, storedFilename);
    const size = fs.statSync(srcPath).size;
    fs.copyFileSync(srcPath, destPath);
    const { persistAtPublicRelative } = await import("../../middlewares/persistUpload.js");
    await persistAtPublicRelative(destPath, `learning-universes/${universeId}/${storedFilename}`, undefined, { keepLocal: true });

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
