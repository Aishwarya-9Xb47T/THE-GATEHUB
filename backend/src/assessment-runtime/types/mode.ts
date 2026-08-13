/**
 * A1.7 — Pace kinds select a PaceStrategy implementation.
 * Distinct from deployment AssessmentMode (homework, live_quiz, …).
 */
export const PACE_KINDS = [
  "instructor_paced",
  "self_paced",
  "async",
  "timed",
  "adaptive",
] as const;

export type PaceKind = (typeof PACE_KINDS)[number];

/** Deployment / product mode — maps to config + strategy selection. */
export const RUNTIME_ASSESSMENT_MODES = [
  "live_quiz",
  "homework",
  "practice",
  "mock_test",
  "assignment",
  "timed_assessment",
  "adaptive",
] as const;

export type RuntimeAssessmentMode = (typeof RUNTIME_ASSESSMENT_MODES)[number];
