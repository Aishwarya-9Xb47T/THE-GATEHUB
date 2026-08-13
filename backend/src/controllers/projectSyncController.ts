import type { Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";
import type { AuthRequest } from "../middlewares/auth.js";
import { sanitizeProjectFileContent } from "../services/latexContentSanitizer.js";
import { loadProjectFiles } from "../services/luProject/luProjectFiles.js";
import {
  loadProjectSyncState,
  updateProjectSyncState,
  logSyncOperation,
  countProjectAssets,
} from "../services/luProject/projectSyncState.js";
import { hashFromProjectFiles } from "../services/luProject/projectSnapshotHash.js";
import { recordTimelineEvent } from "../services/latexVersionService.js";
import fs from "fs";
import path from "path";

interface FlushFileEntry {
  fileId: string;
  content: string;
}

async function assertProjectAccess(projectId: string, userId: string) {
  const project = await prisma.latexProject.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError(404, "Project not found");
  if (project.ownerId !== userId) throw new AppError(403, "Unauthorized access to project");
  return project;
}

/** Ensure binary assets on disk are registered in latexFile rows. */
async function syncAssetsFromDisk(projectId: string): Promise<number> {
  const projectDir = path.join(
    process.cwd(),
    process.env.UPLOAD_DIR || "uploads",
    "projects",
    projectId
  );
  if (!fs.existsSync(projectDir)) return 0;

  const assetDirs = ["assets/images", "assets/videos", "assets/downloads"];
  let synced = 0;

  for (const rel of assetDirs) {
    const abs = path.join(projectDir, rel);
    if (!fs.existsSync(abs)) continue;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const filePath = `/${rel}/${entry.name}`;
      const existing = await prisma.latexFile.findFirst({
        where: { projectId, path: filePath },
      });
      if (existing) {
        if (!existing.s3Url) {
          const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
          const physical = path.join(abs, entry.name);
          const storedName = fs.readdirSync(projectDir).find((f) => {
            try {
              return fs.statSync(path.join(projectDir, f)).ino === fs.statSync(physical).ino;
            } catch {
              return false;
            }
          });
          const localUrl = storedName
            ? `${baseUrl}/uploads/projects/${projectId}/${storedName}`
            : `${baseUrl}/uploads/projects/${projectId}/${entry.name}`;
          await prisma.latexFile.update({
            where: { id: existing.id },
            data: { s3Url: localUrl },
          });
          synced++;
        }
        continue;
      }
      const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
      const physical = path.join(abs, entry.name);
      const storedName = fs.readdirSync(projectDir).find((f) => {
        try {
          return fs.statSync(path.join(projectDir, f)).ino === fs.statSync(physical).ino;
        } catch {
          return false;
        }
      });
      const localUrl = storedName
        ? `${baseUrl}/uploads/projects/${projectId}/${storedName}`
        : `${baseUrl}/uploads/projects/${projectId}/${entry.name}`;
      await prisma.latexFile.create({
        data: {
          projectId,
          path: filePath,
          name: entry.name,
          isFolder: false,
          s3Url: localUrl,
          content: null,
        },
      });
      synced++;
    }
  }
  return synced;
}

/** Batch flush dirty editor files — single save pipeline for compile/publish/preview. */
export async function flushProjectFiles(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  const userId = req.user!.id;
  const startedAt = Date.now();
  await assertProjectAccess(projectId, userId);

  const reason = typeof req.body?.reason === "string" ? req.body.reason : "manual";
  const mode = req.body?.mode === "full" ? "full" : "dirty";
  const editorVersion = Number(req.body?.editorVersion ?? 0);
  const clientHash = typeof req.body?.snapshotHash === "string" ? req.body.snapshotHash : undefined;
  const files = Array.isArray(req.body?.files) ? (req.body.files as FlushFileEntry[]) : [];

  const savedPaths: string[] = [];
  try {
    if (files.length > 0) {
      // Sequential updates — interactive transactions time out on full-project flushes (50+ files).
      for (const entry of files) {
        if (!entry?.fileId || typeof entry.content !== "string") continue;
        const file = await prisma.latexFile.findUnique({
          where: { id: entry.fileId, projectId },
        });
        if (!file || file.isFolder) continue;
        const sanitized = sanitizeProjectFileContent(file.path, entry.content);
        if (reason === "manual" || reason === "publish") {
          const hasGraphics = sanitized.includes("\\includegraphics");
          console.info("[SyncFlush] save file", {
            path: file.path,
            reason,
            bytes: sanitized.length,
            hasIncludegraphics: hasGraphics,
          });
        }
        await prisma.latexFile.update({
          where: { id: file.id },
          data: { content: sanitized },
        });
        savedPaths.push(file.path);
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logSyncOperation("flush-error", projectId, { reason, mode, message });
    throw new AppError(500, `Failed to save project files: ${message}`);
  }

  const assetsSynced = await syncAssetsFromDisk(projectId);
  const allFiles = await loadProjectFiles(projectId);
  const snapshotHash = hashFromProjectFiles(projectId, allFiles);
  const prev = await loadProjectSyncState(projectId);

  const syncState = await updateProjectSyncState(projectId, {
    projectVersion: savedPaths.length > 0 ? prev.projectVersion + 1 : prev.projectVersion,
    editorVersion,
    lastSnapshotHash: snapshotHash,
    dirtyFiles: [],
    assetCount: countProjectAssets(allFiles),
    recomputeHash: false,
  });

  const hashVerified = !clientHash || clientHash === snapshotHash;

  logSyncOperation("flush", projectId, {
    reason,
    mode,
    editorVersion,
    dbVersion: syncState.projectVersion,
    snapshotVersion: syncState.projectVersion,
    snapshotHash,
    clientHash,
    hashMatch: hashVerified,
    assetCount: syncState.assetCount,
    assetsSynced,
    dirtyFiles: savedPaths,
    savedCount: savedPaths.length,
    durationMs: Date.now() - startedAt,
  });

  if (files.length > 0) {
    recordTimelineEvent(projectId, "edited", userId, {
      flush: true,
      reason,
      mode,
      savedCount: savedPaths.length,
      snapshotHash,
    }).catch(() => {});
  }

  res.json({
    success: true,
    savedCount: savedPaths.length,
    syncState,
    snapshotHash,
    hashVerified,
    assetsSynced,
  });
}

/** Return current server snapshot hash + sync versions for client verification. */
export async function getProjectSyncSnapshot(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  await assertProjectAccess(projectId, req.user!.id);

  const files = await loadProjectFiles(projectId);
  const snapshotHash = hashFromProjectFiles(projectId, files);
  const syncState = await loadProjectSyncState(projectId);

  res.json({
    success: true,
    snapshotHash,
    syncState,
    fileCount: files.filter((f) => !f.isFolder).length,
    assetCount: countProjectAssets(files),
  });
}
