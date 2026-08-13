import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import type { LearnerExperienceStep } from "../../types";
import { AutosaveCoordinator } from "../engine/autosaveCoordinator";
import { disposeAllModels, notebookModelKey, syncNotebookModels } from "../engine/monacoModelRegistry";
import { focusMonacoInstance } from "../engine/ManagedMonacoEditor";
import { createNotebookStore, type NotebookStore } from "./notebookStore";
import { createDefaultNotebook, hydrateNotebook, serializeNotebook } from "./notebookDocument";
import {
  executeCodeCell,
  interruptExecution,
  restartRuntime,
  runAllCodeCells,
  runCellsAbove,
  runCellsBelow,
} from "./runEngine";

interface UseNotebookEngineOptions {
  step: LearnerExperienceStep;
}

function syncEditorsFromDoc(store: NotebookStore) {
  const doc = store.getState().document();
  syncNotebookModels(
    doc.cells.map((c) => c.cellId),
    doc.cells.map((c) => ({ cellId: c.cellId, source: c.source }))
  );
}

export function useNotebookEngine({ step }: UseNotebookEngineOptions) {
  const initialDoc = useMemo(() => createDefaultNotebook(step), [step]);
  const storeRef = useRef<NotebookStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createNotebookStore(initialDoc);
  }
  const store = storeRef.current;

  const doc = useStore(store, (s) => s.history.present);
  const activeCellId = useStore(store, (s) => s.activeCellId);
  const canUndo = useStore(store, (s) => s.canUndo());
  const canRedo = useStore(store, (s) => s.canRedo());
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const autosaveRef = useRef<AutosaveCoordinator | null>(null);
  const onSaveRef = useRef<((payload: Record<string, unknown>) => Promise<void>) | null>(null);

  const persist = useCallback(async () => {
    if (!onSaveRef.current) return;
    const payload = serializeNotebook(store.getState().document());
    await onSaveRef.current(payload);
    store.getState().markCellsClean();
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

  const loadFromSnapshot = useCallback(
    (saved: Record<string, unknown>) => {
      store.getState().load(hydrateNotebook(step, saved));
      syncEditorsFromDoc(store);
    },
    [step, store]
  );

  const markDirtyAndSchedule = useCallback(() => {
    autosaveRef.current?.markDirty();
  }, []);

  const updateSourceLive = useCallback(
    (cellId: string, source: string) => {
      store.getState().updateCellSourceLive(cellId, source);
      markDirtyAndSchedule();
    },
    [store, markDirtyAndSchedule]
  );

  const commitSource = useCallback(
    (cellId: string, source: string) => {
      store.getState().commitCellSource(cellId, source);
      markDirtyAndSchedule();
    },
    [store, markDirtyAndSchedule]
  );

  const focusCell = useCallback((cellId: string) => {
    store.getState().setActiveCell(cellId);
    requestAnimationFrame(() => {
      document.querySelector(`[data-cell-id="${cellId}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      focusMonacoInstance(notebookModelKey(cellId));
    });
  }, [store]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const inMonaco = (e.target as HTMLElement | null)?.closest(".monaco-editor");
      if (e.key === "s") {
        e.preventDefault();
        void persist();
        return;
      }
      if (inMonaco) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        store.getState().undo();
        syncEditorsFromDoc(store);
        markDirtyAndSchedule();
      }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        store.getState().redo();
        syncEditorsFromDoc(store);
        markDirtyAndSchedule();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store, persist, markDirtyAndSchedule]);

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
      reset: () => {
        disposeAllModels();
        store.getState().load(createDefaultNotebook(step));
        syncEditorsFromDoc(store);
      },
      manualSave: async () => {
        await persist();
      },
      insertCell: (afterId: string | null, type: "code" | "markdown") => {
        const id = store.getState().insertCell(afterId ?? activeCellId, type);
        markDirtyAndSchedule();
        focusCell(id);
      },
      deleteCell: (cellId: string) => {
        store.getState().deleteCell(cellId);
        markDirtyAndSchedule();
      },
      duplicateCell: (cellId: string) => {
        const id = store.getState().duplicateCell(cellId);
        markDirtyAndSchedule();
        focusCell(id);
      },
      copyCell: (cellId: string) => store.getState().copyCell(cellId),
      pasteCell: (afterId?: string | null) => {
        const id = store.getState().pasteCell(afterId ?? activeCellId);
        if (id) {
          markDirtyAndSchedule();
          focusCell(id);
        }
      },
      moveCell: (cellId: string, dir: -1 | 1) => {
        store.getState().moveCell(cellId, dir);
        markDirtyAndSchedule();
      },
      reorderCell: (from: number, to: number) => {
        store.getState().reorderCell(from, to);
        markDirtyAndSchedule();
      },
      convertCell: (cellId: string) => {
        const cell = store.getState().document().cells.find((c) => c.cellId === cellId);
        if (!cell) return;
        store.getState().convertCell(cellId, cell.cellType === "code" ? "markdown" : "code");
        markDirtyAndSchedule();
      },
      splitCell: (cellId: string, offset: number) => {
        store.getState().splitCell(cellId, offset);
        syncEditorsFromDoc(store);
        markDirtyAndSchedule();
      },
      mergeWithNext: (cellId: string) => {
        store.getState().mergeWithNext(cellId);
        syncEditorsFromDoc(store);
        markDirtyAndSchedule();
      },
      runCell: async (cellId: string) => {
        await executeCodeCell(store, cellId, doc.runtime.kernelLanguage);
      },
      runAll: async () => {
        setRunningAll(true);
        await runAllCodeCells(store, store.getState().document());
        setRunningAll(false);
      },
      runAbove: async (cellId: string) => {
        await runCellsAbove(store, cellId, store.getState().document());
      },
      runBelow: async (cellId: string) => {
        await runCellsBelow(store, cellId, store.getState().document());
      },
      interrupt: () => interruptExecution(store),
      restartRuntime: () => {
        restartRuntime(store);
        markDirtyAndSchedule();
      },
      clearAllOutputs: () => {
        store.getState().clearAllOutputs();
        markDirtyAndSchedule();
      },
      undo: () => {
        store.getState().undo();
        syncEditorsFromDoc(store);
        markDirtyAndSchedule();
      },
      redo: () => {
        store.getState().redo();
        syncEditorsFromDoc(store);
        markDirtyAndSchedule();
      },
      setActiveCell: (cellId: string) => focusCell(cellId),
      getColabCells: () =>
        store.getState().document().cells.map((c) => ({
          id: c.cellId,
          type: c.cellType,
          source: c.source,
        })),
      getSerialized: () => serializeNotebook(store.getState().document()),
    }),
    [store, step, activeCellId, doc.runtime.kernelLanguage, persist, loadFromSnapshot, markDirtyAndSchedule, focusCell]
  );

  return {
    doc,
    activeCellId,
    canUndo,
    canRedo,
    lastSaved,
    runningAll,
    updateSourceLive,
    commitSource,
    setOnSave,
    actions,
    store,
  };
}
