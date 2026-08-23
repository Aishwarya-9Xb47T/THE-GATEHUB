/**
 * Canonical blueprint / field normalization before Step 12 course generation.
 * AI and client payloads may use alternate keys or omit arrays — never trust raw shapes.
 */
import type {
  AICourseArchitectInterview,
  ArchitectBlueprint,
  ArchitectLessonBlueprint,
  ArchitectModuleBlueprint,
} from "./types.js";

export type BlueprintValidationIssue = {
  code: "BLUEPRINT_SCHEMA_INVALID";
  field: string;
  message: string;
};

export class BlueprintValidationError extends Error {
  readonly code = "BLUEPRINT_SCHEMA_INVALID" as const;
  readonly field: string;
  readonly issues: BlueprintValidationIssue[];

  constructor(issues: BlueprintValidationIssue[]) {
    const primary = issues[0];
    super(
      primary
        ? `Blueprint validation failed: ${primary.field} — ${primary.message}`
        : "Blueprint validation failed"
    );
    this.name = "BlueprintValidationError";
    this.field = primary?.field ?? "blueprint";
    this.issues = issues;
  }
}

/** Accept learningGoals / learning_goals / goals / objectives / string|array → string[] */
export function normalizeLearningGoals(value: unknown, ...alts: unknown[]): string[] {
  for (const candidate of [value, ...alts]) {
    const normalized = normalizeStringArray(candidate);
    if (normalized.length) return normalized;
  }
  return [];
}

export function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object" && "text" in item) {
          return String((item as { text?: unknown }).text ?? "").trim();
        }
        if (item && typeof item === "object" && "title" in item) {
          return String((item as { title?: unknown }).title ?? "").trim();
        }
        return String(item ?? "").trim();
      })
      .filter((s) => s.length > 0);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\n|;|\|/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(obj: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return fallback;
}

function pickNumber(obj: Record<string, unknown>, keys: string[], fallback: number): number {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return fallback;
}

function normalizeLesson(
  raw: unknown,
  moduleIndex: number,
  lessonIndex: number,
  moduleTitle: string
): ArchitectLessonBlueprint {
  const lesson = asRecord(raw);
  const title =
    pickString(lesson, ["title", "name", "lessonTitle"], "") ||
    `${moduleTitle} — Lesson ${lessonIndex + 1}`;
  const objectives = normalizeLearningGoals(
    lesson.objectives,
    lesson.learningObjectives,
    lesson.learning_objectives,
    lesson.goals
  );
  const learningGoals = normalizeLearningGoals(
    lesson.learningGoals,
    lesson.learning_goals,
    lesson.goals,
    objectives
  );
  const topics = normalizeStringArray(lesson.topics ?? lesson.topicList ?? lesson.keyTopics);
  const prerequisites = normalizeStringArray(lesson.prerequisites ?? lesson.priorKnowledge);
  const keyTakeaways = normalizeStringArray(lesson.keyTakeaways ?? lesson.key_takeaways ?? lesson.takeaways);

  const id =
    pickString(lesson, ["id", "lessonId"], "") ||
    `lesson-${String(moduleIndex + 1).padStart(2, "0")}-${String(lessonIndex + 1).padStart(2, "0")}`;

  const base = raw && typeof raw === "object" ? (raw as ArchitectLessonBlueprint) : ({} as ArchitectLessonBlueprint);

  return {
    ...base,
    id,
    title,
    durationMinutes: pickNumber(lesson, ["durationMinutes", "duration", "estimatedMinutes"], 45),
    objectives: objectives.length
      ? objectives
      : learningGoals.length
        ? learningGoals
        : [`Understand key concepts in ${title}`],
    introduction: typeof base.introduction === "string" ? base.introduction : "",
    theory: typeof base.theory === "string" ? base.theory : "",
    examples: typeof base.examples === "string" ? base.examples : "",
    summary: typeof base.summary === "string" ? base.summary : "",
    revision: typeof base.revision === "string" ? base.revision : "",
    prerequisites,
    keyTakeaways: keyTakeaways.length ? keyTakeaways : undefined,
    contentStatus: base.contentStatus ?? "planned",
    // Preserve normalized aliases for any downstream that still reads these keys
    ...(learningGoals.length ? { learningGoals } : {}),
    ...(topics.length ? { topics } : {}),
  } as ArchitectLessonBlueprint & { learningGoals?: string[]; topics?: string[] };
}

function normalizeModule(raw: unknown, moduleIndex: number): ArchitectModuleBlueprint {
  const mod = asRecord(raw);
  const title =
    pickString(mod, ["title", "name", "moduleTitle"], "") || `Module ${moduleIndex + 1}`;
  const lessonsRaw = Array.isArray(mod.lessons)
    ? mod.lessons
    : Array.isArray(mod.units)
      ? mod.units
      : Array.isArray(mod.chapters)
        ? mod.chapters
        : [];

  const learningOutcomes = normalizeLearningGoals(
    mod.learningOutcomes,
    mod.learning_outcomes,
    mod.learningGoals,
    mod.learning_goals,
    mod.goals,
    mod.objectives
  );

  const id =
    pickString(mod, ["id", "moduleId"], "") ||
    `module-${String(moduleIndex + 1).padStart(2, "0")}`;

  const base = raw && typeof raw === "object" ? (raw as ArchitectModuleBlueprint) : ({} as ArchitectModuleBlueprint);

  return {
    ...base,
    id,
    title,
    description:
      pickString(mod, ["description", "summary", "overview"], "") ||
      `Core concepts and practice for ${title}.`,
    learningOutcomes: learningOutcomes.length
      ? learningOutcomes
      : [`Apply concepts from ${title}`],
    estimatedHours: pickNumber(mod, ["estimatedHours", "hours"], Math.max(1, lessonsRaw.length)),
    lessons: lessonsRaw.map((lesson, li) => normalizeLesson(lesson, moduleIndex, li, title)),
  };
}

/**
 * Deterministic approved-blueprint shape for generation.
 * Adapts alternate AI/client keys onto the existing ArchitectBlueprint schema.
 */
export function normalizeApprovedBlueprint(
  raw: ArchitectBlueprint | Record<string, unknown> | null | undefined,
  interview?: AICourseArchitectInterview
): ArchitectBlueprint {
  const bp = asRecord(raw);
  const c = interview?.courseInfo;
  const modulesRaw = Array.isArray(bp.modules)
    ? bp.modules
    : Array.isArray(bp.sections)
      ? bp.sections
      : Array.isArray(bp.units)
        ? bp.units
        : [];

  const modules = modulesRaw.map((m, i) => normalizeModule(m, i));
  const learningOutcomes = normalizeLearningGoals(
    bp.learningOutcomes,
    bp.learning_outcomes,
    bp.learningGoals,
    bp.learning_goals,
    c?.expectedOutcomes,
    c?.learningGoals
  );
  const prerequisites = normalizeStringArray(bp.prerequisites ?? c?.prerequisites);

  const courseTitle =
    pickString(bp, ["courseTitle", "title", "name"], "") ||
    c?.title ||
    "Untitled Course";

  const base = raw && typeof raw === "object" ? (raw as ArchitectBlueprint) : ({} as ArchitectBlueprint);

  const marketingSrc = asRecord(bp.marketing);
  const marketingHighlights = normalizeLearningGoals(
    marketingSrc.highlights,
    c?.learningGoals,
    learningOutcomes
  );

  return {
    ...base,
    phase: (bp.phase as ArchitectBlueprint["phase"]) || base.phase || "approved",
    courseTitle,
    subtitle:
      pickString(bp, ["subtitle"], "") ||
      base.subtitle ||
      c?.subtitle ||
      `Master ${c?.subject || courseTitle}`,
    description:
      pickString(bp, ["description", "overview", "summary"], "") ||
      base.description ||
      `${courseTitle} — structured curriculum for ${c?.subject || "professional learners"}.`,
    category: pickString(bp, ["category"], "") || base.category || c?.categoryName || c?.subject || "",
    difficulty:
      pickString(bp, ["difficulty"], "") ||
      base.difficulty ||
      (c?.difficulty ? c.difficulty.charAt(0).toUpperCase() + c.difficulty.slice(1) : "Intermediate"),
    estimatedDuration:
      pickString(bp, ["estimatedDuration"], "") ||
      base.estimatedDuration ||
      c?.estimatedDuration ||
      "40 hours",
    estimatedHours:
      pickNumber(bp, ["estimatedHours"], 0) ||
      base.estimatedHours ||
      c?.estimatedHours ||
      40,
    prerequisites,
    learningOutcomes: learningOutcomes.length
      ? learningOutcomes
      : c?.expectedOutcomes?.length
        ? [...c.expectedOutcomes]
        : [`Complete ${courseTitle} with measurable outcomes`],
    modules,
    marketing: {
      seoTitle: pickString(marketingSrc, ["seoTitle"], "") || base.marketing?.seoTitle || courseTitle,
      seoDescription:
        pickString(marketingSrc, ["seoDescription"], "") ||
        base.marketing?.seoDescription ||
        String(base.description || courseTitle).slice(0, 160),
      tags: normalizeStringArray(marketingSrc.tags ?? base.marketing?.tags).length
        ? normalizeStringArray(marketingSrc.tags ?? base.marketing?.tags)
        : [c?.subject, c?.industry, c?.difficulty].filter(Boolean) as string[],
      highlights: marketingHighlights.length
        ? marketingHighlights.slice(0, 8)
        : base.marketing?.highlights ?? [],
      bannerPrompt:
        pickString(marketingSrc, ["bannerPrompt"], "") ||
        base.marketing?.bannerPrompt ||
        `Professional course banner for ${courseTitle}, modern education, no text`,
      colorTheme:
        pickString(marketingSrc, ["colorTheme"], "") ||
        base.marketing?.colorTheme ||
        "deep blue and gold",
    },
  };
}

/** Validate normalized blueprint; throws BlueprintValidationError with exact field paths. */
export function validateApprovedBlueprint(
  blueprint: ArchitectBlueprint | null | undefined
): asserts blueprint is ArchitectBlueprint {
  const issues: BlueprintValidationIssue[] = [];
  const push = (field: string, message: string) => {
    issues.push({ code: "BLUEPRINT_SCHEMA_INVALID", field, message });
  };

  if (!blueprint || typeof blueprint !== "object") {
    push("blueprint", "Blueprint is missing");
    throw new BlueprintValidationError(issues);
  }

  if (!blueprint.courseTitle?.trim()) {
    push("courseTitle", "Course title is required");
  }

  if (!Array.isArray(blueprint.modules)) {
    push("modules", "modules must be an array");
    throw new BlueprintValidationError(issues);
  }

  if (blueprint.modules.length === 0) {
    push("modules", "At least one module is required");
  }

  blueprint.modules.forEach((mod, mi) => {
    if (!mod || typeof mod !== "object") {
      push(`modules[${mi}]`, "Module is missing");
      return;
    }
    if (!mod.title?.trim()) {
      push(`modules[${mi}].title`, "Module title is required");
    }
    if (!Array.isArray(mod.learningOutcomes)) {
      push(`modules[${mi}].learningOutcomes`, "learningOutcomes must be a normalized string[]");
    }
    if (!Array.isArray(mod.lessons)) {
      push(`modules[${mi}].lessons`, "lessons must be an array");
      return;
    }
    if (mod.lessons.length === 0) {
      push(`modules[${mi}].lessons`, "Module must contain at least one lesson");
    }
    mod.lessons.forEach((lesson, li) => {
      if (!lesson || typeof lesson !== "object") {
        push(`modules[${mi}].lessons[${li}]`, "Lesson is missing");
        return;
      }
      if (!lesson.title?.trim()) {
        push(`modules[${mi}].lessons[${li}].title`, "Lesson title is required");
      }
      if (!Array.isArray(lesson.objectives)) {
        push(`modules[${mi}].lessons[${li}].objectives`, "objectives must be a normalized string[]");
      }
    });
  });

  if (issues.length) {
    throw new BlueprintValidationError(issues);
  }
}

export function normalizeAndValidateApprovedBlueprint(
  raw: ArchitectBlueprint | Record<string, unknown> | null | undefined,
  interview?: AICourseArchitectInterview
): ArchitectBlueprint {
  const normalized = normalizeApprovedBlueprint(raw, interview);
  validateApprovedBlueprint(normalized);
  return normalized;
}
