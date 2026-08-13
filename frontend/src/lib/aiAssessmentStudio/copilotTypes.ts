export type CopilotIntent =
  | "harder"
  | "easier"
  | "rewrite"
  | "simplify"
  | "improve_grammar"
  | "improve_distractors"
  | "generate_similar"
  | "generate_opposite"
  | "generate_numerical"
  | "generate_coding"
  | "generate_scenario"
  | "generate_explanation"
  | "generate_hint"
  | "generate_explanations_all"
  | "generate_hints_all"
  | "translate"
  | "regenerate"
  | "convert_case_study"
  | "convert_type"
  | "remove_duplicates"
  | "balance_difficulty"
  | "reduce_duration"
  | "add_coding"
  | "increase_bloom"
  | "placement_test"
  | "detect_duplicates"
  | "shuffle"
  | "replace_theory"
  | "custom";

export interface ParsedCopilotCommand {
  intent: CopilotIntent;
  questionIndices: number[];
  questionIds: string[];
  count?: number;
  language?: string;
  targetAudience?: string;
  raw: string;
  confidence: number;
}

export interface AiValidationIssue {
  questionId: string;
  type:
    | "duplicate"
    | "weak_distractor"
    | "ambiguous"
    | "grammar"
    | "too_easy"
    | "too_hard"
    | "bloom_mismatch"
    | "missing_explanation"
    | "low_confidence";
  message: string;
  severity: "low" | "medium" | "high";
}

export interface AiQualityBreakdown {
  overall: number;
  questionQuality: number;
  difficultyBalance: number;
  coverage: number;
  readability: number;
  grammar: number;
  learningObjectives: number;
  distractorQuality: number;
  timeBalance: number;
}

export interface AiAssessmentInsights {
  difficultyDistribution: Record<string, number>;
  bloomDistribution: Record<string, number>;
  topicCoverage: Array<{ topic: string; percent: number }>;
  questionDiversity: number;
  estimatedMinutes: number;
  readingLevel: string;
  confidenceScore: number;
  grammarScore: number;
  duplicateCount: number;
  recommendations: string[];
  quality: AiQualityBreakdown;
  validationIssues: AiValidationIssue[];
}

export interface AiVersionSnapshot {
  id: string;
  label: string;
  action: string;
  createdAt: string;
  modifiedQuestionIds: string[];
  questions: import("./types").AiGeneratedQuestion[];
}

export interface AiQuestionComparison {
  questionId: string;
  original: import("./types").AiGeneratedQuestion;
  improved: import("./types").AiGeneratedQuestion;
}

export interface CopilotMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  streaming?: boolean;
  timestamp: string;
}

export interface CopilotStreamState {
  active: boolean;
  stage: string;
  questionId?: string;
}

export type { AiSourceType, AiAssessmentConfig, AiGeneratedQuestion, AiGenerationSummary, AiGenerationPreview, AiJobStatusResponse, AiStudioStep } from "./types";
