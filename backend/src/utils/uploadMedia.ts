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

export function mimeFromUploadPath(filePath: string, fallback = "application/octet-stream"): string {
  const ext = path.extname(filePath.split("?")[0]).toLowerCase();
  if (VIDEO_MIME[ext]) return VIDEO_MIME[ext];
  return fallback;
}

export function isVideoUploadPath(filePath: string): boolean {
  return VIDEO_EXT.has(path.extname(filePath.split("?")[0]).toLowerCase());
}

export function parseByteRange(
  rangeHeader: string | undefined,
  fileSize: number
): { start: number; end: number } | null {
  if (!rangeHeader || fileSize <= 0) return null;
  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) return null;
  const start = match[1] ? parseInt(match[1], 10) : 0;
  const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= fileSize) {
    return null;
  }
  return { start, end: Math.min(end, fileSize - 1) };
}
