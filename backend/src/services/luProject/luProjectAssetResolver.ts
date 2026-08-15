import path from "path";
import type { ProjectFileRecord } from "./luProjectFiles.js";
import { normalizeProjectPath } from "./luProjectFiles.js";

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|pdf)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|m3u8|ogg)$/i;

export function isProjectImageAsset(file: ProjectFileRecord): boolean {
  if (file.isFolder) return false;
  return IMAGE_EXT.test(file.name) || IMAGE_EXT.test(file.path);
}

export function isProjectVideoAsset(file: ProjectFileRecord): boolean {
  if (file.isFolder) return false;
  return VIDEO_EXT.test(file.name) || VIDEO_EXT.test(file.path);
}

export function isProjectMediaAsset(file: ProjectFileRecord): boolean {
  return isProjectImageAsset(file) || isProjectVideoAsset(file);
}

function normalizeRef(ref: string): string {
  return ref.replace(/\\/g, "/").trim().replace(/^\.\//, "").replace(/^\//, "");
}

function refBasename(ref: string): string {
  return path.basename(normalizeRef(ref));
}

function stripExt(name: string): string {
  const ext = path.extname(name);
  return ext ? name.slice(0, -ext.length) : name;
}

/** Resolve \\includegraphics{...} ref to a project file (basename + path variants, case-insensitive). */
export function resolveProjectAssetRef(
  ref: string,
  files: ProjectFileRecord[]
): ProjectFileRecord | null {
  return resolveProjectMediaAssetRef(ref, files, "image");
}

/** Resolve uploaded image or video asset refs from project files. */
export function resolveProjectMediaAssetRef(
  ref: string,
  files: ProjectFileRecord[],
  kind: "image" | "video" | "any" = "any"
): ProjectFileRecord | null {
  const normalized = normalizeRef(ref);
  const base = refBasename(ref);
  const baseStem = stripExt(base).toLowerCase();
  const withLead = normalized.startsWith("/") ? normalized : `/${normalized}`;
  const normalizedStem = stripExt(normalized).toLowerCase();

  for (const file of files) {
    if (file.isFolder) continue;
    const isImage = isProjectImageAsset(file);
    const isVideo = isProjectVideoAsset(file);
    if (kind === "image" && !isImage) continue;
    if (kind === "video" && !isVideo) continue;
    if (kind === "any" && !isImage && !isVideo) continue;

    const filePath = normalizeProjectPath(file.path);
    const logical = filePath.replace(/^\//, "");
    const fileNameStem = stripExt(file.name).toLowerCase();
    const logicalStem = stripExt(logical).toLowerCase();
    if (
      file.name === base ||
      file.name.toLowerCase() === base.toLowerCase() ||
      fileNameStem === baseStem ||
      logical === normalized ||
      logical.toLowerCase() === normalized.toLowerCase() ||
      logicalStem === normalizedStem ||
      filePath === withLead ||
      filePath.toLowerCase() === withLead.toLowerCase() ||
      logical.endsWith(`/${base}`) ||
      logical.toLowerCase().endsWith(`/${base.toLowerCase()}`) ||
      stripExt(logical).toLowerCase().endsWith(`/${baseStem}`)
    ) {
      return file;
    }
  }

  // Fuzzy: img1.png → img.png when instructor renames slightly
  const stemNoDigits = baseStem.replace(/\d+$/g, "");
  if (stemNoDigits.length >= 2) {
    for (const file of files) {
      if (file.isFolder) continue;
      const isImage = isProjectImageAsset(file);
      const isVideo = isProjectVideoAsset(file);
      if (kind === "image" && !isImage) continue;
      if (kind === "video" && !isVideo) continue;
      if (kind === "any" && !isImage && !isVideo) continue;
      const fileStem = stripExt(file.name).toLowerCase();
      const logicalStem = stripExt(normalizeProjectPath(file.path).replace(/^\//, "")).toLowerCase();
      if (fileStem === stemNoDigits || logicalStem.endsWith(`/${stemNoDigits}`)) {
        return file;
      }
    }
  }

  return null;
}

export function extractIncludeGraphicsRefs(tex: string): string[] {
  const refs = new Set<string>();
  for (const m of tex.matchAll(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g)) {
    const ref = m[1]?.trim();
    if (ref) refs.add(ref);
  }
  return [...refs];
}

/** Extract inline \\includegraphics (with optional center wrappers) in document order. */
export function extractInlineGraphicsFromTex(tex: string): string {
  const segments: string[] = [];
  const centerRe = /\\begin\{center\}[\s\S]*?\\end\{center\}/gi;
  let m: RegExpExecArray | null;
  while ((m = centerRe.exec(tex)) !== null) {
    if (/\\includegraphics/i.test(m[0])) segments.push(m[0].trim());
  }
  const bareRe = /\\includegraphics(?:\[[^\]]*\])?\{[^}]+\}/gi;
  while ((m = bareRe.exec(tex)) !== null) {
    if (!segments.some((s) => s.includes(m![0]))) segments.push(m[0].trim());
  }
  return segments.join("\n\n");
}

/** Remove \\includegraphics (and wrapping center blocks) from prose — keeps PDF/student text clean. */
export function stripIncludeGraphicsFromTex(tex: string): string {
  let result = tex;
  result = result.replace(
    /\\begin\{center\}\s*\\includegraphics(?:\[[^\]]*\])?\{[^}]+\}\s*\\end\{center\}/gi,
    ""
  );
  result = result.replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]+\}/gi, "");
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

/** Canonical publish/preview filename — basename of the uploaded project file. */
export function canonicalAssetFilename(ref: string, resolved: ProjectFileRecord | null): string {
  if (resolved?.name) return resolved.name;
  return refBasename(ref);
}

function physicalFilenameFromS3Url(s3Url: string): string {
  const cleaned = s3Url.replace(/\\/g, "/").split("?")[0];
  try {
    return path.basename(new URL(cleaned, "http://asset.local").pathname);
  } catch {
    return path.basename(cleaned);
  }
}

/**
 * Public HTTP URL for a project asset ref — same DB + s3Url resolution as PDF compile (prepareProjectAssets).
 */
export function resolveProjectAssetPublicUrl(
  ref: string,
  files: ProjectFileRecord[],
  projectId: string
): string {
  const hit = resolveProjectAssetRef(ref, files);
  if (!hit?.s3Url) return "";
  const stored = hit.s3Url;
  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    try {
      const parsed = new URL(stored);
      const host = parsed.hostname;
      if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
        const relative = parsed.pathname;
        const base = process.env.API_URL?.replace(/\/$/, "");
        return base ? `${base}${relative}` : relative;
      }
    } catch {
      /* keep */
    }
    return stored;
  }
  const base = process.env.API_URL?.replace(/\/$/, "") || "";
  return stored.startsWith("/") ? `${base}${stored}` : `${base}/${stored}`;
}

export function resolveProjectAssetPhysicalPath(
  ref: string,
  files: ProjectFileRecord[],
  projectId: string
): { publicUrl: string; physicalFilename: string; logicalPath: string } | null {
  const hit = resolveProjectAssetRef(ref, files);
  if (!hit?.s3Url) return null;
  const physicalFilename = physicalFilenameFromS3Url(hit.s3Url);
  const publicUrl = resolveProjectAssetPublicUrl(ref, files, projectId);
  return {
    publicUrl,
    physicalFilename,
    logicalPath: normalizeProjectPath(hit.path),
  };
}
