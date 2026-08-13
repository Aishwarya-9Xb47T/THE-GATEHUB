import type { AssessmentContext } from "../types/context.js";
import type { AssessmentProgress, RoomProgressSummary } from "../types/progress.js";
import type { AssessmentState, ParticipantAssessmentState } from "../types/state.js";
import type { AssessmentTransition } from "../types/transition.js";
import type { PaceKind } from "../types/mode.js";

/**
 * Core progression contract — one implementation per pace kind.
 * Modes (homework, live, mock) select a PaceKind via config, not separate engines.
 */
export interface PaceStrategy {
  readonly paceKind: PaceKind;

  /** Host: open session for submissions */
  start(ctx: AssessmentContext): Promise<AssessmentTransition>;

  /** Host: advance room (instructor_paced only; no-op or error for self_paced) */
  advance(ctx: AssessmentContext): Promise<AssessmentTransition>;

  /** Host: end session for all */
  finish(ctx: AssessmentContext): Promise<AssessmentTransition>;

  /** Host: pause (Phase 5) — Phase 1 may return no_op */
  pause(ctx: AssessmentContext): Promise<AssessmentTransition>;

  /** Host: resume (Phase 5) */
  resume(ctx: AssessmentContext): Promise<AssessmentTransition>;

  /** Participant: submit answer for active question */
  submit(ctx: AssessmentContext, questionId: string, answer: unknown): Promise<AssessmentTransition>;

  /** Whether submit is allowed in current state */
  canSubmit(ctx: AssessmentContext, questionId: string): boolean;

  /** Room-level state for host / projector */
  getRoomState(ctx: AssessmentContext): Promise<AssessmentState>;

  /** Participant-level state for player restore */
  getParticipantState(ctx: AssessmentContext): Promise<ParticipantAssessmentState | null>;

  /** Single participant progress */
  getProgress(ctx: AssessmentContext): Promise<AssessmentProgress | null>;

  /** Host analytics aggregate */
  getRoomProgress(ctx: AssessmentContext): Promise<RoomProgressSummary>;
}
