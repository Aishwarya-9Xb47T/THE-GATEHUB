import type { PaceKind, RuntimeAssessmentMode } from "./mode.js";

/**
 * Runtime configuration subset (full matrix in LIVE-MODE-REDESIGN §16).
 * Resolved once per deployment; strategies read-only.
 */
export interface AssessmentRuntimeConfig {
  mode: RuntimeAssessmentMode;
  paceKind: PaceKind;
  feedbackDelayMs: number;
  timerMode: "per_question" | "whole_quiz" | "none";
  questionTimerSeconds: number;
  leaderboardVisibility: "every_question" | "every_n_questions" | "end_only" | "hidden";
  leaderboardEveryN: number;
  pauseAllowed: boolean;
  lateJoin: boolean;
  autoSubmitOnTimerExpiry: boolean;
  showCorrectAnswer: "yes" | "no" | "after_end";
}

export const DEFAULT_RUNTIME_CONFIG: AssessmentRuntimeConfig = {
  mode: "live_quiz",
  paceKind: "instructor_paced",
  feedbackDelayMs: 2000,
  timerMode: "per_question",
  questionTimerSeconds: 30,
  leaderboardVisibility: "every_question",
  leaderboardEveryN: 5,
  pauseAllowed: true,
  lateJoin: true,
  autoSubmitOnTimerExpiry: false,
  showCorrectAnswer: "yes",
};
