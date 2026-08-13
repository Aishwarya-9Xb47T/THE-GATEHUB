import type { AssessmentEvent } from "./events.js";
import type { AssessmentProgress } from "./progress.js";
import type { AssessmentState, ParticipantAssessmentState } from "./state.js";

/** Result of a single runtime operation — consumed by WS/REST adapters. */
export interface AssessmentTransition {
  kind: AssessmentTransitionKind;
  room?: AssessmentState;
  participant?: ParticipantAssessmentState;
  progress?: AssessmentProgress;
  /** Side-effect events for infrastructure to broadcast */
  events: AssessmentEvent[];
  /** Optional opaque payload (e.g. answer feedback) — adapter maps to API DTO */
  payload?: unknown;
}

export type AssessmentTransitionKind =
  | "session_started"
  | "session_paused"
  | "session_resumed"
  | "session_finished"
  | "question_advanced"
  | "answer_recorded"
  | "participant_finished"
  | "no_op";
