export type NotebookCellType = "code" | "markdown";

export interface NotebookCell {
  id: string;
  type: NotebookCellType;
  source: string;
  output?: string;
  status?: "idle" | "running" | "error" | "success";
}

export interface NotebookWorkspacePayload {
  cells: NotebookCell[];
  language: string;
  runtimeStatus: "idle" | "busy" | "ready";
  colabDriveFileId?: string;
}

export interface LatexFileNode {
  id: string;
  name: string;
  content: string;
}

export interface ResearchWorkspacePayload {
  files: LatexFileNode[];
  activeFileId: string;
  abstract?: string;
}

export const WORKSPACE_STEP_KINDS = new Set([
  "coding-lab",
  "notebook",
  "project",
  "research",
]);

export function isWorkspaceStepKind(kind: string): boolean {
  return WORKSPACE_STEP_KINDS.has(kind);
}

export function workspaceKindLabel(kind: string): string {
  switch (kind) {
    case "coding-lab":
      return "Coding Lab";
    case "notebook":
      return "Notebook";
    case "project":
      return "Project Workspace";
    case "research":
      return "Research Paper";
    default:
      return "Workspace";
  }
}
