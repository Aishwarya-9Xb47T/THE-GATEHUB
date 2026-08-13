/**
 * Project sync state — single version ledger for save / compile / publish / preview.
 * Stored in /.lu/sync-state.json inside the project file tree.
 */

import { prisma } from "../../utils/prisma.js";
import { loadProjectFiles, normalizeProjectPath } from "./luProjectFiles.js";
import { hashFromProjectFiles } from "./projectSnapshotHash.js";

export const SYNC_STATE_PATH = "/.lu/sync-state.json";

export interface ProjectSyncState {
  projectVersion: number;
  editorVersion: number;
  lastSavedAt: string;
  lastSnapshotHash: string;
  publishedSnapshotHash?: string;
  publishedVersion?: number;
  compiledSnapshotHash?: string;
  compiledVersion?: number;
  previewSnapshotHash?: string;
  assetCount: number;
  dirtyFiles: string[];
}

const DEFAULT_STATE: ProjectSyncState = {
  projectVersion: 0,
  editorVersion: 0,
  lastSavedAt: new Date(0).toISOString(),
  lastSnapshotHash: "",
  assetCount: 0,
  dirtyFiles: [],
};

export async function loadProjectSyncState(projectId: string): Promise<ProjectSyncState> {
  const row = await prisma.latexFile.findFirst({
    where: { projectId, path: SYNC_STATE_PATH },
  });
  if (!row?.content?.trim()) return { ...DEFAULT_STATE };
  try {
    return { ...DEFAULT_STATE, ...(JSON.parse(row.content) as ProjectSyncState) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function upsertSyncStateFile(projectId: string, state: ProjectSyncState): Promise<void> {
  const content = JSON.stringify(state, null, 2);
  const existing = await prisma.latexFile.findFirst({
    where: { projectId, path: SYNC_STATE_PATH },
  });
  if (existing) {
    await prisma.latexFile.update({
      where: { id: existing.id },
      data: { content },
    });
    return;
  }
  await prisma.latexFile.create({
    data: {
      projectId,
      path: SYNC_STATE_PATH,
      name: "sync-state.json",
      isFolder: false,
      content,
    },
  });
}

export function countProjectAssets(files: Awaited<ReturnType<typeof loadProjectFiles>>): number {
  return files.filter((f) => {
    if (f.isFolder) return false;
    const path = normalizeProjectPath(f.path);
    return path.includes("/assets/") && Boolean(f.s3Url || f.content);
  }).length;
}

export async function updateProjectSyncState(
  projectId: string,
  patch: Partial<ProjectSyncState> & { recomputeHash?: boolean }
): Promise<ProjectSyncState> {
  const current = await loadProjectSyncState(projectId);
  const files = await loadProjectFiles(projectId);
  const next: ProjectSyncState = {
    ...current,
    ...patch,
    assetCount: patch.assetCount ?? countProjectAssets(files),
    lastSavedAt: patch.lastSavedAt ?? new Date().toISOString(),
  };
  if (patch.recomputeHash !== false) {
    next.lastSnapshotHash = hashFromProjectFiles(projectId, files);
  }
  await upsertSyncStateFile(projectId, next);
  await prisma.latexProject.update({
    where: { id: projectId },
    data: { updatedAt: new Date() },
  });
  return next;
}

export async function verifySnapshotHash(
  projectId: string,
  expectedHash: string | undefined,
  fileOverlay?: Map<string, string>
): Promise<{ ok: boolean; actualHash: string; state: ProjectSyncState }> {
  let files = await loadProjectFiles(projectId);
  if (fileOverlay?.size) {
    files = files.map((f) => {
      if (f.isFolder) return f;
      const override = fileOverlay.get(normalizeProjectPath(f.path));
      return override != null ? { ...f, content: override } : f;
    });
  }
  const actualHash = hashFromProjectFiles(projectId, files);
  const state = await loadProjectSyncState(projectId);
  if (!expectedHash) {
    return { ok: true, actualHash, state };
  }
  return { ok: actualHash === expectedHash, actualHash, state };
}

export function logSyncOperation(
  operation: string,
  projectId: string,
  details: Record<string, unknown>
): void {
  console.info(`[ProjectSync] ${operation}`, { projectId, ...details });
}
