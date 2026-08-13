import type { ParticipantRuntimeStatus } from "./state.js";

/** Progress snapshot for one participant — mode-agnostic. */
export interface AssessmentProgress {
  participantId: string;
  currentQuestionIndex: number;
  questionCount: number;
  questionsAnswered: number;
  isComplete: boolean;
  status: ParticipantRuntimeStatus;
  /** Percent complete 0–100 */
  percentComplete: number;
}

/** Room-level progress summary for host analytics. */
export interface RoomProgressSummary {
  deploymentId: string;
  participantCount: number;
  finishedCount: number;
  /** Histogram: questionIndex → count of participants currently on that index */
  indexDistribution: Record<number, number>;
}
