/**
 * Production default: quality mode on (FAST_MODE off).
 * Set AI_ARCHITECT_FAST_MODE=true only for speed-draft local iteration.
 */
export const ARCHITECT_FAST_MODE = process.env.AI_ARCHITECT_FAST_MODE === "true";

/** Retrieval-Augmented Generation — on by default in quality mode. */
export const RAG_ENABLED =
  process.env.AI_ARCHITECT_RAG_ENABLED !== "false" &&
  (process.env.AI_ARCHITECT_RAG_ENABLED === "true" || !ARCHITECT_FAST_MODE);

/** Minimum authoritative sources for multi-source consensus. */
export const MIN_CONSENSUS_SOURCES = Math.max(
  1,
  Math.min(5, parseInt(process.env.AI_ARCHITECT_MIN_SOURCES || "3", 10) || 3)
);

export const MAX_RETRIEVAL_SOURCES = Math.max(
  5,
  Math.min(20, parseInt(process.env.AI_ARCHITECT_MAX_RETRIEVAL_SOURCES || "12", 10) || 12)
);

export const LESSON_CONCURRENCY = Math.max(
  1,
  Math.min(
    16,
    parseInt(
      process.env.AI_ARCHITECT_LESSON_CONCURRENCY ||
        (ARCHITECT_FAST_MODE ? "12" : "6"),
      10
    ) || (ARCHITECT_FAST_MODE ? 12 : 6)
  )
);

export const IMPROVEMENT_ROUNDS = ARCHITECT_FAST_MODE
  ? Math.max(0, parseInt(process.env.AI_ARCHITECT_IMPROVEMENT_ROUNDS || "0", 10) || 0)
  : Math.max(1, Math.min(4, parseInt(process.env.AI_ARCHITECT_IMPROVEMENT_ROUNDS || "2", 10) || 2));

export const AGENT_MAX_ATTEMPTS = ARCHITECT_FAST_MODE ? 1 : 2;

export const MAX_COMPONENT_RETRIES = ARCHITECT_FAST_MODE ? 0 : 3;

export const PUBLISH_THRESHOLD = Math.max(
  70,
  Math.min(
    100,
    parseInt(
      process.env.AI_ARCHITECT_PUBLISH_THRESHOLD ||
        (ARCHITECT_FAST_MODE ? "82" : "98"),
      10
    ) || (ARCHITECT_FAST_MODE ? 82 : 98)
  )
);

/** V6 Part 3 — Self-healing loop target (component regen until this score). */
export const SELF_HEALING_THRESHOLD = Math.max(
  70,
  Math.min(
    100,
    parseInt(process.env.AI_ARCHITECT_SELF_HEAL_THRESHOLD || "88", 10) || 88
  )
);

/** Block publish on QA failure (production default ON). Set AI_ARCHITECT_STRICT_QA=false to disable. */
export const STRICT_QA_BLOCK = process.env.AI_ARCHITECT_STRICT_QA !== "false";

/** Skip per-lesson project LLM — only last lesson per module (or module with project flag). */
export const SKIP_PER_LESSON_PROJECT = ARCHITECT_FAST_MODE;

/** Use heuristic lesson pedagogy plan (skip planning LLM per lesson). */
export const SKIP_LESSON_PLANNING_LLM = ARCHITECT_FAST_MODE;

/** Run quiz + lab agents in parallel after lesson body is written. */
export const PARALLEL_QUIZ_AND_LAB = true;

/** Skip AI thumbnail during generate (add in Academic Studio later). */
export const SKIP_THUMBNAIL_ON_GENERATE = ARCHITECT_FAST_MODE;

export function shouldRunLessonProjectAgent(
  mod: { lessons: unknown[]; project?: unknown },
  lessonIndex: number,
  interviewHasProject: boolean
): boolean {
  if (!interviewHasProject && !mod.project) return false;
  if (!SKIP_PER_LESSON_PROJECT) return interviewHasProject || Boolean(mod.project);
  const isLastLesson = lessonIndex === mod.lessons.length - 1;
  return isLastLesson && (interviewHasProject || Boolean(mod.project));
}
