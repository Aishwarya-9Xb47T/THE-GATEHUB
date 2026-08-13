import path from "path";

/** Resolve a lecture's stored videoUrl to an on-disk path under uploads/. */
export function resolveLectureVideoFilePath(videoUrl: string): string {
  const uploadDir = process.env.UPLOAD_DIR || "uploads";
  let relative = videoUrl.trim();

  const uploadsMarker = "/uploads/";
  const markerIdx = relative.indexOf(uploadsMarker);
  if (markerIdx !== -1) {
    relative = relative.slice(markerIdx + uploadsMarker.length);
  } else if (relative.startsWith("uploads/")) {
    relative = relative.slice("uploads/".length);
  }

  relative = decodeURIComponent(relative.split("?")[0]);

  return path.join(process.cwd(), uploadDir, relative);
}

export function videoContentTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".webm":
      return "video/webm";
    case ".mov":
      return "video/quicktime";
    case ".avi":
      return "video/x-msvideo";
    case ".mkv":
      return "video/x-matroska";
    case ".m4v":
      return "video/x-m4v";
    default:
      return "video/mp4";
  }
}
