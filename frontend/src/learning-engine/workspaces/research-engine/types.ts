export type FileKind = "tex" | "bib" | "sty" | "cls" | "image" | "other";

export interface ProjectFile {
  fileId: string;
  name: string;
  path: string;
  content: string;
  kind: FileKind;
  dirty: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OpenTab {
  fileId: string;
  pinned: boolean;
}

export interface CompileResult {
  success: boolean;
  pdfUrl: string | null;
  logs: string | null;
  errors: Array<{ message: string; line?: number; file?: string }>;
  compiledAt: string | null;
}

export interface ResearchDocument {
  version: 2;
  projectId: string;
  title: string;
  files: ProjectFile[];
  openTabs: OpenTab[];
  activeFileId: string | null;
  mainFileId: string;
  lastCompile: CompileResult | null;
  updatedAt: string;
}

export function inferFileKind(name: string): FileKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "tex") return "tex";
  if (ext === "bib") return "bib";
  if (ext === "sty") return "sty";
  if (ext === "cls") return "cls";
  if (["png", "jpg", "jpeg", "gif", "pdf", "svg"].includes(ext)) return "image";
  return "other";
}

export function createFile(name: string, content = "", path?: string): ProjectFile {
  const now = new Date().toISOString();
  const filePath = path ?? name;
  return {
    fileId: `file-${crypto.randomUUID()}`,
    name,
    path: filePath,
    content,
    kind: inferFileKind(name),
    dirty: false,
    createdAt: now,
    updatedAt: now,
  };
}
