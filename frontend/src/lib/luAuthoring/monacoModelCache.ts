/**
 * Per-file Monaco model cache — preserves undo history, cursor, and folding across explorer navigation.
 */

import type * as Monaco from "monaco-editor";

export type FileSaveState = "clean" | "dirty" | "saving" | "saved" | "conflict";

interface CachedFileModel {
  model: Monaco.editor.ITextModel;
  savedContent: string;
  loadedFromServer: boolean;
}

const cache = new Map<string, CachedFileModel>();

export function getCachedModel(fileId: string): CachedFileModel | undefined {
  const entry = cache.get(fileId);
  if (entry?.model.isDisposed()) {
    cache.delete(fileId);
    return undefined;
  }
  return entry;
}

export function getOrCreateModel(
  monaco: typeof Monaco,
  fileId: string,
  filePath: string,
  content: string
): CachedFileModel {
  const existing = getCachedModel(fileId);
  if (existing) return existing;

  const uri = monaco.Uri.parse(`inmemory://lu/${fileId}/${filePath.replace(/^\//, "")}`);
  const model = monaco.editor.createModel(content, "latex", uri);
  const entry: CachedFileModel = { model, savedContent: content, loadedFromServer: true };
  cache.set(fileId, entry);
  return entry;
}

export function markModelSaved(fileId: string, content: string): void {
  const entry = cache.get(fileId);
  if (entry) entry.savedContent = content;
}

export function getFileSaveState(fileId: string): FileSaveState {
  const entry = getCachedModel(fileId);
  if (!entry) return "clean";
  return entry.model.getValue() === entry.savedContent ? "clean" : "dirty";
}

export function isFileDirty(fileId: string): boolean {
  return getFileSaveState(fileId) === "dirty";
}

export function listDirtyCachedFiles(): Array<{ fileId: string; content: string }> {
  const dirty: Array<{ fileId: string; content: string }> = [];
  for (const [fileId, entry] of cache) {
    if (entry.model.isDisposed()) continue;
    const content = entry.model.getValue();
    if (content !== entry.savedContent) {
      dirty.push({ fileId, content });
    }
  }
  return dirty;
}

/** All Monaco models currently in memory (for full snapshot flush). */
export function listAllCachedFiles(): Array<{ fileId: string; content: string }> {
  const all: Array<{ fileId: string; content: string }> = [];
  for (const [fileId, entry] of cache) {
    if (entry.model.isDisposed()) continue;
    all.push({ fileId, content: entry.model.getValue() });
  }
  return all;
}

export function markAllModelsSaved(entries: Array<{ fileId: string; content: string }>): void {
  for (const { fileId, content } of entries) {
    markModelSaved(fileId, content);
  }
}

/** Apply server file list to cached models when the editor is clean (not mid-edit). */
export function syncCachedModelsFromServer(
  files: Array<{ id: string; content?: string | null }>
): void {
  for (const file of files) {
    const entry = cache.get(file.id);
    if (!entry || entry.model.isDisposed()) continue;
    const serverContent = file.content ?? "";
    const local = entry.model.getValue();
    if (local === serverContent) {
      entry.savedContent = serverContent;
      continue;
    }
    if (local === entry.savedContent) {
      entry.model.setValue(serverContent);
      entry.savedContent = serverContent;
    }
  }
}

/**
 * After compile/publish the server may repair and persist .tex — overwrite Monaco to match DB.
 */
export function forceSyncCachedModelsFromServer(
  files: Array<{ id: string; content?: string | null }>
): number {
  let updated = 0;
  for (const file of files) {
    const entry = cache.get(file.id);
    if (!entry || entry.model.isDisposed()) continue;
    const serverContent = file.content ?? "";
    if (entry.model.getValue() !== serverContent) {
      entry.model.setValue(serverContent);
      updated++;
    }
    entry.savedContent = serverContent;
  }
  return updated;
}

export function disposeAllModels(): void {
  for (const entry of cache.values()) {
    if (!entry.model.isDisposed()) entry.model.dispose();
  }
  cache.clear();
}
