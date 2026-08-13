import { create } from "zustand";
import { disposeModel, notebookModelKey } from "../engine/monacoModelRegistry";
import type { NotebookCell, NotebookDocument, CellType } from "./types";
import { createCell, createEmptyOutput } from "./types";
import {
  type DocumentHistory,
  commitHistory,
  createHistory,
  redoHistory,
  undoHistory,
  canRedo,
  canUndo,
} from "../engine/transactionEngine";

function touchCell(cell: NotebookCell, patch: Partial<NotebookCell>): NotebookCell {
  return { ...cell, ...patch, updatedAt: new Date().toISOString() };
}

function patchDocument(doc: NotebookDocument, cells: NotebookCell[]): NotebookDocument {
  return { ...doc, cells, updatedAt: new Date().toISOString() };
}

export interface NotebookStoreState {
  history: DocumentHistory<NotebookDocument>;
  activeCellId: string | null;
  dirtyCellIds: Set<string>;
  selectedCellIds: Set<string>;
  clipboardCell: NotebookCell | null;

  document: () => NotebookDocument;
  canUndo: () => boolean;
  canRedo: () => boolean;

  load: (doc: NotebookDocument) => void;
  commit: (mutate: (doc: NotebookDocument) => NotebookDocument, dirtyCellIds?: string[]) => void;
  undo: () => void;
  redo: () => void;

  setActiveCell: (cellId: string | null) => void;
  updateCellSourceLive: (cellId: string, source: string) => void;
  commitCellSource: (cellId: string, source: string) => void;
  updateCell: (cellId: string, patch: Partial<NotebookCell>) => void;

  insertCell: (afterId: string | null, cellType: CellType) => string;
  deleteCell: (cellId: string) => void;
  duplicateCell: (cellId: string) => string;
  moveCell: (cellId: string, direction: -1 | 1) => void;
  reorderCell: (fromIndex: number, toIndex: number) => void;
  convertCell: (cellId: string, toType: CellType) => void;
  splitCell: (cellId: string, offset: number) => void;
  mergeWithNext: (cellId: string) => void;
  copyCell: (cellId: string) => void;
  pasteCell: (afterId: string | null) => string | null;
  clearOutput: (cellId: string) => void;
  clearAllOutputs: () => void;
  toggleCollapsed: (cellId: string) => void;
  toggleMarkdownPreview: (cellId: string) => void;
  setCellOutput: (cellId: string, output: Partial<NotebookCell["outputs"]>, executionState: NotebookCell["executionState"], executionCount?: number) => void;
  setRuntimeStatus: (status: NotebookDocument["runtime"]["status"]) => void;
  markCellsClean: () => void;
  getDirtyPayload: () => Record<string, unknown>;
}

export function createNotebookStore(initial: NotebookDocument) {
  return create<NotebookStoreState>((set, get) => ({
    history: createHistory(initial),
    activeCellId: initial.cells[0]?.cellId ?? null,
    dirtyCellIds: new Set(),
    selectedCellIds: new Set(),
    clipboardCell: null,

    document: () => get().history.present,
    canUndo: () => canUndo(get().history),
    canRedo: () => canRedo(get().history),

    load: (doc) =>
      set({
        history: createHistory(doc),
        activeCellId: doc.cells[0]?.cellId ?? null,
        dirtyCellIds: new Set(),
      }),

    commit: (mutate, dirtyIds = []) =>
      set((state) => {
        const next = mutate(state.history.present);
        const dirty = new Set(state.dirtyCellIds);
        dirtyIds.forEach((id) => dirty.add(id));
        return { history: commitHistory(state.history, next), dirtyCellIds: dirty };
      }),

    undo: () => {
      const next = undoHistory(get().history);
      if (next) set({ history: next });
    },

    redo: () => {
      const next = redoHistory(get().history);
      if (next) set({ history: next });
    },

    setActiveCell: (cellId) => set({ activeCellId: cellId }),

    updateCellSourceLive: (cellId, source) =>
      set((state) => {
        const dirty = new Set(state.dirtyCellIds);
        dirty.add(cellId);
        const present = patchDocument(
          state.history.present,
          state.history.present.cells.map((c) => (c.cellId === cellId ? touchCell(c, { source }) : c))
        );
        return {
          history: { ...state.history, present },
          dirtyCellIds: dirty,
        };
      }),

    commitCellSource: (cellId, source) =>
      get().commit(
        (doc) =>
          patchDocument(
            doc,
            doc.cells.map((c) => (c.cellId === cellId ? touchCell(c, { source }) : c))
          ),
        [cellId]
      ),

    updateCell: (cellId, patch) =>
      get().commit(
        (doc) =>
          patchDocument(
            doc,
            doc.cells.map((c) => (c.cellId === cellId ? touchCell(c, patch) : c))
          ),
        [cellId]
      ),

    insertCell: (afterId, cellType) => {
      const lang = get().history.present.runtime.kernelLanguage;
      const cell = createCell(cellType, lang);
      get().commit((doc) => {
        if (!afterId) return patchDocument(doc, [cell, ...doc.cells]);
        const idx = doc.cells.findIndex((c) => c.cellId === afterId);
        const cells = [...doc.cells];
        cells.splice(idx + 1, 0, cell);
        return patchDocument(doc, cells);
      }, [cell.cellId]);
      set({ activeCellId: cell.cellId });
      return cell.cellId;
    },

    deleteCell: (cellId) => {
      const doc = get().history.present;
      if (doc.cells.length <= 1) return;
      disposeModel(notebookModelKey(cellId));
      get().commit((d) => patchDocument(d, d.cells.filter((c) => c.cellId !== cellId)));
      set((s) => ({
        activeCellId: s.activeCellId === cellId ? get().history.present.cells[0]?.cellId ?? null : s.activeCellId,
      }));
    },

    duplicateCell: (cellId) => {
      const src = get().history.present.cells.find((c) => c.cellId === cellId);
      if (!src) return cellId;
      const copy = createCell(src.cellType, src.language, src.source);
      get().commit((doc) => {
        const idx = doc.cells.findIndex((c) => c.cellId === cellId);
        const cells = [...doc.cells];
        cells.splice(idx + 1, 0, copy);
        return patchDocument(doc, cells);
      }, [copy.cellId]);
      return copy.cellId;
    },

    moveCell: (cellId, direction) => {
      get().commit((doc) => {
        const idx = doc.cells.findIndex((c) => c.cellId === cellId);
        const target = idx + direction;
        if (target < 0 || target >= doc.cells.length) return doc;
        const cells = [...doc.cells];
        [cells[idx], cells[target]] = [cells[target], cells[idx]];
        return patchDocument(doc, cells);
      });
    },

    reorderCell: (fromIndex, toIndex) => {
      if (fromIndex === toIndex) return;
      get().commit((doc) => {
        const cells = [...doc.cells];
        const [item] = cells.splice(fromIndex, 1);
        cells.splice(toIndex, 0, item);
        return patchDocument(doc, cells);
      });
    },

    convertCell: (cellId, toType) =>
      get().commit(
        (doc) =>
          patchDocument(
            doc,
            doc.cells.map((c) =>
              c.cellId === cellId
                ? touchCell(c, {
                    cellType: toType,
                    markdownPreview: false,
                    outputs: toType === "code" ? c.outputs : createEmptyOutput(),
                  })
                : c
            )
          ),
        [cellId]
      ),

    splitCell: (cellId, offset) => {
      const src = get().history.present.cells.find((c) => c.cellId === cellId);
      if (!src) return;
      const before = src.source.slice(0, offset);
      const after = src.source.slice(offset);
      const newCell = createCell(src.cellType, src.language, after);
      get().commit((doc) => {
        const cells = doc.cells.flatMap((c) => {
          if (c.cellId !== cellId) return [c];
          return [touchCell(c, { source: before }), newCell];
        });
        return patchDocument(doc, cells);
      }, [cellId, newCell.cellId]);
    },

    mergeWithNext: (cellId) => {
      get().commit((doc) => {
        const idx = doc.cells.findIndex((c) => c.cellId === cellId);
        const next = doc.cells[idx + 1];
        if (!next) return doc;
        disposeModel(notebookModelKey(next.cellId));
        const merged = touchCell(doc.cells[idx], { source: doc.cells[idx].source + next.source });
        const cells = [...doc.cells];
        cells.splice(idx, 2, merged);
        return patchDocument(doc, cells);
      });
    },

    copyCell: (cellId) => {
      const src = get().history.present.cells.find((c) => c.cellId === cellId);
      if (!src) return;
      set({ clipboardCell: src });
    },

    pasteCell: (afterId) => {
      const clip = get().clipboardCell;
      if (!clip) return null;
      const lang = get().history.present.runtime.kernelLanguage;
      const cell = createCell(clip.cellType, clip.language ?? lang, clip.source);
      get().commit((doc) => {
        const anchor = afterId ?? get().activeCellId;
        if (!anchor) return patchDocument(doc, [...doc.cells, cell]);
        const idx = doc.cells.findIndex((c) => c.cellId === anchor);
        const cells = [...doc.cells];
        cells.splice(idx + 1, 0, cell);
        return patchDocument(doc, cells);
      }, [cell.cellId]);
      set({ activeCellId: cell.cellId });
      return cell.cellId;
    },

    clearOutput: (cellId) =>
      get().updateCell(cellId, { outputs: createEmptyOutput(), executionState: "idle" }),

    clearAllOutputs: () =>
      get().commit((doc) =>
        patchDocument(
          doc,
          doc.cells.map((c) =>
            c.cellType === "code" ? touchCell(c, { outputs: createEmptyOutput(), executionState: "idle" }) : c
          )
        )
      ),

    toggleCollapsed: (cellId) => {
      const cell = get().history.present.cells.find((c) => c.cellId === cellId);
      if (cell) get().updateCell(cellId, { collapsed: !cell.collapsed });
    },

    toggleMarkdownPreview: (cellId) => {
      const cell = get().history.present.cells.find((c) => c.cellId === cellId);
      if (cell) get().updateCell(cellId, { markdownPreview: !cell.markdownPreview });
    },

    setCellOutput: (cellId, output, executionState, executionCount) =>
      get().commit(
        (doc) =>
          patchDocument(
            doc,
            doc.cells.map((c) =>
              c.cellId === cellId
                ? touchCell(c, {
                    outputs: { ...c.outputs, ...output },
                    executionState,
                    executionCount: executionCount ?? c.executionCount,
                  })
                : c
            )
          ),
        [cellId]
      ),

    setRuntimeStatus: (status) =>
      get().commit((doc) => ({ ...doc, runtime: { ...doc.runtime, status } })),

    markCellsClean: () => set({ dirtyCellIds: new Set() }),

    getDirtyPayload: () => {
      const doc = get().history.present;
      const dirty = get().dirtyCellIds;
      if (dirty.size === 0) return {};
      return {
        cells: doc.cells.filter((c) => dirty.has(c.cellId)),
        language: doc.runtime.kernelLanguage,
        runtimeStatus: doc.runtime.status,
        colabDriveFileId: doc.colabDriveFileId,
        updatedAt: doc.updatedAt,
      };
    },
  }));
}

export type NotebookStore = ReturnType<typeof createNotebookStore>;
