import type { AiAssessmentConfig, AiGeneratedQuestion } from "../assessmentStudio/aiAssessment/types.js";

/** Single source of truth for AI quiz generation configuration. */
export type QuizGenerationConfiguration = AiAssessmentConfig & {
  questionTypeDistribution: Record<string, number>;
  bloomDistribution?: Record<string, number>;
};

export interface GenerationValidationResult {
  valid: boolean;
  error?: string;
}

export interface GenerationCoverage {
  requested: number;
  generated: number;
  coveragePercent: number;
  isComplete: boolean;
  byTypeRequested: Record<string, number>;
  byTypeGenerated: Record<string, number>;
  byDifficultyRequested?: Record<string, number>;
  byDifficultyGenerated: Record<string, number>;
  byBloomRequested?: Record<string, number>;
  byBloomGenerated: Record<string, number>;
}

export interface AssessmentGenerationResult {
  questions: AiGeneratedQuestion[];
  coverage: GenerationCoverage;
  partial: boolean;
  demoMode?: boolean;
}
