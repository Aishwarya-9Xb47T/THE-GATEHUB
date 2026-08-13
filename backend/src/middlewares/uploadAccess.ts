import path from "path";
import fs from "fs";
import type { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/jwt.js";
import { prisma } from "../utils/prisma.js";
import { isAdminRole, isValidRole, type Role } from "../utils/roles.js";
import type { AuthRequest, JwtPayload } from "./auth.js";

const UPLOAD_ROOT = path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");

/** Paths under /uploads that are publicly viewable without authentication. */
export function isPublicUploadPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();

  // Explicitly public directories (banners, learning universes, public assets)
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

  // Protected directories containing private student or document data
  if (
    normalized.startsWith("projects/") ||
    normalized.startsWith("latex/") ||
    normalized.startsWith("latex-versions/") ||
    normalized.startsWith("import-artifacts/") ||
    normalized.startsWith("certificates/") ||
    normalized.startsWith("invoices/")
  ) {
    return false;
  }

  // Allow static images (thumbnails, placeholders, avatars) anywhere else in uploads
  const ext = path.extname(normalized);
  const publicImageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".ico"];
  if (publicImageExtensions.includes(ext)) {
    return true;
  }

  return false;
}

export function resolveSafeUploadPath(relativePath: string): string | null {
  const cleaned = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("\0") || cleaned.split("/").some((p) => p === "..")) {
    return null;
  }
  const absolute = path.resolve(UPLOAD_ROOT, cleaned);
  const rootWithSep = UPLOAD_ROOT.endsWith(path.sep) ? UPLOAD_ROOT : UPLOAD_ROOT + path.sep;
  if (absolute !== UPLOAD_ROOT && !absolute.startsWith(rootWithSep)) {
    return null;
  }
  return absolute;
}

async function identifyUploadUser(req: AuthRequest): Promise<{ id: string; role: Role } | null> {
  if (req.user?.id) {
    return { id: req.user.id, role: req.user.role };
  }

  const authHeader = req.headers.authorization;
  let token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  // Media tags/players cannot set Authorization; allow short-lived query token for this route only.
  if (!token && typeof req.query.token === "string") {
    token = req.query.token;
  }
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, suspended: true, deletedAt: true, tokenVersion: true },
    });
    if (!user || user.suspended || user.deletedAt) return null;
    if ((decoded.tokenVersion ?? 0) !== user.tokenVersion) return null;
    if (!isValidRole(user.role)) return null;
    return { id: user.id, role: user.role as Role };
  } catch {
    return null;
  }
}

async function canAccessProjectUpload(
  userId: string,
  role: Role,
  projectId: string
): Promise<boolean> {
  if (isAdminRole(role)) return true;
  const project = await prisma.latexProject.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      collaborators: { select: { userId: true } },
    },
  });
  if (!project) return false;
  if (project.ownerId === userId) return true;
  return project.collaborators.some((c) => c.userId === userId);
}

/**
 * Gate /uploads/** — require auth except /uploads/public/**.
 * Project files additionally require owner/collaborator/admin.
 */
export async function requireUploadAccess(req: AuthRequest, res: Response, next: NextFunction) {
  const relative = (req.path || "").replace(/^\/+/, "");

  if (isPublicUploadPath(relative)) {
    return next();
  }

  const user = await identifyUploadUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: "Authentication required to access uploads" });
  }

  const projectMatch = relative.match(/^projects\/([^/]+)\//i);
  if (projectMatch) {
    const allowed = await canAccessProjectUpload(user.id, user.role, projectMatch[1]);
    if (!allowed) {
      return res.status(403).json({ success: false, error: "Not authorized to access this project file" });
    }
  }

  if (!req.user) {
    req.user = {
      id: user.id,
      email: "",
      role: user.role,
      firstName: "",
      lastName: "",
    };
  }

  return next();
}

export function sendUploadFile(res: Response, filePath: string) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: "File not found" });
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.sendFile(filePath);
}

export function getUploadRoot(): string {
  return UPLOAD_ROOT;
}
