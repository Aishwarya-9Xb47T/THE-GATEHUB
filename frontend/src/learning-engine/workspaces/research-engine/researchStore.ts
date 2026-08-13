import { create } from "zustand";
import { disposeModel, researchModelKey } from "../engine/monacoModelRegistry";
import type { OpenTab, ProjectFile, ResearchDocument } from "./types";
import { createFile, inferFileKind } from "./types";
import {
  type DocumentHistory,
  commitHistory,
  createHistory,
  redoHistory,
  undoHistory,
  canRedo,
  canUndo,
} from "../engine/transactionEngine";

function touchFile(file: ProjectFile, patch: Partial<ProjectFile>): ProjectFile {
  return { ...file, ...patch, updatedAt: new Date().toISOString(), dirty: patch.dirty ?? true };
}

function patchDoc(doc: ResearchDocument, patch: Partial<ResearchDocument>): ResearchDocument {
  return { ...doc, ...patch, updatedAt: new Date().toISOString() };
}

export interface ResearchStoreState {
  history: DocumentHistory<ResearchDocument>;
  dirtyFileIds: Set<string>;
  searchQuery: string;
  replaceQuery: string;

  document: () => ResearchDocument;
  canUndo: () => boolean;
  canRedo: () => boolean;

  load: (doc: ResearchDocument) => void;
  commit: (mutate: (doc: ResearchDocument) => ResearchDocument, dirtyFileIds?: string[]) => void;
  undo: () => void;
  redo: () => void;

  openFile: (fileId: string) => void;
  closeTab: (fileId: string) => void;
  updateContentLive: (fileId: string, content: string) => void;
  commitContent: (fileId: string, content: string) => void;
  createFile: (name: string, content?: string) => string;
  deleteFile: (fileId: string) => void;
  renameFile: (fileId: string, name: string) => void;
  duplicateFile: (fileId: string) => string;
  reorderFiles: (fromIndex: number, toIndex: number) => void;
  setSearchQuery: (q: string) => void;
  setReplaceQuery: (q: string) => void;
  replaceInActiveFile: () => number;
  markFilesClean: () => void;
  setCompileResult: (result: ResearchDocument["lastCompile"]) => void;
}

export function createResearchStore(initial: ResearchDocument) {
  return create<ResearchStoreState>((set, get) => ({
    history: createHistory(initial),
    dirtyFileIds: new Set(),
    searchQuery: "",
    replaceQuery: "",

    document: () => get().history.present,
    canUndo: () => canUndo(get().history),
    canRedo: () => canRedo(get().history),

    load: (doc) => set({ history: createHistory(doc), dirtyFileIds: new Set() }),

    commit: (mutate, dirtyIds = []) =>
      set((state) => {
        const next = mutate(state.history.present);
        const dirty = new Set(state.dirtyFileIds);
        dirtyIds.forEach((id) => dirty.add(id));
        return { history: commitHistory(state.history, next), dirtyFileIds: dirty };
      }),

    undo: () => {
      const next = undoHistory(get().history);
      if (next) set({ history: next });
    },

    redo: () => {
      const next = redoHistory(get().history);
      if (next) set({ history: next });
    },

    openFile: (fileId) =>
      get().commit((doc) => {
        const exists = doc.openTabs.some((t) => t.fileId === fileId);
        const openTabs: OpenTab[] = exists ? doc.openTabs : [...doc.openTabs, { fileId, pinned: false }];
        return patchDoc(doc, { activeFileId: fileId, openTabs });
      }),

    closeTab: (fileId) =>
      get().commit((doc) => {
        const tab = doc.openTabs.find((t) => t.fileId === fileId);
        if (tab?.pinned) return doc;
        const openTabs = doc.openTabs.filter((t) => t.fileId !== fileId);
        const activeFileId =
          doc.activeFileId === fileId ? openTabs[openTabs.length - 1]?.fileId ?? doc.mainFileId : doc.activeFileId;
        return patchDoc(doc, { openTabs, activeFileId });
      }),

    updateContentLive: (fileId, content) =>
      set((state) => {
        const dirty = new Set(state.dirtyFileIds);
        dirty.add(fileId);
        const present = patchDoc(
          state.history.present,
          {
            files: state.history.present.files.map((f) => (f.fileId === fileId ? touchFile(f, { content }) : f)),
          }
        );
        return { history: { ...state.history, present }, dirtyFileIds: dirty };
      }),

    commitContent: (fileId, content) =>
      get().commit(
        (doc) =>
          patchDoc(doc, {
            files: doc.files.map((f) => (f.fileId === fileId ? touchFile(f, { content, dirty: true }) : f)),
          }),
        [fileId]
      ),

    createFile: (name, content = "") => {
      const file = createFile(name, content);
      get().commit((doc) =>
        patchDoc(doc, {
          files: [...doc.files, file],
          openTabs: [...doc.openTabs, { fileId: file.fileId, pinned: false }],
          activeFileId: file.fileId,
        })
      , [file.fileId]);
      return file.fileId;
    },

    deleteFile: (fileId) => {
      const doc = get().history.present;
      if (doc.files.length <= 1 || fileId === doc.mainFileId) return;
      disposeModel(researchModelKey(fileId));
      get().commit((d) => {
        const files = d.files.filter((f) => f.fileId !== fileId);
        const openTabs = d.openTabs.filter((t) => t.fileId !== fileId);
        const activeFileId = d.activeFileId === fileId ? d.mainFileId : d.activeFileId;
        return patchDoc(d, { files, openTabs, activeFileId });
      });
    },

    renameFile: (fileId, name) =>
      get().commit(
        (doc) =>
          patchDoc(doc, {
            files: doc.files.map((f) =>
              f.fileId === fileId ? touchFile(f, { name, path: name, kind: inferFileKind(name) }) : f
            ),
          }),
        [fileId]
      ),

    duplicateFile: (fileId) => {
      const src = get().history.present.files.find((f) => f.fileId === fileId);
      if (!src) return fileId;
      const base = src.name.replace(/(\.[^.]+)$/, "");
      const ext = src.name.includes(".") ? src.name.slice(src.name.lastIndexOf(".")) : "";
      const copy = createFile(`${base}-copy${ext}`, src.content);
      get().commit((doc) =>
        patchDoc(doc, {
          files: [...doc.files, copy],
          openTabs: [...doc.openTabs, { fileId: copy.fileId, pinned: false }],
          activeFileId: copy.fileId,
        })
      , [copy.fileId]);
      return copy.fileId;
    },

    reorderFiles: (fromIndex, toIndex) => {
      if (fromIndex === toIndex) return;
      get().commit((doc) => {
        const files = [...doc.files];
        const [item] = files.splice(fromIndex, 1);
        files.splice(toIndex, 0, item);
        return patchDoc(doc, { files });
      });
    },

    setSearchQuery: (q) => set({ searchQuery: q }),
    setReplaceQuery: (q) => set({ replaceQuery: q }),

    replaceInActiveFile: () => {
      const doc = get().history.present;
      const fileId = doc.activeFileId;
      if (!fileId) return 0;
      const file = doc.files.find((f) => f.fileId === fileId);
      const query = get().searchQuery;
      const replacement = get().replaceQuery;
      if (!file || !query) return 0;
      const parts = file.content.split(query);
      if (parts.length <= 1) return 0;
      const next = parts.join(replacement);
      get().commitContent(fileId, next);
      return parts.length - 1;
    },

    markFilesClean: () => set({ dirtyFileIds: new Set() }),

    setCompileResult: (result) => get().commit((doc) => patchDoc(doc, { lastCompile: result })),
  }));
}

export type ResearchStore = ReturnType<typeof createResearchStore>;
