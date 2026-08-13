export interface LatexCompileError {
  message: string;
  line: number | null;
  file?: string | null;
  type?: string;
  category?: string;
  macro?: string | null;
  column?: number | null;
  raw?: string;
  suggestedFix?: string;
  autoRepairAvailable?: boolean;
  autoRepairAction?: string | null;
}

export interface CompileReportStage {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface CompileReport {
  compilationStarted?: boolean;
  stages?: CompileReportStage[];
  compiling?: boolean;
  primaryError?: {
    file?: string | null;
    line?: number | null;
    column?: number | null;
    category?: string;
    type?: string;
    message?: string;
    macro?: string | null;
    suggestedFix?: string;
    autoRepairAvailable?: boolean;
    autoRepairAction?: string | null;
  } | null;
  includeOrder?: string[];
  failedAtFile?: string | null;
  compileCommands?: string[];
  compilationTimeMs?: number;
}

export interface LatexCompileLessonPreview {
  lessonTitle: string;
  blocks: import("@/lib/learningUniverseSchema").LuContentBlock[];
  focusComponentId?: string | null;
}

export interface LatexCompileResult {
  success: boolean;
  fileUrl?: string;
  pdfUrl?: string;
  logs?: string;
  errors?: LatexCompileError[];
  validationFailed?: boolean;
  repairs?: string[];
  suggestedFix?: string;
  generatedTex?: string;
  compileCommands?: string[];
  outputDirectory?: string;
  compilationTime?: number;
  compileReport?: CompileReport;
  includeOrder?: string[];
  failedAtFile?: string | null;
  compiledSnapshotHash?: string;
  snapshotHash?: string;
  lessonPreview?: LatexCompileLessonPreview;
}

export type EditorMode = "resources" | "learning-universe" | "course" | "academic-course";

export type CompileStatus = "idle" | "queued" | "compiling" | "success" | "error";

export interface EditorSettings {
  autoCompile: boolean;
  autoCompileDelayMs: number;
  autoSave: boolean;
  autoSaveDelayMs: number;
  pdfZoom: number;
  pdfFitMode: "custom" | "width" | "page";
  showLineNumbers: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  autoCompile: true,
  autoCompileDelayMs: 2500,
  autoSave: true,
  autoSaveDelayMs: 2500,
  pdfZoom: 100,
  pdfFitMode: "width",
  showLineNumbers: true,
};

export type ProjectTemplateId =
  | "blank"
  | "course"
  | "academic-course"
  | "learning-universe"
  | "learning-universe-v2"
  | "academic"
  | "assignment";

export interface ProjectTemplateOption {
  id: ProjectTemplateId;
  label: string;
  description: string;
}
