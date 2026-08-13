import type { AssessmentRuntimeConfig } from "../types/config.js";

export type FeedbackPresentation = "full" | "compact" | "none";

/** Future-ready: feedback timing and visibility (Phase 4 config matrix). */
export interface FeedbackStrategy {
  readonly id: string;

  presentation(config: AssessmentRuntimeConfig): FeedbackPresentation;

  delayMs(config: AssessmentRuntimeConfig): number;

  includeCorrectAnswer(config: AssessmentRuntimeConfig, sessionEnded: boolean): boolean;
}

export const defaultFeedbackStrategy: FeedbackStrategy = {
  id: "default",
  presentation(config) {
    if (config.feedbackDelayMs <= 0) return "none";
    return "full";
  },
  delayMs(config) {
    return config.feedbackDelayMs;
  },
  includeCorrectAnswer(config, sessionEnded) {
    if (config.showCorrectAnswer === "yes") return true;
    if (config.showCorrectAnswer === "after_end" && sessionEnded) return true;
    return false;
  },
};
