/**
 * Project asset URL resolution for Student Preview — mirrors backend luProjectAssetResolver.ts
 * (same matching rules + s3Url → public URL as PDF compile prepareProjectAssets).
 */

import { withUploadAuth } from "@/lib/courseMediaUrls";

export interface ProjectAssetFile {
  name: string;
  path: string;
  s3Url?: string | null;
  isFolder?: boolean;
  content?: string | null;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|pdf)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|m3u8|ogg)$/i;

function isVideoAsset(name: string): boolean {
  return VIDEO_EXT.test(name);
}

function normalizeRef(ref: string): string {
  return ref.replace(/\\/g, "/").trim().replace(/^\.\//, "").replace(/^\//, "");
}

function refBasename(ref: string): string {
  const parts = normalizeRef(ref).split("/");
  return parts[parts.length - 1] || ref;
}

function stripExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function normalizeProjectPath(filePath: string): string {
  const p = filePath.replace(/\\/g, "/");
  return p.startsWith("/") ? p : `/${p}`;
}

/** Shared API base — Student Preview must hit backend :5000, not Vite :5173. */
export function mediaApiBase(): string {
  const env = import.meta.env.VITE_API_BASE_URL;
  if (env) return String(env).replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin;
    if (origin.includes(":5173")) return origin.replace(":5173", ":5000");
    return origin;
  }
  return "http://localhost:5000";
}

function physicalFilenameFromS3Url(s3Url: string): string {
  const cleaned = s3Url.replace(/\\/g, "/").split("?")[0];
  try {
    return cleaned.replace(/^https?:\/\/[^/]+/i, "").split("/").pop() || "";
  } catch {
    return cleaned.split("/").pop() || "";
  }
}

export function extractIncludeGraphicsRefs(tex: string): string[] {
  const refs = new Set<string>();
  for (const m of tex.matchAll(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g)) {
    const ref = m[1]?.trim();
    if (ref) refs.add(ref);
  }
  return [...refs];
}

export function stripIncludeGraphicsFromTex(tex: string): string {
  let result = tex;
  result = result.replace(
    /\\begin\{center\}\s*\\includegraphics(?:\[[^\]]*\])?\{[^}]+\}\s*\\end\{center\}/gi,
    ""
  );
  result = result.replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]+\}/gi, "");
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

/** Match backend resolveProjectMediaAssetRef — logical path + basename variants. */
export function resolveProjectAssetFile(
  ref: string,
  files: ProjectAssetFile[]
): ProjectAssetFile | null {
  const normalized = normalizeRef(ref);
  const base = refBasename(ref);
  const baseStem = stripExt(base).toLowerCase();
  const withLead = normalized.startsWith("/") ? normalized : `/${normalized}`;
  const normalizedStem = stripExt(normalized).toLowerCase();

  for (const file of files) {
    if (file.isFolder) continue;
    const isImage = IMAGE_EXT.test(file.name) || IMAGE_EXT.test(file.path);
    const isVideo = isVideoAsset(file.name) || isVideoAsset(file.path);
    if (!isImage && !isVideo) continue;

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
      logicalStem.endsWith(`/${baseStem}`)
    ) {
      return file;
    }
  }
  return null;
}

export function projectAssetPreviewUrl(file: ProjectAssetFile | null | undefined): string {
  if (!file?.s3Url) return "";
  if (file.s3Url.startsWith("http://") || file.s3Url.startsWith("https://")) {
    return withUploadAuth(file.s3Url);
  }
  const base = mediaApiBase();
  return withUploadAuth(`${base}${file.s3Url.startsWith("/") ? file.s3Url : `/${file.s3Url}`}`);
}

/**
 * Single resolver for Student Preview + PDF parity.
 * Uses DB s3Url physical filename — never filesystem paths or logical-name guesses on disk.
 */
export function resolveProjectAssetPublicUrl(
  ref: string,
  files: ProjectAssetFile[],
  projectId?: string
): string {
  if (!ref?.trim()) return "";
  const hit = resolveProjectAssetFile(ref, files);
  const url = projectAssetPreviewUrl(hit);
  if (url) {
    if (import.meta.env.DEV) {
      console.info("[StudentPreview:image]", {
        stage: "resolve",
        originalRef: ref,
        logicalPath: hit?.path,
        s3Url: hit?.s3Url,
        physicalFilename: hit?.s3Url ? physicalFilenameFromS3Url(hit.s3Url) : null,
        publicUrl: url,
        projectId,
      });
    }
    return url;
  }
  if (import.meta.env.DEV) {
    console.warn("[StudentPreview:image] unresolved", { ref, projectId, fileCount: files.length });
  }
  return "";
}

/** @deprecated use resolveProjectAssetPublicUrl */
export function resolveProjectAssetPreviewUrl(
  ref: string,
  files: ProjectAssetFile[],
  projectId?: string
): string {
  return resolveProjectAssetPublicUrl(ref, files, projectId);
}

export function isProjectMediaFile(file: ProjectAssetFile): boolean {
  if (file.isFolder) return false;
  return (
    Boolean(file.s3Url) ||
    file.path.includes("/assets/") ||
    IMAGE_EXT.test(file.name) ||
    isVideoAsset(file.name)
  );
}
