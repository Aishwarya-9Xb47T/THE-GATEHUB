import path from "path";

const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".ogv", ".ogg"]);

const VIDEO_MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".ogg": "video/ogg",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".m4v": "video/mp4",
  ".avi": "video/x-msvideo",
};

export type InspectedByteRange =
  | { type: "none" }
  | { type: "unsatisfiable" }
  | { type: "valid"; start: number; end: number };

export function mimeFromUploadPath(filePath: string, fallback = "application/octet-stream"): string {
  const ext = path.extname(filePath.split("?")[0]).toLowerCase();
  if (VIDEO_MIME[ext]) return VIDEO_MIME[ext];
  return fallback;
}

export function isVideoUploadPath(filePath: string): boolean {
  return VIDEO_EXT.has(path.extname(filePath.split("?")[0]).toLowerCase());
}

/** RFC 7233 byte-range inspection. Unsatisfiable ranges must yield HTTP 416, not 200. */
export function inspectByteRange(
  rangeHeader: string | undefined,
  fileSize: number
): InspectedByteRange {
  if (!rangeHeader?.trim()) return { type: "none" };
  if (fileSize <= 0) return { type: "unsatisfiable" };
  const match = rangeHeader.trim().match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) return { type: "unsatisfiable" };

  const hasStart = match[1] !== "";
  const hasEnd = match[2] !== "";
  if (!hasStart && !hasEnd) return { type: "unsatisfiable" };

  let start: number;
  let end: number;
  if (!hasStart && hasEnd) {
    const suffix = parseInt(match[2], 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return { type: "unsatisfiable" };
    start = Math.max(0, fileSize - suffix);
    end = fileSize - 1;
  } else {
    start = parseInt(match[1], 10);
    end = hasEnd ? parseInt(match[2], 10) : fileSize - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= fileSize) {
    return { type: "unsatisfiable" };
  }
  return { type: "valid", start, end: Math.min(end, fileSize - 1) };
}

export function parseByteRange(
  rangeHeader: string | undefined,
  fileSize: number
): { start: number; end: number } | null {
  const inspected = inspectByteRange(rangeHeader, fileSize);
  return inspected.type === "valid" ? { start: inspected.start, end: inspected.end } : null;
}

/**
 * Express `app.use("/uploads")` yields `learning-universes/…`.
 * `app.get("/uploads/*")` yields `uploads/learning-universes/…`.
 */
export function normalizeUploadRelativePath(relativePath: string): string {
  return relativePath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^uploads\//i, "");
}

/** Paths under /uploads that are publicly viewable without authentication. */
export function isPublicUploadPath(relativePath: string): boolean {
  const normalized = normalizeUploadRelativePath(relativePath).toLowerCase();

  if (
    normalized.startsWith("public/") ||
    normalized === "public" ||
    normalized.startsWith("banners/") ||
    normalized === "banners" ||
    normalized.startsWith("learning-universes/") ||
    normalized === "learning-universes" ||
    normalized.startsWith("resources/") ||
    normalized === "resources" ||
    normalized.startsWith("music/") ||
    normalized === "music"
  ) {
    return true;
  }

  if (
    normalized.startsWith("projects/") ||
    normalized.startsWith("latex/") ||
    normalized.startsWith("latex-versions/") ||
    normalized.startsWith("import-artifacts/") ||
    normalized.startsWith("certificates/") ||
    normalized.startsWith("invoices/") ||
    normalized.startsWith("videos/") ||
    normalized.startsWith("pdfs/") ||
    normalized.startsWith("attachments/") ||
    normalized.startsWith("classroom/") ||
    normalized.startsWith("classroom-studio/")
  ) {
    return false;
  }

  const ext = path.extname(normalized);
  const publicImageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".ico"];
  return publicImageExtensions.includes(ext);
}
