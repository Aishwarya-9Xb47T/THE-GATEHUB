/**
 * Content Builder — Frontend Types
 * The user never sees these names; they're internal to the data layer.
 *
 * Design principle: every source (file, paste, Google Workspace) eventually
 * becomes ONE AssessmentDocument before entering the shared pipeline.
 * These types represent the shared pipeline's output — they are source-agnostic.
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** Primary content sources shown in the redesigned picker */
export type PrimaryContentSource = 'learning_material' | 'google_workspace' | 'paste_text';

/** Legacy type kept for API compatibility */
export type ContentSourceId =
  | 'upload_files'
  | 'paste_text'
  | 'google_docs'
  | 'google_forms'
  | 'website_url'
  | 'youtube';

export interface ReviewQuestion {
  id: string;
  text: string;
  type: 'multiple_choice' | 'multiple_select' | 'true_false' | 'short_answer';
  children?: Array<Record<string, any>>;
  options: Array<{ id: string; text: string; isCorrect: boolean; order: number }>;
  correctAnswer: string | string[];
  explanation?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  /** 0–100 */
  confidence: number;
  warnings: string[];
  validationStatus: 'valid' | 'flagged' | 'rejected';
  metadata?: Record<string, any>;
}

export interface ReviewStatistics {
  sourceType: string;
  processingTime: number;
  questionsFound: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  imagesImported: number;
  tablesImported: number;
  formulaeImported?: number;
  codeBlocksImported?: number;
  linksImported?: number;
  audioImported?: number;
  videoImported?: number;
  overallConfidence?: number;
  pagesProcessed: number;
}

export interface ContentBuilderReviewPayload {
  jobId: string;
  questions: ReviewQuestion[];
  statistics: ReviewStatistics;
  diagnostics?: {
    fileHash?: string;
    fileName?: string;
    stagesCompleted?: string[];
    flaggedQuestions?: number;
    rejectedQuestions?: number;
    answersDetected?: number;
    needsReview?: number;
    warnings?: string[];
    googleResourceType?: string;
    googleResourceId?: string;
    googleSourceUrl?: string;
    extractionMethod?: string;
    sectionsDetected?: number;
  };
}

export interface ContentBuilderCommitResult {
  quizId: string;
  title: string;
  questionCount: number;
}

export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 85) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence — needs review',
};

export const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  high: 'text-emerald-400',
  medium: 'text-amber-400',
  low: 'text-red-400',
};

/**
 * Universal pipeline step labels.
 * These are source-agnostic — Quiz Builder never knows where the content came from.
 */
export const PROCESSING_STEPS = [
  'Reading learning material',
  'Normalising text, tables, and code',
  'Detecting assessment questions',
  'Matching answers and options',
  'Preserving explanations and structure',
  'Validating question quality',
  'Preparing Assessment Review',
] as const;

/** @deprecated Use PROCESSING_STEPS instead */
export const ANALYSIS_STEPS = PROCESSING_STEPS;
