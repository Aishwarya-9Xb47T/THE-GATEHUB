import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { AppError } from "./errorHandler.js";

const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR || "uploads", "latex");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 500 MB limit for videos and assets
const MAX_FILE_SIZE = 500 * 1024 * 1024;

const allowedExtensions = new Set([
  ".tex", ".pdf", ".png", ".jpg", ".jpeg",
  ".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv", ".zip", ".md", ".bib", ".sty", ".cls"
]);

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const projectId = req.params.projectId || "common";
    const projectDir = path.join(process.cwd(), process.env.UPLOAD_DIR || "uploads", "projects", projectId);
    
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    cb(null, projectDir);
  },
  filename: (_req, file, cb) => {
    // Preserve original extension, lowercase it for safety
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const latexUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.has(ext)) {
      cb(null, true);
    } else {
      cb(new AppError(400, `File type not allowed: ${ext}. Allowed: .tex, .pdf, .png, .jpg, .jpeg, .mp4, .webm, .zip, .md, .bib, .sty, .cls`));
    }
  },
});
