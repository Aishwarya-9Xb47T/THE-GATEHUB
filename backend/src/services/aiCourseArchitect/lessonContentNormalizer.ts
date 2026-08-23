/**
 * Canonical lesson CONTENT normalizer — distinct from blueprint structure normalizer.
 *
 * Blueprint = course → modules → lessons (titles, objectives, skeleton)
 * Lesson content = theory, examples, code, quiz, etc.
 *
 * AI / agent outputs may be undefined, partial, or use alternate keys.
 * Every downstream consumer must only see ArchitectLessonBlueprint after this boundary.
 */
import type {
  AICourseArchitectInterview,
  ArchitectLessonBlueprint,
  ArchitectModuleBlueprint,
} from "./types.js";
import { normalizeLearningGoals, normalizeStringArray } from "./blueprintNormalizer.js";

export type LessonContentValidationIssue = {
  code: "LESSON_CONTENT_SCHEMA_INVALID";
  field: string;
  message: string;
};

export class LessonContentValidationError extends Error {
  readonly code = "LESSON_CONTENT_SCHEMA_INVALID" as const;
  readonly field: string;
  readonly issues: LessonContentValidationIssue[];

  constructor(issues: LessonContentValidationIssue[]) {
    const primary = issues[0];
    super(
      primary
        ? `Lesson content validation failed: ${primary.field} — ${primary.message}`
        : "Lesson content validation failed"
    );
    this.name = "LessonContentValidationError";
    this.field = primary?.field ?? "lesson";
    this.issues = issues;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(obj: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    // AI sometimes returns theory as { introduction, concepts, ... }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const nested = v as Record<string, unknown>;
      const parts = [
        typeof nested.introduction === "string" ? nested.introduction : "",
        Array.isArray(nested.concepts) ? nested.concepts.map(String).join("\n") : "",
        Array.isArray(nested.explanations) ? nested.explanations.map(String).join("\n") : "",
        Array.isArray(nested.examples) ? nested.examples.map(String).join("\n") : "",
        typeof nested.analogy === "string" ? nested.analogy : "",
        typeof nested.content === "string" ? nested.content : "",
        typeof nested.body === "string" ? nested.body : "",
        typeof nested.text === "string" ? nested.text : "",
      ].filter((p) => p.trim().length > 0);
      if (parts.length) return parts.join("\n\n");
    }
  }
  return fallback;
}

function ensureTheoryText(
  raw: Record<string, unknown>,
  skeleton: ArchitectLessonBlueprint,
  moduleTitle: string
): string {
  const fromAi = pickString(raw, [
    "theory",
    "theoreticalContent",
    "theoretical_content",
    "theoryContent",
    "conceptExplanation",
    "concept_explanation",
    "overview",
    "body",
    "content",
  ]);
  if (fromAi.trim().length >= 40) return fromAi;

  const skeletonTheory = typeof skeleton.theory === "string" ? skeleton.theory : "";
  if (skeletonTheory.trim().length >= 40) return skeletonTheory;

  const title = skeleton.title || "this lesson";
  return [
    `## Foundation`,
    `This lesson develops a professional understanding of **${title}** within ${moduleTitle || "the module"}.`,
    ``,
    `## Structure`,
    `Learners progress from definitions and intuition to formal properties and applied checkpoints.`,
    ``,
    `## Application`,
    `Apply the ideas from ${title} through guided examples before independent practice.`,
    ``,
    `## Depth`,
    `Connect ${title} to prior lessons, identify common failure modes, and prepare for the next unit.`,
  ].join("\n");
}

/**
 * Convert AI/agent partial (or undefined) into a deterministic ArchitectLessonBlueprint.
 * Always returns a complete object — never undefined.
 */
export function normalizeLessonContent(
  raw: unknown,
  skeleton: ArchitectLessonBlueprint,
  opts?: {
    mod?: ArchitectModuleBlueprint;
    interview?: AICourseArchitectInterview;
    contentStatus?: ArchitectLessonBlueprint["contentStatus"];
  }
): ArchitectLessonBlueprint {
  const src = asRecord(raw);
  const base =
    skeleton && typeof skeleton === "object"
      ? skeleton
      : ({
          id: "lesson-unknown",
          title: "Untitled Lesson",
          durationMinutes: 45,
          introduction: "",
          objectives: [],
          theory: "",
          examples: "",
          summary: "",
          revision: "",
        } as ArchitectLessonBlueprint);

  const moduleTitle = opts?.mod?.title ?? "";
  const title =
    pickString(src, ["title", "name", "lessonTitle"], "").trim() ||
    base.title ||
    "Untitled Lesson";

  const objectives = normalizeLearningGoals(
    src.objectives,
    src.learningObjectives,
    src.learning_objectives,
    src.learningGoals,
    src.learning_goals,
    src.goals,
    base.objectives
  );

  const keyTakeaways = normalizeStringArray(
    src.keyTakeaways ?? src.key_takeaways ?? src.takeaways ?? base.keyTakeaways
  );
  const commonMistakes = normalizeStringArray(src.commonMistakes ?? src.common_mistakes ?? base.commonMistakes);
  const bestPractices = normalizeStringArray(src.bestPractices ?? src.best_practices ?? base.bestPractices);
  const industryNotesRaw = src.industryNotes ?? src.industry_notes ?? base.industryNotes;
  const industryNotes = Array.isArray(industryNotesRaw)
    ? normalizeStringArray(industryNotesRaw)
    : typeof industryNotesRaw === "string" && industryNotesRaw.trim()
      ? industryNotesRaw
      : undefined;

  const theory = ensureTheoryText(src, base, moduleTitle);
  const introduction =
    pickString(src, ["introduction", "overview", "intro"], "") ||
    base.introduction ||
    `Welcome to **${title}**. This lesson builds practical mastery inside ${moduleTitle || "the course"}.`;

  const examples =
    pickString(src, ["examples", "workedExamples", "worked_examples"], "") ||
    base.examples ||
    `## Example\nApply concepts from ${title} in a realistic scenario with clear inputs, steps, and validation.`;

  const summary =
    pickString(src, ["summary", "recap", "conclusion"], "") ||
    base.summary ||
    `In this lesson you covered ${title}, practiced core techniques, and prepared for the next checkpoint.`;

  const revision =
    pickString(src, ["revision", "revisionNotes", "revision_notes"], "") ||
    base.revision ||
    `**Revision checklist:** review objectives, re-read theory, redo the example, then attempt the quiz.`;

  const conceptExplanation =
    pickString(src, ["conceptExplanation", "concept_explanation", "concepts"], "") ||
    base.conceptExplanation;

  const realWorldAnalogy =
    pickString(src, ["realWorldAnalogy", "real_world_analogy", "analogy"], "") ||
    base.realWorldAnalogy;

  const codeExample =
    pickString(src, ["codeExample", "code_example", "code"], "") || base.codeExample;

  // Nested code object from AI
  const codeObj = asRecord(src.codeExample ?? src.code);
  const codeFromObj =
    typeof codeObj.code === "string"
      ? codeObj.code
      : typeof codeObj.source === "string"
        ? codeObj.source
        : "";

  const executionSteps =
    pickString(src, ["executionSteps", "execution_steps", "steps"], "") ||
    (Array.isArray(src.executionSteps) ? normalizeStringArray(src.executionSteps).join("\n") : "") ||
    base.executionSteps;

  const merged: ArchitectLessonBlueprint = {
    ...base,
    ...(raw && typeof raw === "object" ? (raw as ArchitectLessonBlueprint) : {}),
    id: pickString(src, ["id", "lessonId"], "") || base.id || `lesson-${Date.now()}`,
    title,
    durationMinutes:
      typeof src.durationMinutes === "number" && src.durationMinutes > 0
        ? src.durationMinutes
        : base.durationMinutes || 45,
    difficultyTier: base.difficultyTier,
    introduction,
    objectives: objectives.length ? objectives : [`Understand key concepts in ${title}`],
    theory,
    conceptExplanation: conceptExplanation || undefined,
    realWorldAnalogy: realWorldAnalogy || undefined,
    examples,
    summary,
    revision,
    keyTakeaways: keyTakeaways.length ? keyTakeaways : undefined,
    commonMistakes: commonMistakes.length ? commonMistakes : undefined,
    bestPractices: bestPractices.length ? bestPractices : undefined,
    industryNotes:
      typeof industryNotes === "string"
        ? industryNotes
        : Array.isArray(industryNotes) && industryNotes.length
          ? industryNotes.join("\n")
          : typeof base.industryNotes === "string"
            ? base.industryNotes
            : undefined,
    codeExample: codeExample || codeFromObj || base.codeExample,
    executionSteps: executionSteps || base.executionSteps,
    videos: Array.isArray(src.videos) ? (src.videos as ArchitectLessonBlueprint["videos"]) : base.videos,
    quizQuestions: Array.isArray(src.quizQuestions)
      ? (src.quizQuestions as ArchitectLessonBlueprint["quizQuestions"])
      : Array.isArray(asRecord(src.quiz).questions)
        ? (asRecord(src.quiz).questions as ArchitectLessonBlueprint["quizQuestions"])
        : base.quizQuestions,
    codingLab:
      src.codingLab && typeof src.codingLab === "object"
        ? (src.codingLab as ArchitectLessonBlueprint["codingLab"])
        : src.practical && typeof src.practical === "object"
          ? (src.practical as ArchitectLessonBlueprint["codingLab"])
          : base.codingLab,
    miniProject:
      src.miniProject && typeof src.miniProject === "object"
        ? (src.miniProject as ArchitectLessonBlueprint["miniProject"])
        : src.project && typeof src.project === "object"
          ? (src.project as ArchitectLessonBlueprint["miniProject"])
          : base.miniProject,
    contentStatus: opts?.contentStatus ?? base.contentStatus ?? "generated",
    prerequisites: normalizeStringArray(src.prerequisites ?? base.prerequisites),
  };

  return merged;
}

/** Assert canonical required fields exist after normalization. */
export function validateNormalizedLessonContent(
  lesson: ArchitectLessonBlueprint,
  pathPrefix = "lesson"
): void {
  const issues: LessonContentValidationIssue[] = [];
  const push = (field: string, message: string) => {
    issues.push({ code: "LESSON_CONTENT_SCHEMA_INVALID", field, message });
  };

  if (!lesson || typeof lesson !== "object") {
    push(pathPrefix, "Lesson content is missing");
    throw new LessonContentValidationError(issues);
  }
  if (!lesson.title?.trim()) push(`${pathPrefix}.title`, "title is required");
  if (typeof lesson.theory !== "string") {
    push(`${pathPrefix}.theory`, "theory must be a string after normalization");
  }
  if (!Array.isArray(lesson.objectives)) {
    push(`${pathPrefix}.objectives`, "objectives must be a string[]");
  }
  if (typeof lesson.introduction !== "string") {
    push(`${pathPrefix}.introduction`, "introduction must be a string");
  }
  if (typeof lesson.examples !== "string") {
    push(`${pathPrefix}.examples`, "examples must be a string");
  }
  if (typeof lesson.summary !== "string") {
    push(`${pathPrefix}.summary`, "summary must be a string");
  }

  if (issues.length) throw new LessonContentValidationError(issues);
}

export function normalizeAndValidateLessonContent(
  raw: unknown,
  skeleton: ArchitectLessonBlueprint,
  opts?: {
    mod?: ArchitectModuleBlueprint;
    interview?: AICourseArchitectInterview;
    contentStatus?: ArchitectLessonBlueprint["contentStatus"];
    pathPrefix?: string;
  }
): ArchitectLessonBlueprint {
  const normalized = normalizeLessonContent(raw, skeleton, opts);
  validateNormalizedLessonContent(normalized, opts?.pathPrefix ?? `lesson[${skeleton.id}]`);
  return normalized;
}

/**
 * Guarantee a lesson object before any `.theory` / `.objectives` access.
 * Use at every pipeline boundary where AgentRunner may return undefined output.
 */
export function ensureLessonContent(
  raw: unknown,
  skeleton: ArchitectLessonBlueprint,
  opts?: {
    mod?: ArchitectModuleBlueprint;
    interview?: AICourseArchitectInterview;
    stage?: string;
  }
): ArchitectLessonBlueprint {
  if (raw == null) {
    console.warn(
      `[LESSON_GENERATE] stage=${opts?.stage ?? "unknown"} lessonId=${skeleton?.id} raw=undefined — synthesizing canonical lesson from skeleton`
    );
  } else if (typeof raw === "object") {
    const keys = Object.keys(raw as object);
    if (!("theory" in (raw as object)) && !("theoreticalContent" in (raw as object))) {
      console.info(
        `[LESSON_VALIDATE] stage=${opts?.stage ?? "unknown"} lessonId=${skeleton?.id} objectKeys=${keys.join(",")} — theory missing; normalizing`
      );
    }
  }

  return normalizeAndValidateLessonContent(raw ?? {}, skeleton, {
    mod: opts?.mod,
    interview: opts?.interview,
    contentStatus: raw == null ? "generated" : undefined,
    pathPrefix: `modules[].lessons[${skeleton?.id ?? "?"}]`,
  });
}
