import type * as Monaco from "monaco-editor";

type MonacoModule = typeof Monaco;

interface RegistryEntry {
  model: Monaco.editor.ITextModel;
  language: string;
}

const entries = new Map<string, RegistryEntry>();
const viewStates = new Map<string, Monaco.editor.ICodeEditorViewState | null>();
const editors = new Map<string, Monaco.editor.IStandaloneCodeEditor>();

let monacoModule: MonacoModule | null = null;

export function initMonacoRegistry(monaco: MonacoModule): void {
  monacoModule = monaco;
}

export function notebookModelKey(cellId: string): string {
  return `nb:${cellId}`;
}

export function researchModelKey(fileId: string): string {
  return `rf:${fileId}`;
}

export function getOrCreateModel(
  instanceKey: string,
  language: string,
  initialContent: string,
  uriSuffix = "content"
): Monaco.editor.ITextModel {
  if (!monacoModule) throw new Error("Monaco registry not initialized");

  const existing = entries.get(instanceKey);
  if (existing && !existing.model.isDisposed()) {
    if (existing.language !== language) {
      monacoModule.editor.setModelLanguage(existing.model, language);
      existing.language = language;
    }
    // If model was created empty during async quiz load, fill in real content once.
    if (
      String(initialContent || "").length > 0 &&
      existing.model.getValue().trim().length === 0
    ) {
      existing.model.setValue(initialContent);
    }
    return existing.model;
  }

  const uri = monacoModule.Uri.parse(`inmemory://gatehub/${instanceKey}/${uriSuffix}`);
  const prior = monacoModule.editor.getModel(uri);
  if (prior && !prior.isDisposed()) {
    if (
      String(initialContent || "").length > 0 &&
      prior.getValue().trim().length === 0
    ) {
      prior.setValue(initialContent);
    }
    entries.set(instanceKey, { model: prior, language });
    return prior;
  }

  const model = monacoModule.editor.createModel(initialContent, language, uri);
  entries.set(instanceKey, { model, language });
  return model;
}

export function setModelContent(instanceKey: string, content: string): void {
  const entry = entries.get(instanceKey);
  if (!entry || entry.model.isDisposed()) return;
  if (entry.model.getValue() === content) return;
  entry.model.setValue(content);
}

export function getModelContent(instanceKey: string): string | null {
  const entry = entries.get(instanceKey);
  if (!entry || entry.model.isDisposed()) return null;
  return entry.model.getValue();
}

export function disposeModel(instanceKey: string): void {
  const entry = entries.get(instanceKey);
  if (entry && !entry.model.isDisposed()) {
    entry.model.dispose();
  }
  entries.delete(instanceKey);
  viewStates.delete(instanceKey);
  editors.delete(instanceKey);
}

export function disposeAllModels(): void {
  for (const key of [...entries.keys()]) {
    disposeModel(key);
  }
}

export function saveViewState(instanceKey: string, editor: Monaco.editor.IStandaloneCodeEditor): void {
  viewStates.set(instanceKey, editor.saveViewState());
}

export function restoreViewState(instanceKey: string, editor: Monaco.editor.IStandaloneCodeEditor): void {
  const state = viewStates.get(instanceKey);
  if (state) editor.restoreViewState(state);
}

export function registerEditor(
  instanceKey: string,
  editor: Monaco.editor.IStandaloneCodeEditor
): () => void {
  editors.set(instanceKey, editor);
  return () => {
    if (editors.get(instanceKey) === editor) editors.delete(instanceKey);
  };
}

export function focusEditor(instanceKey: string): boolean {
  const ed = editors.get(instanceKey);
  if (!ed) return false;
  ed.focus();
  return true;
}

export function swapEditorModel(
  editor: Monaco.editor.IStandaloneCodeEditor,
  prevKey: string | null,
  nextKey: string,
  language: string,
  initialContent: string
): Monaco.editor.ITextModel {
  if (prevKey) saveViewState(prevKey, editor);
  const model = getOrCreateModel(nextKey, language, initialContent);
  editor.setModel(model);
  restoreViewState(nextKey, editor);
  return model;
}

export function syncNotebookModels(cellIds: string[], cells: Array<{ cellId: string; source: string }>): void {
  const alive = new Set(cellIds.map((id) => notebookModelKey(id)));
  for (const key of [...entries.keys()]) {
    if (key.startsWith("nb:") && !alive.has(key)) disposeModel(key);
  }
  for (const cell of cells) {
    setModelContent(notebookModelKey(cell.cellId), cell.source);
  }
}

export function syncResearchModels(fileIds: string[], files: Array<{ fileId: string; content: string }>): void {
  const alive = new Set(fileIds.map((id) => researchModelKey(id)));
  for (const key of [...entries.keys()]) {
    if (key.startsWith("rf:") && !alive.has(key)) disposeModel(key);
  }
  for (const file of files) {
    setModelContent(researchModelKey(file.fileId), file.content);
  }
}
