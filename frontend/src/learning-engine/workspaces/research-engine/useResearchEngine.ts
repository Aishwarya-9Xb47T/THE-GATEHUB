import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { api, getBackendOrigin } from "@/lib/api";
import type { LearnerExperienceStep } from "../../types";
import { AutosaveCoordinator } from "../engine/autosaveCoordinator";
import { disposeAllModels, researchModelKey, syncResearchModels } from "../engine/monacoModelRegistry";
import { createResearchStore, type ResearchStore } from "./researchStore";
import {
  createDefaultResearchDocument,
  getCompileSnapshot,
  hydrateResearchDocument,
  serializeResearchDocument,
} from "./researchDocument";

interface UseResearchEngineOptions {
  step: LearnerExperienceStep;
  projectId: string;
  onCompiled?: () => void;
}

function syncEditorsFromDoc(store: ResearchStore) {
  const doc = store.getState().document();
  syncResearchModels(
    doc.files.map((f) => f.fileId),
    doc.files.map((f) => ({ fileId: f.fileId, content: f.content }))
  );
}

export function useResearchEngine({ step, projectId, onCompiled }: UseResearchEngineOptions) {
  const initialDoc = useMemo(() => createDefaultResearchDocument(step, projectId), [step, projectId]);
  const storeRef = useRef<ResearchStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createResearchStore(initialDoc);
  }
  const store = storeRef.current;

  const doc = useStore(store, (s) => s.history.present);
  const dirtyFileIds = useStore(store, (s) => s.dirtyFileIds);
  const searchQuery = useStore(store, (s) => s.searchQuery);
  const replaceQuery = useStore(store, (s) => s.replaceQuery);
  const canUndo = useStore(store, (s) => s.canUndo());
  const canRedo = useStore(store, (s) => s.canRedo());

  const [compiling, setCompiling] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [pdfEpoch, setPdfEpoch] = useState(0);
  const autosaveRef = useRef<AutosaveCoordinator | null>(null);
  const onSaveRef = useRef<((payload: Record<string, unknown>) => Promise<void>) | null>(null);

  const activeFile = doc.files.find((f) => f.fileId === doc.activeFileId) ?? doc.files[0];

  const persist = useCallback(async () => {
    if (!onSaveRef.current) return;
    const payload = serializeResearchDocument(store.getState().document());
    await onSaveRef.current(payload);
    store.getState().markFilesClean();
    setLastSaved(new Date());
  }, [store]);

  const setOnSave = useCallback((fn: (payload: Record<string, unknown>) => Promise<void>) => {
    onSaveRef.current = fn;
  }, []);

  useEffect(() => {
    autosaveRef.current = new AutosaveCoordinator(5000, persist);
    return () => {
      autosaveRef.current?.dispose();
      disposeAllModels();
    };
  }, [persist]);

  const markDirty = useCallback(() => autosaveRef.current?.markDirty(), []);

  const loadFromSnapshot = useCallback(
    (saved: Record<string, unknown>) => {
      store.getState().load(hydrateResearchDocument(step, projectId, saved));
      syncEditorsFromDoc(store);
    },
    [step, projectId, store]
  );

  const compile = useCallback(async () => {
    const snapshot = getCompileSnapshot(store.getState().document());
    setCompiling(true);
    const res = await api<{
      success: boolean;
      fileUrl?: string;
      logs?: string;
      message?: string;
      errors?: Array<{ message: string; line?: number }>;
    }>("/latex/compile", {
      method: "POST",
      body: {
        projectId,
        code: snapshot.mainContent,
        files: snapshot.files,
        mainFileName: doc.files.find((f) => f.fileId === doc.mainFileId)?.name ?? "main.tex",
      },
    });
    setCompiling(false);

    if (res.error || !res.data?.success) {
      store.getState().setCompileResult({
        success: false,
        pdfUrl: null,
        logs: res.data?.logs ?? null,
        errors: res.data?.errors ?? [{ message: res.data?.message || res.error || "Compilation failed" }],
        compiledAt: new Date().toISOString(),
      });
      return;
    }

    const url = res.data.fileUrl;
    const pdfUrl = url ? (url.startsWith("http") ? url : `${getBackendOrigin()}${url}`) : null;
    store.getState().setCompileResult({
      success: true,
      pdfUrl,
      logs: res.data.logs ?? "Compile successful",
      errors: [],
      compiledAt: new Date().toISOString(),
    });
    setPdfEpoch((n) => n + 1);
    onCompiled?.();
  }, [projectId, store, onCompiled, doc.files, doc.mainFileId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const inMonaco = (e.target as HTMLElement | null)?.closest(".monaco-editor");
      if (mod && e.key === "s") {
        e.preventDefault();
        void persist();
        return;
      }
      if (mod && e.key === "f") {
        e.preventDefault();
        setShowSearch((v) => !v);
        return;
      }
      if (inMonaco) return;
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        store.getState().undo();
        syncEditorsFromDoc(store);
        markDirty();
      }
      if ((mod && e.key === "z" && e.shiftKey) || (mod && e.key === "y")) {
        e.preventDefault();
        store.getState().redo();
        syncEditorsFromDoc(store);
        markDirty();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store, persist, markDirty]);

  useEffect(() => {
    const flush = () => void autosaveRef.current?.flush();
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void flush();
    });
    return () => {
      window.removeEventListener("beforeunload", flush);
      void flush();
    };
  }, []);

  const actions = useMemo(
    () => ({
      loadFromSnapshot,
      manualSave: persist,
      compile,
      createFile: () => {
        const name = prompt("New file name", "section.tex");
        if (!name?.trim()) return;
        store.getState().createFile(name.trim());
        markDirty();
      },
      deleteFile: (fileId: string) => {
        store.getState().deleteFile(fileId);
        markDirty();
      },
      renameFile: (fileId: string) => {
        const file = store.getState().document().files.find((f) => f.fileId === fileId);
        const name = prompt("Rename file", file?.name ?? "");
        if (!name?.trim()) return;
        store.getState().renameFile(fileId, name.trim());
        markDirty();
      },
      duplicateFile: (fileId: string) => {
        store.getState().duplicateFile(fileId);
        markDirty();
      },
      reorderFiles: (from: number, to: number) => {
        store.getState().reorderFiles(from, to);
        markDirty();
      },
      openFile: (fileId: string) => store.getState().openFile(fileId),
      closeTab: (fileId: string) => store.getState().closeTab(fileId),
      updateContentLive: (fileId: string, content: string) => {
        store.getState().updateContentLive(fileId, content);
        markDirty();
      },
      commitContent: (fileId: string, content: string) => {
        store.getState().commitContent(fileId, content);
        markDirty();
      },
      setSearchQuery: (q: string) => store.getState().setSearchQuery(q),
      setReplaceQuery: (q: string) => store.getState().setReplaceQuery(q),
      replaceInFile: () => {
        const count = store.getState().replaceInActiveFile();
        syncEditorsFromDoc(store);
        markDirty();
        return count;
      },
      getFilesForOverleaf: () =>
        store.getState().document().files.map((f) => ({ id: f.fileId, name: f.name, content: f.content })),
      undo: () => {
        store.getState().undo();
        syncEditorsFromDoc(store);
        markDirty();
      },
      redo: () => {
        store.getState().redo();
        syncEditorsFromDoc(store);
        markDirty();
      },
      getSerialized: () => serializeResearchDocument(store.getState().document()),
      getActiveModelKey: () => (activeFile ? researchModelKey(activeFile.fileId) : null),
    }),
    [store, persist, compile, loadFromSnapshot, markDirty, activeFile]
  );

  return {
    doc,
    activeFile,
    dirtyFileIds,
    searchQuery,
    replaceQuery,
    showSearch,
    setShowSearch,
    canUndo,
    canRedo,
    compiling,
    lastSaved,
    pdfEpoch,
    setOnSave,
    actions,
    store,
  };
}
