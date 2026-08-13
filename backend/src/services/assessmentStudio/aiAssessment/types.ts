export interface AiAssessmentConfig {
  quizName: string;
  subject?: string;
  course?: string;
  department?: string;
  semester?: string;
  module?: string;
  chapter?: string;
  learningOutcome?: string;
  language?: string;
  targetAudience?: string;
  examType?: string;
  difficulty?: string;
  questionCount: number;
  questionTypes: string[];
  /** Per-type counts — must sum to questionCount. Source of truth for generation. */
  questionTypeDistribution?: Record<string, number>;
  bloomDistribution?: Record<string, number>;
  bloomLevel?: string;
  tone?: string;
  topic?: string;
  generateExplanations?: boolean;
  generateHints?: boolean;
  generateTags?: boolean;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  negativeMarking?: boolean;
  estimatedMinutes?: number;
  difficultyMix?: { easy: number; medium: number; hard: number; expert: number };
  /** Internal: global index offset for batched generation (unique stems across batches). */
  generationStartIndex?: number;
}

export type AiSourceType =
  | "topic"
  | "text"
  | "pdf"
  | "docx"
  | "pptx"
  | "website"
  | "youtube"
  | "markdown"
  | "google_docs"
  | "syllabus"
  | "question_bank"
  | "previous_quiz"
  | "course"
  | "notes"
  | "research_paper"
  | "image";

export interface AiGeneratedQuestion {
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
  warnings?: string[];
  selected: boolean;
  confidence?: number;
  estimatedSeconds?: number;
  marks?: number;
  metadata?: Record<string, unknown>;
}

export interface AiGenerationSummary {
  totalQuestions: number;
  requestedQuestions: number;
  generatedQuestions: number;
  coveragePercent: number;
  isComplete: boolean;
  byType: Record<string, number>;
  byTypeRequested?: Record<string, number>;
  byDifficulty: Record<string, number>;
  byDifficultyRequested?: Record<string, number>;
  byBloom: Record<string, number>;
  byBloomRequested?: Record<string, number>;
  withAnswers: number;
  averageConfidence: number;
  qualityScore: number;
  estimatedMinutes: number;
  warnings: string[];
  topicCoverage: string[];
}

export interface AiGenerationPreview {
  jobId: string;
  config: AiAssessmentConfig;
  source: AiSourceType;
  questions: AiGeneratedQuestion[];
  summary: AiGenerationSummary;
  demoMode?: boolean;
  aiNotice?: {
    type: string;
    title: string;
    message: string;
    solution?: string;
    retryable: boolean;
    requestedModel?: string;
    activeModel?: string;
  };
  modelNotice?: {
    title: string;
    message: string;
    requestedModel?: string;
    activeModel?: string;
  };
}

export interface AiJobStatusResponse {
  jobId: string;
  status: "processing" | "ready" | "failed";
  progress?: { stage: string; percent: number; message: string };
  preview?: AiGenerationPreview;
  error?: string;
  errorDetails?: {
    type: string;
    title: string;
    message: string;
    solution?: string;
    retryable: boolean;
    offlineFallback?: boolean;
  };
}
