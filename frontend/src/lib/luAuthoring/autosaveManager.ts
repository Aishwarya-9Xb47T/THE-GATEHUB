/**
 * Centralized autosave — single flush pipeline for save, compile, publish, and preview.
 * Publish/compile/preview always flush the FULL editor snapshot (all text files).
 */

import { api } from "@/lib/api";
import { isTextLikeProjectPath, sanitizeProjectFileContent } from "@/lib/latexEditor/contentSanitizer";
import {
  getCachedModel,
  listDirtyCachedFiles,
  markAllModelsSaved,
} from "./monacoModelCache";
import type { EditorProjectSnapshot, FileNodeLike } from "./projectSnapshot";
import { buildFullTextFileOverlay } from "./projectSnapshot";

export type FlushReason =
  | "edit"
  | "interval"
  | "visibility"
  | "file-switch"
  | "compile"
  | "publish"
  | "preview"
  | "manual"
  | "coalesced";

export interface ProjectSyncState {
  projectVersion: number;
  editorVersion: number;
  lastSavedAt: string;
  lastSnapshotHash: string;
  publishedSnapshotHash?: string;
  compiledSnapshotHash?: string;
  assetCount: number;
  dirtyFiles: string[];
}

export interface FlushResult {
  success: boolean;
  savedCount: number;
  syncState?: ProjectSyncState;
  snapshot?: EditorProjectSnapshot;
  error?: string;
  hashVerified?: boolean;
}

export interface LuAutosaveManagerOptions {
  projectId: string;
  getFiles: () => FileNodeLike[];
  getActiveFile: () => FileNodeLike | null;
  getActiveEditorValue: () => string | undefined;
  onFilesSaved: (updates: Array<{ fileId: string; content: string }>) => void;
  onSyncState?: (state: ProjectSyncState) => void;
  onDirtyCountChange?: (count: number) => void;
  onAfterFlush?: (result: FlushResult) => void;
  debounceMs?: number;
  intervalMs?: number;
}

const FULL_SNAPSHOT_REASONS: FlushReason[] = ["publish", "compile", "preview", "manual"];

export class LuAutosaveManager {
  private editorVersion = 0;
  private projectVersion = 0;
  private lastSnapshotHash = "";
  private flushPromise: Promise<FlushResult> | null = null;
  private pendingFlush = false;
  private debounceTimer: number | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private frozen = false;

  constructor(private readonly opts: LuAutosaveManagerOptions) {}

  getEditorVersion(): number {
    return this.editorVersion;
  }

  getProjectVersion(): number {
    return this.projectVersion;
  }

  getLastSnapshotHash(): string {
    return this.lastSnapshotHash;
  }

  /** Keep autosave paused through publish API (call releaseFreeze when done). */
  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }

  releaseFreeze(): void {
    this.frozen = false;
    if (this.pendingFlush) {
      this.pendingFlush = false;
      void this.flush("coalesced");
    }
  }

  getDirtyCount(): number {
    return listDirtyCachedFiles().length;
  }

  markDirty(): void {
    if (this.frozen) return;
    this.editorVersion++;
    this.opts.onDirtyCountChange?.(this.getDirtyCount());
    this.schedule();
  }

  schedule(): void {
    if (this.disposed || this.frozen) return;
    const delay = this.opts.debounceMs ?? 2500;
    if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      void this.flush("edit");
    }, delay);
  }

  startInterval(): void {
    const ms = this.opts.intervalMs ?? 2500;
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.intervalTimer = setInterval(() => {
      if (this.getDirtyCount() > 0) void this.flush("interval");
    }, ms);
  }

  buildSnapshot(mainFileName = "main.tex"): EditorProjectSnapshot {
    const active = this.opts.getActiveFile();
    return buildFullTextFileOverlay(this.opts.projectId, this.opts.getFiles(), {
      mainFileName,
      activeFileId: active?.id,
      getActiveEditorValue: this.opts.getActiveEditorValue,
      editorVersion: this.editorVersion,
    });
  }

  async flush(reason: FlushReason): Promise<FlushResult> {
    if (
      this.frozen &&
      reason !== "publish" &&
      reason !== "compile" &&
      reason !== "preview" &&
      reason !== "manual"
    ) {
      this.pendingFlush = true;
      return { success: true, savedCount: 0 };
    }
    if (this.flushPromise) {
      this.pendingFlush = true;
      return this.flushPromise;
    }
    this.flushPromise = this.doFlush(reason).finally(() => {
      this.flushPromise = null;
      if (this.pendingFlush && !this.frozen) {
        this.pendingFlush = false;
        void this.flush("coalesced");
      }
    });
    return this.flushPromise;
  }

  async flushBefore(action: "compile" | "publish" | "preview"): Promise<FlushResult> {
    this.frozen = true;
    try {
      let result = await this.flush(action);
      if (!result.success) {
        this.frozen = false;
        return result;
      }

      const serverHash = result.syncState?.lastSnapshotHash ?? this.lastSnapshotHash;
      if (!serverHash) {
        this.frozen = false;
        return {
          success: false,
          savedCount: result.savedCount,
          error: "Server did not return a snapshot hash after save",
        };
      }

      this.lastSnapshotHash = serverHash;

      // Publish may need a second pass if editor moved during the first flush.
      if (action === "publish" && result.syncState) {
        const savedVer = result.syncState.editorVersion;
        if (savedVer < this.editorVersion) {
          console.warn("[LuAutosave] editorVersion ahead of saved — retrying publish flush", {
            editorVer: this.editorVersion,
            savedVer,
          });
          result = await this.flush("publish");
          if (!result.success) {
            this.frozen = false;
            return result;
          }
          const retryHash = result.syncState?.lastSnapshotHash ?? this.lastSnapshotHash;
          if (retryHash) this.lastSnapshotHash = retryHash;
        }
      }

      const authoritativeHash = result.syncState?.lastSnapshotHash ?? this.lastSnapshotHash;

      console.info("[LuAutosave] flushBefore complete", {
        action,
        projectId: this.opts.projectId,
        serverHash: authoritativeHash,
        savedCount: result.savedCount,
        editorVersion: this.editorVersion,
      });

      // Publish stays frozen until EditorLayout calls releaseFreeze() after the API returns.
      if (action !== "publish") {
        this.frozen = false;
      }

      return {
        success: true,
        savedCount: result.savedCount,
        syncState: result.syncState,
        snapshot: {
          ...this.buildSnapshot(),
          snapshotHash: authoritativeHash,
        },
        hashVerified: true,
      };
    } catch (err: any) {
      this.frozen = false;
      const message = err instanceof Error ? err.message : "Flush failed";
      return { success: false, savedCount: 0, error: message };
    }
  }

  private usesFullSnapshot(reason: FlushReason): boolean {
    return FULL_SNAPSHOT_REASONS.includes(reason);
  }

  private collectDirtyEntries(): Array<{ fileId: string; path: string; content: string }> {
    const filesById = new Map(this.opts.getFiles().map((f) => [f.id, f]));
    const dirty = new Map(listDirtyCachedFiles().map((d) => [d.fileId, d.content]));

    const active = this.opts.getActiveFile();
    if (active?.id && isTextLikeProjectPath(active.path)) {
      const live = this.opts.getActiveEditorValue();
      if (live != null) {
        dirty.set(active.id, live);
      }
    }

    const entries: Array<{ fileId: string; path: string; content: string }> = [];
    for (const [fileId, raw] of dirty) {
      const file = filesById.get(fileId);
      if (!file || file.isFolder || !isTextLikeProjectPath(file.path)) continue;
      entries.push({
        fileId,
        path: file.path,
        content: sanitizeProjectFileContent(file.path, raw),
      });
    }
    return entries;
  }

  /** Every text file in the editor snapshot — source of truth for publish/compile/preview. */
  private collectFullSnapshotEntries(
    reason: FlushReason
  ): Array<{ fileId: string; path: string; content: string }> {
    const snapshot = this.buildSnapshot();
    const files = this.opts.getFiles();
    const byNormPath = new Map(
      files.map((f) => [f.path.replace(/\\/g, "/").replace(/^\//, ""), f])
    );

    const entries: Array<{ fileId: string; path: string; content: string }> = [];
    for (const entry of snapshot.files) {
      const norm = entry.name.replace(/\\/g, "/").replace(/^\//, "");
      const file = byNormPath.get(norm);
      if (!file || file.isFolder || !isTextLikeProjectPath(file.path)) continue;
      const cached = getCachedModel(file.id);
      const persistedBaseline =
        reason === "publish"
          ? sanitizeProjectFileContent(file.path, file.content ?? "")
          : (cached?.savedContent ?? file.content ?? "");
      if (entry.content === persistedBaseline) continue;
      entries.push({
        fileId: file.id,
        path: file.path,
        content: entry.content,
      });
    }
    return entries;
  }

  private async doFlush(reason: FlushReason): Promise<FlushResult> {
    const fullSnapshot = this.usesFullSnapshot(reason);
    const entries = fullSnapshot ? this.collectFullSnapshotEntries(reason) : this.collectDirtyEntries();
    const snapshot = this.buildSnapshot();

    console.info("[LuAutosave] flush", {
      reason,
      projectId: this.opts.projectId,
      mode: fullSnapshot ? "full" : "dirty",
      editorVersion: this.editorVersion,
      fileCount: entries.length,
      dirtyFiles: entries.map((d) => d.path),
      snapshotHash: snapshot.snapshotHash,
      assetCount: snapshot.assetCount,
      includegraphicsFiles: entries
        .filter((d) => d.content.includes("\\includegraphics"))
        .map((d) => d.path),
    });

    try {
      const { data, error } = await api<{
        success: boolean;
        savedCount: number;
        syncState: ProjectSyncState;
        snapshotHash?: string;
        hashVerified?: boolean;
        assetsSynced?: number;
      }>(`/latex-projects/${this.opts.projectId}/sync/flush`, {
        method: "POST",
        body: {
          reason,
          mode: fullSnapshot ? "full" : "dirty",
          editorVersion: this.editorVersion,
          files: entries.map((d) => ({ fileId: d.fileId, content: d.content })),
          // Publish uses server-authoritative hash after save; client hash can lag filesRef.
          ...(fullSnapshot && reason !== "publish" ? { snapshotHash: snapshot.snapshotHash } : {}),
        },
      });

      if (error || !data?.success) {
        return { success: false, savedCount: 0, error: error || "Flush failed" };
      }

      if (entries.length > 0) {
        markAllModelsSaved(entries.map((e) => ({ fileId: e.fileId, content: e.content })));
        this.opts.onFilesSaved(entries.map((d) => ({ fileId: d.fileId, content: d.content })));
      }

      if (data.syncState) {
        this.projectVersion = data.syncState.projectVersion;
        this.lastSnapshotHash = data.syncState.lastSnapshotHash;
        this.opts.onSyncState?.(data.syncState);
      } else if (typeof data.snapshotHash === "string") {
        this.lastSnapshotHash = data.snapshotHash;
      }

      this.opts.onDirtyCountChange?.(this.getDirtyCount());

      console.info("[LuAutosave] flush complete", {
        reason,
        projectId: this.opts.projectId,
        mode: fullSnapshot ? "full" : "dirty",
        savedCount: data.savedCount,
        assetsSynced: data.assetsSynced,
        projectVersion: this.projectVersion,
        snapshotHash: this.lastSnapshotHash,
      });

      const result: FlushResult = {
        success: true,
        savedCount: data.savedCount,
        syncState: data.syncState,
        snapshot: this.buildSnapshot(),
        hashVerified: data.hashVerified,
      };
      this.opts.onAfterFlush?.(result);

      return result;
    } catch (err: any) {
      const message = err instanceof Error ? err.message : "Flush failed";
      console.error("[LuAutosave] flush error", { reason, message });
      return { success: false, savedCount: 0, error: message };
    }
  }

  registerLifecycle(): () => void {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void this.flush("visibility");
    };
    const onPageHide = () => void this.flush("visibility");
    const onBeforeUnload = () => {
      if (this.getDirtyCount() > 0) void this.flush("visibility");
    };
    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
  }
}

/** Read cached content for overlay when model exists but file list is stale */
export function getCachedContentForFile(fileId: string): string | undefined {
  return getCachedModel(fileId)?.model.getValue();
}
