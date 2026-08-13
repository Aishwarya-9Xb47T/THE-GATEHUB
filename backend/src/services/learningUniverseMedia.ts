/**
 * Learning Universe uploaded media resolution and validation.
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
}

const REMOTE_PREFIX = /^(https?:\/\/|data:|blob:)/i;

/** AI-generated placeholder paths that are not real uploaded files — skip strict validation. */
const PLACEHOLDER_ASSET_REFS = [
  /^assets\/pdf\/lesson-notes\.pdf$/i,
  /^assets\/datasets\/sample\.csv$/i,
  /^assets\/downloads\/lesson-resources\.zip$/i,
];

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

/** Collect local media filenames referenced in parsed universe. */
export function collectMediaReferences(parsed: ParsedLearningUniverse): MediaReference[] {
  const refs: MediaReference[] = [];

  for (const track of parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const block of lesson.contentBlocks) {
          const c = block.content as Record<string, string>;
          if (block.type === "image") {
            const file = c.file || c.path || c.url;
            if (isLocalMediaRef(file)) {
              refs.push({ filename: file!.trim(), blockType: "image", lessonTitle: lesson.title });
            }
          }
          if (block.type === "video") {
            const file = c.file || (c.type === "upload" ? c.url : undefined) || c.url;
            if (isLocalMediaRef(file)) {
              refs.push({ filename: file!.trim(), blockType: "video", lessonTitle: lesson.title });
            }
          }
          if (block.type === "download" || block.type === "resource") {
            const file = c.file || c.fileurl || c.fileUrl;
            if (isLocalMediaRef(file)) {
              refs.push({
                filename: file!.trim(),
                blockType: block.type as MediaReference["blockType"],
                lessonTitle: lesson.title,
              });
            }
          }
        }
        for (const video of lesson.videos) {
          const file = video.file || (video.type === "upload" ? video.url : undefined);
          if (video.type === "upload" && isLocalMediaRef(file || video.url)) {
            refs.push({
              filename: (file || video.url || "").trim(),
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

export function validateMediaAssets(
  parsed: ParsedLearningUniverse,
  availableFilenames: string[]
): MediaValidationIssue[] {
  const available = new Set(availableFilenames.map((f) => f.toLowerCase()));
  const issues: MediaValidationIssue[] = [];

  for (const ref of collectMediaReferences(parsed)) {
    if (isPlaceholderAssetRef(ref.filename)) continue;

    const base = refBasename(ref.filename);
    const found =
      available.has(ref.filename.toLowerCase()) ||
      available.has(base.toLowerCase()) ||
      [...available].some(
        (a) => refBasename(a).toLowerCase() === base.toLowerCase()
      );

    if (!found) {
      issues.push({
        filename: ref.filename,
        blockType: ref.blockType,
        lessonTitle: ref.lessonTitle,
        message: `Uploaded asset not found: ${ref.filename} (referenced in ${ref.lessonTitle})`,
      });
    }
  }

  return issues;
}

export function findAssetFilename(
  ref: string,
  assets: Array<{ filename: string }>
): string | null {
  if (!ref) return null;
  const exact = assets.find((a) => a.filename === ref);
  if (exact) return exact.filename;
  const ci = assets.find((a) => a.filename.toLowerCase() === ref.toLowerCase());
  return ci?.filename ?? null;
}
