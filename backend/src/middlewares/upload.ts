import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { AppError } from "./errorHandler.js";

import fs from "fs";

const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR || "uploads");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/** Per-type caps (bytes). Default media uploads are capped well below previous 50GB. */
const MAX_FILE_SIZE = Math.min(
  2 * 1024 * 1024 * 1024, // 2 GB hard ceiling for video
  parseInt(process.env.UPLOAD_MAX_BYTES || String(500 * 1024 * 1024), 10) || 500 * 1024 * 1024
);

const allowedMimes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/zip",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "video/avi",
  "text/vtt",
  "text/plain",
  "application/x-subrip",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
]);

const allowedExtensions = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".zip",
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mkv",
  ".m4v",
  ".vtt",
  ".srt",
  ".txt",
  ".mp3",
  ".wav",
  ".ogg",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || "";
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".svg" || file.mimetype === "image/svg+xml") {
      return cb(new AppError(400, "SVG uploads are not allowed"));
    }
    if (allowedExtensions.has(ext)) {
      return cb(null, true);
    }
    if (allowedMimes.has(file.mimetype)) {
      return cb(null, true);
    }
    if (file.mimetype.startsWith("video/")) {
      return cb(null, true);
    }
    return cb(new AppError(400, `File type not allowed: ${file.mimetype} (${ext || "no extension"})`));
  },
});
