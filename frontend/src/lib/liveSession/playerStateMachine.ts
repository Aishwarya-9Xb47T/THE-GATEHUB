import type { LiveAnswerResult, LiveSessionState } from "./types";

/** Instructor-Paced Phases */
export type InstructorPlayerPhase =
  | "WAITING_ROOM"
  | "QUESTION_ACTIVE"
  | "ANSWER_SELECTED"
  | "SUBMITTING"
  | "SHOW_FEEDBACK"
  | "SHOW_LEADERBOARD"
  | "READY_FOR_NEXT"
  | "QUIZ_FINISHED";

/** Self-Paced Engine B Phases — READY_FOR_NEXT and WAITING_FOR_NEXT strictly purged */
export type SelfPacedPlayerPhase =
  | "WAITING_ROOM"
  | "QUESTION_ACTIVE"
  | "ANSWER_SELECTED"
  | "SUBMITTING"
  | "SHOW_FEEDBACK"
  | "AUTO_ADVANCE_DELAY"
  | "QUIZ_FINISHED";

/** Combined phases for backward compatibility in generic player shell */
export type LivePlayerPhase = InstructorPlayerPhase | SelfPacedPlayerPhase;

export type ConnectionPhase = "connecting" | "connected" | "reconnecting" | "failed";

export function deriveInitialPhase(state: LiveSessionState | null): LivePlayerPhase {
  if (!state) return "WAITING_ROOM";
  if (state.status === "finished") return "QUIZ_FINISHED";
  if (state.status === "lobby") return "WAITING_ROOM";
  if (state.status === "active" && state.currentQuestion) return "QUESTION_ACTIVE";
  return "WAITING_ROOM";
}

export function phaseAfterSubmit(): LivePlayerPhase {
  return "SHOW_FEEDBACK";
}

export function phaseAfterFeedback(
  showLeaderboard: boolean,
  paceMode: "self_paced" | "instructor_paced" = "instructor_paced"
): LivePlayerPhase {
  if (paceMode === "self_paced") {
    return showLeaderboard ? "SHOW_LEADERBOARD" : "QUESTION_ACTIVE";
  }
  return showLeaderboard ? "SHOW_LEADERBOARD" : "READY_FOR_NEXT";
}

export function phaseAfterLeaderboard(paceMode: "self_paced" | "instructor_paced" = "instructor_paced"): LivePlayerPhase {
  if (paceMode === "self_paced") {
    return "QUESTION_ACTIVE";
  }
  return "READY_FOR_NEXT";
}

export function phaseOnQuestionAdvanced(): LivePlayerPhase {
  return "QUESTION_ACTIVE";
}

export function phaseOnRestore(hasSubmitted: boolean, paceMode: "self_paced" | "instructor_paced" = "instructor_paced"): LivePlayerPhase {
  if (!hasSubmitted) return "QUESTION_ACTIVE";
  return paceMode === "self_paced" ? "SHOW_FEEDBACK" : "READY_FOR_NEXT";
}

export function canSubmit(phase: LivePlayerPhase): boolean {
  return phase === "QUESTION_ACTIVE" || phase === "ANSWER_SELECTED";
}

export function canSelectOption(phase: LivePlayerPhase): boolean {
  return canSubmit(phase);
}

export function isQuestionVisible(phase: LivePlayerPhase): boolean {
  return phase === "QUESTION_ACTIVE" || phase === "ANSWER_SELECTED" || phase === "SUBMITTING";
}

/** Full animated feedback (2–3s). */
export function isFeedbackFullScreen(phase: LivePlayerPhase): boolean {
  return phase === "SHOW_FEEDBACK" || phase === "AUTO_ADVANCE_DELAY";
}

/** Compact result + optional leaderboard — player shell stays alive. */
export function isPostSubmitPhase(phase: LivePlayerPhase, paceMode: "self_paced" | "instructor_paced" = "instructor_paced"): boolean {
  if (paceMode === "self_paced") {
    return phase === "SHOW_FEEDBACK" || phase === "AUTO_ADVANCE_DELAY";
  }
  return phase === "SHOW_FEEDBACK" || phase === "SHOW_LEADERBOARD" || phase === "READY_FOR_NEXT";
}

export function isReadyForNext(phase: LivePlayerPhase, paceMode: "self_paced" | "instructor_paced" = "instructor_paced"): boolean {
  if (paceMode === "self_paced") return false;
  return phase === "READY_FOR_NEXT";
}

export function isLeaderboardMoment(phase: LivePlayerPhase): boolean {
  return phase === "SHOW_LEADERBOARD";
}

export type { LiveAnswerResult };
