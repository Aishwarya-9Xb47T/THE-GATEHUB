import type { AssessmentContext } from "../types/context.js";
import type { AssessmentRuntimeConfig } from "../types/config.js";

/** Future-ready: computes timer anchors and expiry (Phase 4+ config matrix). */
export interface TimerStrategy {
  readonly id: string;

  /** Milliseconds remaining for current question/participant, or null if no timer */
  remainingMs(ctx: AssessmentContext, questionIndex: number): number | null;

  /** Whether a submission should be auto-fired when timer expires */
  shouldAutoSubmit(config: AssessmentRuntimeConfig): boolean;
}

/** Phase 1 stub — always defers to legacy live timer behavior in adapters. */
export const legacyTimerStrategy: TimerStrategy = {
  id: "legacy",
  remainingMs: () => null,
  shouldAutoSubmit: (config) => config.autoSubmitOnTimerExpiry,
};
