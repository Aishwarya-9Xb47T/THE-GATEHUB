/**
 * Room / deployment lifecycle — infrastructure maps DB status to this shape.
 */
export const DEPLOYMENT_RUNTIME_STATUSES = [
  "lobby",
  "active",
  "paused",
  "finished",
] as const;

export type DeploymentRuntimeStatus = (typeof DEPLOYMENT_RUNTIME_STATUSES)[number];

export const PARTICIPANT_RUNTIME_STATUSES = [
  "online",
  "thinking",
  "answered",
  "finished",
  "disconnected",
  "idle",
] as const;

export type ParticipantRuntimeStatus = (typeof PARTICIPANT_RUNTIME_STATUSES)[number];

/** Room-level state exposed by the runtime (no UI, no transport). */
export interface AssessmentState {
  deploymentId: string;
  status: DeploymentRuntimeStatus;
  paceKind: import("./mode.js").PaceKind;
  questionCount: number;
  /** Room-level index — meaningful only for instructor_paced. */
  roomQuestionIndex: number | null;
  pausedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

/** Per-participant state — primary for self_paced / async modes. */
export interface ParticipantAssessmentState {
  participantId: string;
  userId: string | null;
  status: ParticipantRuntimeStatus;
  currentQuestionIndex: number;
  questionStartedAt: string | null;
  finishedAt: string | null;
  score: number;
  xp: number;
  streak: number;
  accuracy: number;
  rank: number | null;
}
