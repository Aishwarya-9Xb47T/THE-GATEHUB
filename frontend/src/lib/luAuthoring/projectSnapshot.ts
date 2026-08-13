/**
 * Canonical in-memory project snapshot for compile, publish, and preview.
 * All authoring subsystems must consume this — never ad-hoc partial overlays.
 */

import {
  getCachedModel,
  listDirtyCachedFiles,
} from "./monacoModelCache";
import { isTextLikeProjectPath, sanitizeProjectFileContent } from "@/lib/latexEditor/contentSanitizer";

export interface SnapshotFileEntry {
  name: string;
  content: string;
}

export interface EditorProjectSnapshot {
  projectId: string;
  mainFileName: string;
  files: SnapshotFileEntry[];
  snapshotHash: string;
  editorVersion: number;
  dirtyFileIds: string[];
  assetCount: number;
  capturedAt: number;
}

export interface FileNodeLike {
  id: string;
  path: string;
  name: string;
  isFolder?: boolean;
  content?: string | null;
}

/** FNV-1a — must match backend projectSnapshotHash.ts and latexController hashCompileSnapshot */
export function hashSnapshotPayload(payload: {
  projectId: string;
  mainFileName: string;
  code?: string;
  files: SnapshotFileEntry[];
}): string {
  const normalized = payload.files
    .map((f) => ({ name: f.name.replace(/\\/g, "/"), content: f.content }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const raw = JSON.stringify({
    projectId: payload.projectId,
    mainFileName: payload.mainFileName,
    code: payload.code ?? "",
    files: normalized,
  });
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function resolveFileContent(
  file: FileNodeLike,
  activeFileId: string | undefined,
  getActiveEditorValue: () => string | undefined
): string {
  const cached = getCachedModel(file.id);
  let content = cached?.model.getValue() ?? file.content ?? "";
  if (activeFileId === file.id) {
    const live = getActiveEditorValue();
    if (live != null) content = live;
  }
  return sanitizeProjectFileContent(file.path, content);
}

/** Build full text-file overlay from explorer + Monaco cache (single source of truth). */
export function buildFullTextFileOverlay(
  projectId: string,
  files: FileNodeLike[],
  options: {
    mainFileName?: string;
    activeFileId?: string;
    getActiveEditorValue?: () => string | undefined;
    editorVersion?: number;
  } = {}
): EditorProjectSnapshot {
  const mainFileName = options.mainFileName ?? "main.tex";
  const getActiveEditorValue = options.getActiveEditorValue ?? (() => undefined);
  const overlay: SnapshotFileEntry[] = [];
  let assetCount = 0;

  for (const file of files) {
    if (file.isFolder) continue;
    const path = file.path.replace(/\\/g, "/");
    if (path.startsWith("/.lu/")) continue;
    if (path.includes("/assets/") && !isTextLikeProjectPath(path)) {
      assetCount++;
      continue;
    }
    if (!isTextLikeProjectPath(path)) continue;
    overlay.push({
      name: path.replace(/^\//, ""),
      content: resolveFileContent(file, options.activeFileId, getActiveEditorValue),
    });
  }

  const mainEntry = overlay.find((f) => f.name === mainFileName || f.name.endsWith(`/${mainFileName}`));
  const snapshotHash = hashSnapshotPayload({
    projectId,
    mainFileName,
    code: mainEntry?.content ?? "",
    files: overlay,
  });

  return {
    projectId,
    mainFileName,
    files: overlay,
    snapshotHash,
    editorVersion: options.editorVersion ?? 0,
    dirtyFileIds: listDirtyCachedFiles().map((d) => d.fileId),
    assetCount,
    capturedAt: Date.now(),
  };
}

/** Dirty-only overlay for compile — small payload; DB holds canonical state after flush. */
export function buildDirtyCompileOverlay(
  projectId: string,
  files: FileNodeLike[],
  options: {
    mainFileName?: string;
    activeFileId?: string;
    getActiveEditorValue?: () => string | undefined;
  } = {}
): SnapshotFileEntry[] {
  const mainFileName = options.mainFileName ?? "main.tex";
  const getActiveEditorValue = options.getActiveEditorValue ?? (() => undefined);
  const dirtyIds = new Set(listDirtyCachedFiles().map((d) => d.fileId));
  if (options.activeFileId) dirtyIds.add(options.activeFileId);

  const mainFile = files.find(
    (f) => f.path === `/${mainFileName}` || f.path.endsWith(`/${mainFileName}`) || f.name === mainFileName
  );
  if (mainFile?.id) dirtyIds.add(mainFile.id);

  const overlay: SnapshotFileEntry[] = [];
  const byId = new Map(files.map((f) => [f.id, f]));
  for (const fileId of dirtyIds) {
    const file = byId.get(fileId);
    if (!file || file.isFolder || !isTextLikeProjectPath(file.path)) continue;
    overlay.push({
      name: file.path.replace(/^\//, ""),
      content: resolveFileContent(file, options.activeFileId, getActiveEditorValue),
    });
  }
  return overlay;
}

export async function fetchServerSnapshotHash(projectId: string): Promise<string | undefined> {
  const { api } = await import("@/lib/api");
  const res = await api<{ success: boolean; snapshotHash?: string }>(
    `/latex-projects/${projectId}/sync/snapshot`
  );
  return res.data?.snapshotHash;
}

export function snapshotToCompilePayload(snapshot: EditorProjectSnapshot): {
  files: SnapshotFileEntry[];
  snapshotHash: string;
  mainFileName: string;
  code?: string;
} {
  const main =
    snapshot.files.find((f) => f.name === snapshot.mainFileName) ??
    snapshot.files.find((f) => f.name.endsWith(`/${snapshot.mainFileName}`));
  return {
    files: snapshot.files,
    snapshotHash: snapshot.snapshotHash,
    mainFileName: snapshot.mainFileName,
    code: main?.content,
  };
}
