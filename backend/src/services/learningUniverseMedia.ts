/**
 * Learning Universe uploaded media resolution and validation.
 *
 * CRITICAL BOUNDARY:
 * - LaTeX project component files (.tex) are NOT media assets
 * - uploads/latex/** (except pdfs/) are compiler/project paths, NOT course media
 * - Only image/video/download binaries with media extensions are publish-validated
 */

import type { ParsedLearningUniverse } from "../controllers/learning-universe-parser.js";

export interface MediaReference {
  filename: string;
  blockType: "image" | "video" | "download" | "resource";
  lessonTitle: string;
}

export interface MediaValidationIssue {
  filename: string;
  blockType: string;
  lessonTitle: string;
  message: string;
  code?: string;
  stage?: string;
}

const REMOTE_PREFIX = /^(https?:\/\/|data:|blob:)/i;

/** AI-generated placeholder paths that are not real uploaded files — skip strict validation. */
const PLACEHOLDER_ASSET_REFS = [
  /^assets\/pdf\/lesson-notes\.pdf$/i,
  /^assets\/datasets\/sample\.csv$/i,
  /^assets\/downloads\/lesson-resources\.zip$/i,
];

const MEDIA_EXT =
  /\.(mp4|webm|mov|m4v|m3u8|ogg|mp3|wav|png|jpe?g|gif|svg|webp|pdf|zip|csv|txt|json|ipynb)$/i;

const LATEX_SOURCE_EXT = /\.(tex|sty|cls|bib|bst|aux|log|out|toc|lof|lot|bbl|blg|idx|ind|ilg|fls|fdb_latexmk|synctex\.gz)$/i;

const LATEX_COMPONENT_BASENAMES = new Set([
  "videos.tex",
  "overview.tex",
  "objectives.tex",
  "summary.tex",
  "main.tex",
  "metadata.tex",
  "track.tex",
  "module.tex",
  "theory.tex",
  "examples.tex",
  "practice.tex",
]);

function isPlaceholderAssetRef(filename: string): boolean {
  const normalized = filename.trim().replace(/\\/g, "/");
  return PLACEHOLDER_ASSET_REFS.some((p) => p.test(normalized));
}

function refBasename(filename: string): string {
  return filename.trim().replace(/\\/g, "/").split("/").pop() || filename.trim();
}

export function isLocalMediaRef(value: string | undefined | null): boolean {
  if (!value?.trim()) return false;
  return !REMOTE_PREFIX.test(value.trim());
}

/**
 * True only for paths that represent real uploaded course media (not LaTeX sources).
 * Used at the publish asset boundary so component files like lesson-01/videos.tex
 * never fail publish as "Uploaded asset not found".
 */
export function isPublishableMediaAssetRef(filename: string | undefined | null): boolean {
  if (!filename?.trim()) return false;
  const normalized = filename.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized) return false;
  if (REMOTE_PREFIX.test(normalized)) return false;
  if (isPlaceholderAssetRef(normalized)) return false;

  const base = refBasename(normalized).toLowerCase();
  if (LATEX_COMPONENT_BASENAMES.has(base)) return false;
  if (LATEX_SOURCE_EXT.test(base)) return false;

  // Compiler / project trees — never course media (PDF outputs under latex/pdfs/ are OK)
  const lower = normalized.toLowerCase().replace(/^\/+/, "");
  if (lower.startsWith("uploads/latex/") && !lower.startsWith("uploads/latex/pdfs/")) {
    return false;
  }
  if (lower.includes("/lesson-") && lower.endsWith(".tex")) {
    return false;
  }

  // Must look like a real media/download binary
  if (!MEDIA_EXT.test(base)) return false;

  return true;
}

function asContentRecord(content: unknown): Record<string, string> {
  if (!content || typeof content !== "object" || Array.isArray(content)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(content as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function videoLocalFilename(content: Record<string, string>): string | undefined {
  const type = (content.type || "").toLowerCase();
  if (type === "youtube" || type === "placeholder") return undefined;
  // Only upload / missing-type local files — never treat youtube URL as local via || url fallback
  const candidate =
    content.file ||
    (type === "upload" || type === "external" || !type ? content.url : undefined);
  if (!candidate?.trim()) return undefined;
  if (!isLocalMediaRef(candidate)) return undefined;
  return candidate.trim();
}

/** Collect local media filenames referenced in parsed universe. */
export function collectMediaReferences(parsed: ParsedLearningUniverse): MediaReference[] {
  const refs: MediaReference[] = [];

  for (const track of parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const block of lesson.contentBlocks) {
          const c = asContentRecord(block.content);
          if (block.type === "image") {
            const file = c.file || c.path || c.url;
            if (isLocalMediaRef(file) && isPublishableMediaAssetRef(file)) {
              refs.push({ filename: file!.trim(), blockType: "image", lessonTitle: lesson.title });
            }
          }
          if (block.type === "video") {
            const file = videoLocalFilename(c);
            if (file && isPublishableMediaAssetRef(file)) {
              refs.push({ filename: file, blockType: "video", lessonTitle: lesson.title });
            }
          }
          if (block.type === "download" || block.type === "resource") {
            const file = c.file || c.fileurl || c.fileUrl;
            if (isLocalMediaRef(file) && isPublishableMediaAssetRef(file)) {
              refs.push({
                filename: file!.trim(),
                blockType: block.type as MediaReference["blockType"],
                lessonTitle: lesson.title,
              });
            }
          }
        }
        for (const video of lesson.videos) {
          const file = videoLocalFilename({
            type: video.type,
            file: video.file || "",
            url: video.url || "",
          });
          if (video.type === "upload" && file && isPublishableMediaAssetRef(file)) {
            refs.push({
              filename: file,
              blockType: "video",
              lessonTitle: lesson.title,
            });
          }
        }
      }
    }
  }

  return refs;
}

/**
 * Strip invalid media refs (LaTeX .tex paths etc.) from parsed content before publish.
 * Keeps real YouTube / upload video mappings intact.
 */
export function sanitizeParsedMediaReferences(parsed: ParsedLearningUniverse): number {
  let cleaned = 0;

  const scrubVideo = (video: {
    type: string;
    url?: string;
    file?: string;
    title?: string;
  }) => {
    if (video.type === "youtube" || video.type === "placeholder") {
      if (video.file && !isPublishableMediaAssetRef(video.file)) {
        delete video.file;
        cleaned++;
      }
      return;
    }
    if (video.file && !isPublishableMediaAssetRef(video.file) && !REMOTE_PREFIX.test(video.file)) {
      console.warn(
        `[PUBLISH_ASSET_LOOKUP] scrubbing non-media video.file=${video.file} lessonType=${video.type}`
      );
      delete video.file;
      cleaned++;
    }
    if (
      video.url &&
      isLocalMediaRef(video.url) &&
      !isPublishableMediaAssetRef(video.url)
    ) {
      console.warn(
        `[PUBLISH_ASSET_LOOKUP] scrubbing non-media video.url=${video.url}`
      );
      video.url = "";
      cleaned++;
    }
  };

  for (const track of parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const video of lesson.videos) {
          scrubVideo(video);
        }
        for (const block of lesson.contentBlocks) {
          if (block.type === "video" && block.content && typeof block.content === "object") {
            scrubVideo(block.content as { type: string; url?: string; file?: string });
          }
          if (
            (block.type === "image" || block.type === "download" || block.type === "resource") &&
            block.content &&
            typeof block.content === "object"
          ) {
            const c = block.content as Record<string, string>;
            for (const key of ["file", "path", "url", "fileurl", "fileUrl"] as const) {
              const val = c[key];
              if (val && isLocalMediaRef(val) && !isPublishableMediaAssetRef(val)) {
                console.warn(
                  `[PUBLISH_ASSET_LOOKUP] scrubbing non-media ${block.type}.${key}=${val} lesson=${lesson.title}`
                );
                delete c[key];
                cleaned++;
              }
            }
          }
        }
      }
    }
  }

  return cleaned;
}

export function validateMediaAssets(
  parsed: ParsedLearningUniverse,
  availableFilenames: string[],
  context?: { courseId?: string; projectId?: string }
): MediaValidationIssue[] {
  const available = new Set(availableFilenames.map((f) => f.toLowerCase()));
  const issues: MediaValidationIssue[] = [];

  const seen = new Set<string>();
  for (const ref of collectMediaReferences(parsed)) {
    if (isPlaceholderAssetRef(ref.filename)) continue;
    if (!isPublishableMediaAssetRef(ref.filename)) {
      console.info(
        `[PUBLISH_ASSET_LOOKUP] skip_non_media path=${ref.filename} type=${ref.blockType} courseId=${context?.courseId ?? ""} projectId=${context?.projectId ?? ""}`
      );
      continue;
    }

    const dedupeKey = `${ref.blockType}:${refBasename(ref.filename).toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const base = refBasename(ref.filename);
    const found =
      available.has(ref.filename.toLowerCase()) ||
      available.has(base.toLowerCase()) ||
      [...available].some((a) => refBasename(a).toLowerCase() === base.toLowerCase());

    console.info(
      `[PUBLISH_ASSET_LOOKUP] path=${ref.filename} type=${ref.blockType} lesson=${ref.lessonTitle} found=${found ? 1 : 0} courseId=${context?.courseId ?? ""} projectId=${context?.projectId ?? ""}`
    );

    if (!found) {
      issues.push({
        filename: ref.filename,
        blockType: ref.blockType,
        lessonTitle: ref.lessonTitle,
        code: "STORAGE_OBJECT_NOT_FOUND",
        stage: "ASSET_VALIDATION",
        message: `Asset validation failed: type=${ref.blockType.toUpperCase()} storageKey=${ref.filename} reason=STORAGE_OBJECT_NOT_FOUND (lesson=${ref.lessonTitle})`,
      });
    }
  }

  return issues;
}

export type AssetStorageRow = {
  id: string;
  filename: string;
  storedFilename: string;
  mimeType: string;
  size: number;
};

/**
 * After DB filename match: probe the canonical storage object (no full download).
 * Distinguishes OBJECT_NOT_FOUND from auth / bandwidth / rate-limit failures.
 */
export async function validateMediaAssetStorageObjects(
  parsed: ParsedLearningUniverse,
  assets: AssetStorageRow[],
  context?: { courseId?: string; projectId?: string }
): Promise<MediaValidationIssue[]> {
  const { isB2Configured, probeStorageObject, b2KeyFromPublicPath } = await import(
    "./b2StorageService.js"
  );
  const issues: MediaValidationIssue[] = [];
  if (!isB2Configured()) return issues;

  const byBase = new Map<string, AssetStorageRow>();
  for (const a of assets) {
    byBase.set(a.filename.toLowerCase(), a);
    byBase.set(refBasename(a.storedFilename).toLowerCase(), a);
  }

  const seen = new Set<string>();
  for (const ref of collectMediaReferences(parsed)) {
    if (!isPublishableMediaAssetRef(ref.filename)) continue;
    if (ref.blockType !== "video" && ref.blockType !== "image") continue;
    const base = refBasename(ref.filename).toLowerCase();
    if (seen.has(`${ref.blockType}:${base}`)) continue;
    seen.add(`${ref.blockType}:${base}`);

    const asset = byBase.get(base) || byBase.get(ref.filename.toLowerCase());
    if (!asset) continue; // filename-level validateMediaAssets already reported

    const relative = asset.storedFilename.replace(/^\/+/, "").replace(/^uploads\//, "");
    const candidates = new Set<string>([
      b2KeyFromPublicPath(`/uploads/${relative}`) || `uploads/${relative}`,
    ]);
    if (!relative.includes("/")) {
      candidates.add(`uploads/videos/${relative}`);
      candidates.add(`uploads/images/${relative}`);
      if (context?.courseId) {
        candidates.add(`uploads/learning-universes/${context.courseId}/${relative}`);
      }
    }

    console.info(
      `[PUBLISH VIDEO DEBUG] courseId=${context?.courseId ?? ""} projectId=${context?.projectId ?? ""} assetId=${asset.id} type=${ref.blockType.toUpperCase()} originalName=${asset.filename} mimeType=${asset.mimeType} size=${asset.size} storageKey=${relative} publicUrl=/uploads/${relative}`
    );

    let bestCode = "OBJECT_NOT_FOUND";
    let bestKey = [...candidates][0];
    let ok = false;
    let hardFail: string | null = null;
    for (const key of candidates) {
      const probe = await probeStorageObject(key);
      console.info(
        `[PUBLISH VIDEO DEBUG] storage_probe assetId=${asset.id} key=${probe.key} bucket=${probe.bucket ?? ""} code=${probe.code} bytes=${probe.bytes ?? 0}`
      );
      bestCode = probe.code;
      bestKey = probe.key;
      if (probe.code === "EXISTS" || probe.code === "STORAGE_AUTHORIZATION_ERROR") {
        ok = true;
        break;
      }
      if (
        probe.code === "STORAGE_BANDWIDTH_LIMIT" ||
        probe.code === "STORAGE_RATE_LIMIT" ||
        probe.code === "STORAGE_NETWORK_ERROR"
      ) {
        hardFail = probe.code;
        break;
      }
    }

    if (ok) continue;

    const reason = hardFail || (bestCode === "OBJECT_NOT_FOUND" || bestCode === "STORAGE_NOT_CONFIGURED"
      ? "STORAGE_OBJECT_NOT_FOUND"
      : bestCode);

    issues.push({
      filename: relative,
      blockType: ref.blockType,
      lessonTitle: ref.lessonTitle,
      code: reason,
      stage: "ASSET_VALIDATION",
      message: `Asset validation failed: type=${ref.blockType.toUpperCase()} assetId=${asset.id} storageKey=${relative} probedKey=${bestKey} reason=${reason}`,
    });
  }

  return issues;
}

export function findAssetFilename(
  ref: string,
  assets: Array<{ filename: string }>
): string | null {
  if (!ref) return null;
  if (!isPublishableMediaAssetRef(ref) && isLocalMediaRef(ref)) {
    return null;
  }
  const exact = assets.find((a) => a.filename === ref);
  if (exact) return exact.filename;
  const ci = assets.find((a) => a.filename.toLowerCase() === ref.toLowerCase());
  return ci?.filename ?? null;
}
