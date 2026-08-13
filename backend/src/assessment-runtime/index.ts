// A1.7 — Assessment Runtime (progression engine contracts)

export type { PaceKind, RuntimeAssessmentMode } from "./types/mode.js";
export { PACE_KINDS, RUNTIME_ASSESSMENT_MODES } from "./types/mode.js";

export type {
  AssessmentState,
  ParticipantAssessmentState,
  DeploymentRuntimeStatus,
  ParticipantRuntimeStatus,
} from "./types/state.js";

export type { AssessmentProgress, RoomProgressSummary } from "./types/progress.js";
export type { AssessmentRuntimeConfig } from "./types/config.js";
export { DEFAULT_RUNTIME_CONFIG } from "./types/config.js";
export type { AssessmentContext } from "./types/context.js";
export { assertHostContext, assertParticipantContext } from "./types/context.js";
export type { AssessmentTransition, AssessmentTransitionKind } from "./types/transition.js";
export type { AssessmentEvent, AssessmentEventListener } from "./types/events.js";
export type { AnswerFeedback, SubmitAnswerResult } from "./types/results.js";

export type { QuestionProgression, QuestionRef } from "./progression/questionProgression.js";

export type { PaceStrategy } from "./strategies/paceStrategy.js";
export { InstructorPacedStrategy } from "./strategies/instructorPacedStrategy.js";
export { SelfPacedStrategy } from "./strategies/selfPacedStrategy.js";
export type { TimerStrategy } from "./strategies/timerStrategy.js";
export { legacyTimerStrategy } from "./strategies/timerStrategy.js";
export type { LeaderboardStrategy } from "./strategies/leaderboardStrategy.js";
export { defaultLeaderboardStrategy } from "./strategies/leaderboardStrategy.js";
export type { FeedbackStrategy } from "./strategies/feedbackStrategy.js";
export { defaultFeedbackStrategy } from "./strategies/feedbackStrategy.js";

export type { LiveSessionPort, LiveSessionRoomSnapshot } from "./ports/liveSessionPort.js";

export { AssessmentRuntime } from "./runtime/assessmentRuntime.js";
export {
  PaceStrategyRegistry,
  createDefaultPaceStrategyRegistry,
} from "./registry/paceStrategyRegistry.js";
