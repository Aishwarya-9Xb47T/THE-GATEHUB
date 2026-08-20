import path from "path";
import fs from "fs";
import type { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/jwt.js";
import { prisma } from "../utils/prisma.js";
import { isAdminRole, isValidRole, type Role } from "../utils/roles.js";
import type { AuthRequest, JwtPayload } from "./auth.js";
import {
  isPublicUploadPath,
  normalizeUploadRelativePath,
} from "../utils/uploadMedia.js";
import { classroomAssetAccessDecision } from "../services/classroomStudio/classroomAssetAccess.js";

export { isPublicUploadPath, normalizeUploadRelativePath };

const UPLOAD_ROOT = path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");

export function resolveSafeUploadPath(relativePath: string): string | null {
  const cleaned = normalizeUploadRelativePath(relativePath);
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

const PUBLISHED_PROJECT_MEDIA_EXT =
  /\.(mp4|webm|mov|m4v|mkv|ogv|ogg|png|jpe?g|gif|webp|svg)$/i;

export async function canAccessPublishedSourceProjectMedia(
  projectId: string,
  relativePath: string
): Promise<boolean> {
  if (!PUBLISHED_PROJECT_MEDIA_EXT.test(relativePath)) return false;
  const published = await prisma.learningUniverse.findFirst({
    where: { sourceProjectId: projectId, status: "published" },
    select: { id: true },
  });
  return Boolean(published);
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
  const fromOriginal = String(req.originalUrl || req.url || "")
    .split("?")[0]
    .replace(/^\/uploads\/?/i, "");
  const relative = normalizeUploadRelativePath(fromOriginal || req.path || "");
  const classroomMatch = relative.match(/^(classroom(?:-studio)?)\/([^/]+)\//i);

  if (classroomMatch) {
    const user = await identifyUploadUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: "Authentication required to access uploads" });
    }
    const presentationId = classroomMatch[2];
    const presentation = await prisma.presentation.findUnique({
      where: { id: presentationId },
      select: { id: true, instructorId: true },
    });
    if (!presentation) {
      return res.status(404).json({ success: false, error: "Presentation asset not found" });
    }
    let allowed = classroomAssetAccessDecision({
      userId: user.id,
      role: user.role,
      instructorId: presentation.instructorId,
      isParticipant: false,
    });
    if (!allowed) {
      const participant = await prisma.classroomParticipant.findFirst({
        where: { userId: user.id, session: { presentationId } },
        select: { id: true },
      });
      allowed = classroomAssetAccessDecision({
        userId: user.id,
        role: user.role,
        instructorId: presentation.instructorId,
        isParticipant: Boolean(participant),
      });
    }
    if (!allowed) {
      return res.status(403).json({ success: false, error: "Not authorized to access this presentation file" });
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

  if (isPublicUploadPath(relative)) {
    return next();
  }

  const projectMatch = relative.match(/^projects\/([^/]+)\//i);
  if (projectMatch && (await canAccessPublishedSourceProjectMedia(projectMatch[1], relative))) {
    return next();
  }

  const user = await identifyUploadUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: "Authentication required to access uploads" });
  }

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
