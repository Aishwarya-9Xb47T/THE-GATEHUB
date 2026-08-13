import type { AssessmentContext } from "../types/context.js";
import type { AssessmentRuntimeConfig } from "../types/config.js";

/** Future-ready: decides when leaderboard UI/events fire (Phase 4 config matrix). */
export interface LeaderboardStrategy {
  readonly id: string;

  /** Whether to emit a student-visible leaderboard moment after this answer */
  shouldShowAfterAnswer(
    config: AssessmentRuntimeConfig,
    ctx: AssessmentContext,
    questionIndex: number
  ): boolean;
}

export const defaultLeaderboardStrategy: LeaderboardStrategy = {
  id: "default",
  shouldShowAfterAnswer(config, _ctx, questionIndex) {
    switch (config.leaderboardVisibility) {
      case "hidden":
      case "end_only":
        return false;
      case "every_question":
        return true;
      case "every_n_questions":
        return questionIndex >= 0 && (questionIndex + 1) % config.leaderboardEveryN === 0;
      default:
        return false;
    }
  },
};
