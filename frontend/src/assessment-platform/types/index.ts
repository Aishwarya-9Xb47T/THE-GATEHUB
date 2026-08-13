/**
 * Frontend domain types — mirrors backend assessment-platform/domain.
 * Keep in sync with backend/src/assessment-platform/domain/
 */

export const ASSESSMENT_MODES = [
  "practice",
  "live_quiz",
  "homework",
  "assignment",
  "mock_test",
  "timed_assessment",
  "coding_assessment",
  "adaptive",
  "ai_interview",
  "survey",
  "poll",
] as const;

export type AssessmentMode = (typeof ASSESSMENT_MODES)[number];

export const ATTEMPT_STATUSES = [
  "in_progress",
  "submitted",
  "graded",
  "abandoned",
  "expired",
  "voided",
] as const;

export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export interface ChoiceSnapshot {
  id: string;
  text: string;
  order: number;
  metadata?: Record<string, unknown>;
}

/** Client-safe question — never includes isCorrect before grading */
export interface SanitizedQuestionSnapshot {
  id: string;
  questionVersionId: string;
  typeSlug: string;
  stem: string;
  order: number;
  marks: number;
  hints: string[];
  metadata: Record<string, unknown>;
  choices: ChoiceSnapshot[];
  media: Array<{ assetId: string; role: string; url?: string }>;
}

export interface LearningMetrics {
  accuracy: number;
  marksEarned: number;
  totalMarks: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  topicMastery: Record<string, number>;
  weakConcepts: string[];
  strongConcepts: string[];
  timePerConcept: Record<string, number>;
}

export interface EngagementMetrics {
  xpEarned: number;
  coinsEarned: number;
  streak: number;
  combo: number;
  sessionRank: number | null;
  achievementPoints: number;
  sessionScore: number;
}

export interface DeploymentSettings {
  timerPolicy: "none" | "per_question" | "global" | "strict_lock";
  questionTimerSeconds?: number;
  globalTimerMinutes?: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  gamificationEnabled: boolean;
  showExplanations: boolean;
  showCorrectAnswer: boolean;
  maxAttempts: number;
  passingScorePercent?: number;
}

export interface AttemptBootstrap {
  attemptId: string;
  deploymentId: string;
  assessmentVersionId: string;
  mode: AssessmentMode;
  status: AttemptStatus;
  settings: DeploymentSettings;
  questions: SanitizedQuestionSnapshot[];
  reconnectToken?: string;
}

export interface LearningResponseResult {
  isCorrect: boolean | null;
  marksAwarded: number;
  explanation?: string | null;
  correctOptionIds?: string[];
  feedback?: string | null;
}

export interface EngagementResponseResult {
  pointsEarned: number;
  xpDelta: number;
  streakAfter: number;
  comboAfter: number;
  rank?: number | null;
  rankMovement?: "up" | "down" | "same";
}

export interface DualTrackResponseResult {
  questionVersionId: string;
  learning: LearningResponseResult;
  engagement: EngagementResponseResult | null;
}

/** Renderer plugin contract (frontend) */
export interface QuestionRendererProps {
  question: SanitizedQuestionSnapshot;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  showResult?: LearningResponseResult | null;
  ariaLabel?: string;
}

import type { ComponentType } from "react";

export type QuestionRendererComponent = ComponentType<QuestionRendererProps>;

/** @deprecated Use QuestionRendererPlugin from ./renderer */
export interface RendererPlugin {
  typeSlug: string;
  component: QuestionRendererComponent;
  supportsOffline: boolean;
}

export * from "./renderer";
export * from "./response";
export * from "./overlay";
export * from "./modeConfig";
