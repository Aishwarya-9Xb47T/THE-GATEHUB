export type CellType = "code" | "markdown";
export type ExecutionState = "idle" | "queued" | "running" | "success" | "error" | "interrupted";

export interface CellOutput {
  stdout: string;
  stderr: string;
  executionTimeMs: number | null;
  status: ExecutionState;
  result: string | null;
  renderedHtml: string | null;
}

export interface NotebookCell {
  cellId: string;
  cellType: CellType;
  source: string;
  metadata: Record<string, unknown>;
  outputs: CellOutput;
  executionState: ExecutionState;
  collapsed: boolean;
  language: string;
  executionCount: number | null;
  createdAt: string;
  updatedAt: string;
  markdownPreview: boolean;
}

export interface NotebookRuntime {
  status: "idle" | "busy" | "ready" | "interrupted";
  kernelLanguage: string;
}

export interface NotebookDocument {
  version: 2;
  notebookId: string;
  title: string;
  cells: NotebookCell[];
  runtime: NotebookRuntime;
  colabDriveFileId?: string;
  updatedAt: string;
}

export function createEmptyOutput(): CellOutput {
  return {
    stdout: "",
    stderr: "",
    executionTimeMs: null,
    status: "idle",
    result: null,
    renderedHtml: null,
  };
}

export function createCell(cellType: CellType, language: string, source?: string): NotebookCell {
  const now = new Date().toISOString();
  return {
    cellId: `cell-${crypto.randomUUID()}`,
    cellType,
    source: source ?? (cellType === "markdown" ? "## Notes\n" : "# Write your solution here\n"),
    metadata: {},
    outputs: createEmptyOutput(),
    executionState: "idle",
    collapsed: false,
    language,
    executionCount: null,
    createdAt: now,
    updatedAt: now,
    markdownPreview: false,
  };
}
