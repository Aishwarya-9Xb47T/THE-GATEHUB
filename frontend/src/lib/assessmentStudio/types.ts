export type BankQuestionStatus =
  | "draft"
  | "pending_review"
  | "needs_changes"
  | "approved"
  | "published"
  | "archived";

export interface BankQuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

export interface BankQuestionAnalytics {
  timesUsed: number;
  attempts: number;
  avgAccuracy: number;
  avgTimeMs: number | null;
  confusionScore: number | null;
}

export interface BankQuestion {
  id: string;
  stem: string;
  type: string;
  difficulty: string | null;
  bloomLevel: string | null;
  status: BankQuestionStatus;
  source: string;
  language: string;
  topic: string | null;
  subtopic: string | null;
  explanation: string | null;
  hints: string[];
  metadata: Record<string, unknown>;
  tags: string[];
  aiConfidence: number | null;
  estimatedSeconds: number | null;
  version: number;
  courseId: string | null;
  createdAt: string;
  updatedAt: string;
  options?: BankQuestionOption[];
  analytics?: BankQuestionAnalytics | null;
  course?: { id: string; title: string } | null;
  validations?: Array<{ status: string; checks: Record<string, { passed: boolean; message?: string }> }>;
}

export interface BankCollection {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  visibility: string;
  isTemplate: boolean;
  templateType: string | null;
  _count?: { items: number };
}

export interface StudioDashboard {
  totals: {
    questions: number;
    collections: number;
    aiGenerated: number;
    humanCreated: number;
    codingQuestions: number;
    pendingReview: number;
    approved: number;
    archived: number;
  };
  charts: {
    difficulty: Array<{ label: string; count: number }>;
    types: Array<{ label: string; count: number }>;
    bloom: Array<{ label: string; count: number }>;
  };
  recentlyAdded: BankQuestion[];
}

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  multiple_choice: "MCQ",
  multiple_select: "Multiple Select",
  true_false: "True / False",
  fill_blank: "Fill Blank",
  numerical: "Numerical",
  matching: "Matching",
  ordering: "Ordering",
  drag_drop: "Drag & Drop",
  essay: "Essay",
  case_study: "Case Study",
  scenario: "Scenario",
  coding: "Coding",
  debugging: "Debug Code",
  predict_output: "Predict Output",
  sql: "SQL",
  diagram: "Diagram",
  image_based: "Image Based",
  video_based: "Video Based",
  audio_based: "Audio Based",
  research_analysis: "Research Analysis",
};

export const STATUS_LABELS: Record<BankQuestionStatus, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  needs_changes: "Needs Changes",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
};

export type ImportSourceType =
  | "google_forms"
  | "google_docs"
  | "pdf"
  | "docx"
  | "pptx"
  | "image"
  | "txt"
  | "markdown"
  | "html"
  | "csv"
  | "moodle_xml"
  | "youtube"
  | "website";

export interface ImportErrorPayload {
  code: string;
  message: string;
  suggestion: string;
  supportId: string;
  retryable: boolean;
}

export interface ImportProgress {
  stage: string;
  percent: number;
  message: string;
}

export interface ImportJobStatus {
  jobId: string;
  status: "processing" | "ready" | "failed" | "committed";
  progress?: ImportProgress;
  preview?: ImportPreview;
  error?: string;
  importError?: ImportErrorPayload;
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
  options?: Array<{ text: string; isCorrect: boolean }>;
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

export const IMPORT_SOURCE_META: Record<
  ImportSourceType,
  { label: string; description: string; formats: string; icon: string }
> = {
  google_forms: {
    label: "Google Forms",
    description: "Paste a form URL or connect Google to import quiz questions, options, and answers.",
    formats: "forms.google.com URLs",
    icon: "forms",
  },
  google_docs: {
    label: "Google Docs",
    description: "Import questions from a Google Doc — connect Google for private documents.",
    formats: "docs.google.com URLs",
    icon: "docx",
  },
  pdf: {
    label: "PDF",
    description: "Upload exam papers, worksheets, or scanned documents. OCR + AI extraction.",
    formats: ".pdf",
    icon: "pdf",
  },
  docx: {
    label: "Word Document",
    description: "Import questions from DOCX with tables, equations, and answer keys.",
    formats: ".docx",
    icon: "docx",
  },
  pptx: {
    label: "PowerPoint",
    description: "Extract questions and concepts from slides. AI generates assessments from content.",
    formats: ".pptx",
    icon: "pptx",
  },
  image: {
    label: "Image (OCR)",
    description: "Scan question sheets, whiteboards, or textbook pages.",
    formats: "PNG, JPEG, WEBP, TIFF",
    icon: "image",
  },
  txt: {
    label: "Plain Text",
    description: "Paste or upload structured question lists.",
    formats: ".txt",
    icon: "txt",
  },
  markdown: {
    label: "Markdown",
    description: "Import from Markdown files with headings and lists.",
    formats: ".md, .markdown",
    icon: "markdown",
  },
  html: {
    label: "HTML",
    description: "Upload HTML files or paste a webpage URL to extract assessment content.",
    formats: ".html, https:// URLs",
    icon: "website",
  },
  csv: {
    label: "CSV / Excel",
    description: "Import structured question banks from CSV exports (Excel, Sheets).",
    formats: ".csv",
    icon: "txt",
  },
  moodle_xml: {
    label: "Moodle XML",
    description: "Import quizzes exported as Moodle XML from Moodle, Canvas, or compatible LMS.",
    formats: ".xml",
    icon: "markdown",
  },
  youtube: {
    label: "YouTube",
    description: "Generate MCQs, scenarios, and interview questions from video transcripts.",
    formats: "youtube.com URLs",
    icon: "youtube",
  },
  website: {
    label: "Website",
    description: "Extract readable content from any webpage and generate assessment items.",
    formats: "https:// URLs",
    icon: "website",
  },
};

export type StudioTab =
  | "dashboard"
  | "bank"
  | "collections"
  | "ai"
  | "templates"
  | "review"
  | "import"
  | "settings";
