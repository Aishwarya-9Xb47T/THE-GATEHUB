export const IMPORT_SOURCES = [
  "google_forms",
  "google_docs",
  "pdf",
  "docx",
  "pptx",
  "image",
  "txt",
  "markdown",
  "html",
  "csv",
  "moodle_xml",
  "youtube",
  "website",
] as const;

export type ImportSourceType = (typeof IMPORT_SOURCES)[number];

export interface ImportedQuestionOption {
  text: string;
  isCorrect: boolean;
}

export interface ImportedQuestionDraft {
  id: string;
  stem: string;
  type: string;
  difficulty?: string;
  bloomLevel?: string;
  explanation?: string;
  topic?: string;
  subtopic?: string;
  tags?: string[];
  learningObjectives?: string[];
  hints?: string[];
  options?: ImportedQuestionOption[];
  metadata?: Record<string, unknown>;
  warnings?: string[];
  selected: boolean;
  isDuplicate?: boolean;
  duplicateReason?: string;
}

export interface ImportPreviewSummary {
  totalQuestions: number;
  byType: Record<string, number>;
  byDifficulty: Record<string, number>;
  withAnswers: number;
  warnings: string[];
  duplicateCount: number;
}

export interface ImportPreview {
  jobId: string;
  source: ImportSourceType;
  sourceLabel: string;
  fileName?: string;
  sourceUrl?: string;
  questions: ImportedQuestionDraft[];
  summary: ImportPreviewSummary;
  validationIssues?: Array<{ questionId: string; level: string; code: string; message: string }>;
}

export interface ImportJobStatusResponse {
  jobId: string;
  status: "processing" | "ready" | "failed" | "committed";
  progress?: { stage: string; percent: number; message: string };
  preview?: ImportPreview;
  error?: string;
  importError?: {
    code: string;
    message: string;
    suggestion: string;
    supportId: string;
    retryable: boolean;
  };
}

export interface ImportCommitResult {
  imported: number;
  skipped: number;
  questionIds: string[];
}
