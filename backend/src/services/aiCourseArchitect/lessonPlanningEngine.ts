/**
 * V2 — Per-lesson pedagogy planning BEFORE content generation.
 * The AI reasons about prerequisites, misconceptions, and component selection first.
 */
import { getOpenAi } from "./openaiClient.js";
import type {
  AICourseArchitectInterview,
  ArchitectBlueprint,
  ArchitectLessonBlueprint,
  ArchitectModuleBlueprint,
  LessonPedagogyPlan,
} from "./types.js";
import type { LessonBlueprintPlan } from "./orchestrator/contracts.js";
// LessonBlueprintPlan used by ensureLessonBlueprintPlan + formatPedagogyForPrompt
import { formatMasterPedagogyForPrompt } from "./engines/masterPedagogy.js";
import { hasLearningComponent, hasLessonStructure } from "./types.js";
import { PROFESSOR_SYSTEM_PROMPT, LESSON_DESIGN_SECTIONS } from "./instructorPersona.js";
import { getArchitectModel } from "./architectModels.js";
import { SKIP_LESSON_PLANNING_LLM } from "./architectPerformance.js";


export type LessonOutlineContext = {
  globalIndex: number;
  priorLessons: Array<{ moduleTitle: string; lessonTitle: string; tier?: string }>;
  nextLessons: Array<{ moduleTitle: string; lessonTitle: string }>;
};

export function buildLessonOutlineContext(
  blueprint: ArchitectBlueprint,
  modIndex: number,
  lessonIndex: number
): LessonOutlineContext {
  const flat: Array<{ moduleTitle: string; lessonTitle: string; tier?: string; mi: number; li: number }> = [];
  blueprint.modules.forEach((mod, mi) => {
    mod.lessons.forEach((lesson, li) => {
      flat.push({ moduleTitle: mod.title, lessonTitle: lesson.title, tier: lesson.difficultyTier, mi, li });
    });
  });
  const globalIndex = flat.findIndex((f) => f.mi === modIndex && f.li === lessonIndex);
  return {
    globalIndex,
    priorLessons: flat.slice(Math.max(0, globalIndex - 3), globalIndex).map(({ moduleTitle, lessonTitle, tier }) => ({
      moduleTitle,
      lessonTitle,
      tier,
    })),
    nextLessons: flat.slice(globalIndex + 1, globalIndex + 2).map(({ moduleTitle, lessonTitle }) => ({
      moduleTitle,
      lessonTitle,
    })),
  };
}

/**
 * Normalize a raw LessonPedagogyPlan (e.g. from AI JSON parse) to guarantee all
 * array fields are string[]. AI providers may return null / undefined / a bare string
 * for any array field; merging { ...heuristic, ...parsed } can overwrite valid arrays
 * with invalid values, crashing every downstream .join() / .slice() call.
 */
export function normalizeLessonPedagogyPlan(raw: Partial<LessonPedagogyPlan> & {
  learningGoals?: unknown;
  priorKnowledge?: unknown;
  misconceptions?: unknown;
  strugglePoints?: unknown;
  sectionsToEmphasize?: unknown;
}, fallback: LessonPedagogyPlan): LessonPedagogyPlan {
  const safeArr = (val: unknown, fb: string[]): string[] => {
    if (Array.isArray(val) && val.length > 0) {
      return val.map(String).filter((s) => s.trim().length > 0);
    }
    if (typeof val === "string" && val.trim()) return [val.trim()];
    return fb;
  };
  return {
    ...fallback,
    ...(raw as LessonPedagogyPlan),
    learningGoals: safeArr(raw.learningGoals, fallback.learningGoals),
    priorKnowledge: safeArr(raw.priorKnowledge, fallback.priorKnowledge),
    misconceptions: safeArr(raw.misconceptions, fallback.misconceptions),
    strugglePoints: safeArr(raw.strugglePoints, fallback.strugglePoints),
    sectionsToEmphasize: safeArr(raw.sectionsToEmphasize, fallback.sectionsToEmphasize),
    // Preserve boolean fields from raw if present, else fallback
    useVisuals: typeof raw.useVisuals === "boolean" ? raw.useVisuals : fallback.useVisuals,
    useCode: typeof raw.useCode === "boolean" ? raw.useCode : fallback.useCode,
    useMath: typeof raw.useMath === "boolean" ? raw.useMath : fallback.useMath,
    useAnalogies: typeof raw.useAnalogies === "boolean" ? raw.useAnalogies : fallback.useAnalogies,
    useDiagrams: typeof raw.useDiagrams === "boolean" ? raw.useDiagrams : fallback.useDiagrams,
    includeLab: typeof raw.includeLab === "boolean" ? raw.includeLab : fallback.includeLab,
    includeQuiz: typeof raw.includeQuiz === "boolean" ? raw.includeQuiz : fallback.includeQuiz,
    simplificationStrategy: typeof raw.simplificationStrategy === "string" && raw.simplificationStrategy.trim()
      ? raw.simplificationStrategy
      : fallback.simplificationStrategy,
    connectionToPrevious: typeof raw.connectionToPrevious === "string" && raw.connectionToPrevious.trim()
      ? raw.connectionToPrevious
      : fallback.connectionToPrevious,
    connectionToNext: typeof raw.connectionToNext === "string" && raw.connectionToNext.trim()
      ? raw.connectionToNext
      : fallback.connectionToNext,
    industryHook: typeof raw.industryHook === "string" && raw.industryHook.trim()
      ? raw.industryHook
      : fallback.industryHook,
  };
}

export async function planLessonPedagogy(
  skeleton: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview,
  outline: LessonOutlineContext
): Promise<LessonPedagogyPlan> {
  const heuristic = buildHeuristicPlan(skeleton, mod, interview, outline);

  if (SKIP_LESSON_PLANNING_LLM || !getOpenAi()) return heuristic;

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("planning"),
      messages: [
        { role: "system", content: PROFESSOR_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Plan pedagogy for ONE lesson BEFORE writing content. Return JSON LessonPedagogyPlan.
${LESSON_DESIGN_SECTIONS}

Lesson: "${skeleton.title}" (${skeleton.difficultyTier ?? "intermediate"})
Module: ${mod.title}
Prior lessons: ${outline.priorLessons.map((p) => p.lessonTitle).join(" → ") || "Course start"}
Next lesson: ${outline.nextLessons[0]?.lessonTitle ?? "Course end"}
Enabled components: ${interview.learningComponents.join(", ")}

JSON schema:
{
  "priorKnowledge": ["what students should already know"],
  "learningGoals": ["3-5 measurable goals"],
  "misconceptions": ["common student misconceptions"],
  "strugglePoints": ["where students typically struggle"],
  "simplificationStrategy": "how to explain clearly",
  "useVisuals": boolean, "useCode": boolean, "useMath": boolean, "useAnalogies": boolean, "useDiagrams": boolean,
  "includeLab": boolean, "includeQuiz": boolean,
  "connectionToPrevious": "how this builds on prior lesson",
  "connectionToNext": "bridge to next lesson",
  "industryHook": "real-world motivation",
  "sectionsToEmphasize": ["section ids from lesson structure"]
}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 1200,
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return heuristic;
    const parsed = JSON.parse(raw) as Partial<LessonPedagogyPlan>;
    // Normalize after merging: AI may return null/undefined/string for array fields.
    // normalizeLessonPedagogyPlan guarantees all arrays are valid string[] using
    // the heuristic as fallback, preventing crashes in downstream .join()/.slice().
    return normalizeLessonPedagogyPlan({ ...heuristic, ...parsed }, heuristic);
  } catch (err) {
    console.error("[Lesson Planning] OpenAI failed:", err);
    return heuristic;
  }
}

function buildHeuristicPlan(
  skeleton: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview,
  outline: LessonOutlineContext
): LessonPedagogyPlan {
  const tier = skeleton.difficultyTier ?? "intermediate";
  const subject = interview.courseInfo.subject;
  const prior = outline.priorLessons.map((p) => p.lessonTitle).join(", ");

  return {
    priorKnowledge: prior
      ? [`Concepts from: ${prior}`]
      : interview.courseInfo.prerequisites?.length
        ? interview.courseInfo.prerequisites
        : [`Basic literacy in ${subject}`],
    learningGoals: [
      `Explain ${skeleton.title} with professional clarity`,
      `Apply concepts from ${mod.title} in practice`,
      `Identify common pitfalls and correct approaches`,
    ],
    misconceptions: [
      "Assuming advanced patterns work without mastering foundations",
      "Confusing terminology across related subtopics",
    ],
    strugglePoints: [
      tier === "advanced" ? "Abstract trade-offs and optimization" : "Connecting theory to hands-on practice",
    ],
    simplificationStrategy: `Progress from intuition → formal definition → worked example → practice (${interview.teachingStyle[0] ?? "professional"} style).`,
    useVisuals: hasLessonStructure(interview, "visual-diagram") || hasLessonStructure(interview, "flowchart"),
    useCode: hasLearningComponent(interview, "Coding") || hasLessonStructure(interview, "code-example"),
    useMath: hasLessonStructure(interview, "mathematical-derivation") || interview.courseInfo.academicLevel === "graduate",
    useAnalogies: hasLessonStructure(interview, "real-world-analogy"),
    useDiagrams: hasLessonStructure(interview, "visual-diagram"),
    includeLab: hasLearningComponent(interview, "Coding"),
    includeQuiz: hasLearningComponent(interview, "Quiz") || hasLessonStructure(interview, "mini-quiz"),
    connectionToPrevious: prior
      ? `Extends ${outline.priorLessons[outline.priorLessons.length - 1]?.lessonTitle ?? "prior material"}`
      : "Opens the module with foundational framing",
    connectionToNext: outline.nextLessons[0]
      ? `Prepares for ${outline.nextLessons[0].lessonTitle}`
      : "Consolidates module learning before assessment",
    industryHook: `How ${skeleton.title} appears in ${interview.courseInfo.industry} workflows`,
    sectionsToEmphasize: interview.lessonStructure.slice(0, 8),
  };
}

/**
 * Guarantee a usable LessonBlueprintPlan even when an upstream agent returns undefined.
 * Prevents crashes like: Cannot read properties of undefined (reading 'learningGoals').
 */
export function ensureLessonBlueprintPlan(
  plan: Partial<LessonBlueprintPlan> | LessonPedagogyPlan | null | undefined,
  skeleton: ArchitectLessonBlueprint,
  interview: AICourseArchitectInterview
): LessonBlueprintPlan {
  const heuristic = buildHeuristicPlan(
    skeleton,
    { id: "module", title: skeleton.title, description: "", learningOutcomes: [], estimatedHours: 1, lessons: [skeleton] },
    interview,
    { globalIndex: 0, priorLessons: [], nextLessons: [] }
  );
  const candidateGoals =
    (plan as { learningGoals?: unknown } | null | undefined)?.learningGoals ??
    (plan as { learning_goals?: unknown } | null | undefined)?.learning_goals ??
    (plan as { goals?: unknown } | null | undefined)?.goals ??
    skeleton.objectives ??
    heuristic.learningGoals;

  const normalized = normalizeLessonPedagogyPlan(
    {
      ...(plan ?? {}),
      learningGoals: candidateGoals,
    } as Partial<LessonPedagogyPlan> & { learningGoals?: unknown },
    heuristic
  );

  const partial = (plan ?? {}) as Partial<LessonBlueprintPlan>;
  return {
    ...normalized,
    lessonObjective:
      (typeof partial.lessonObjective === "string" && partial.lessonObjective.trim())
        ? partial.lessonObjective
        : (normalized.learningGoals[0] ?? `Master concepts in ${skeleton.title}`),
    industryContext: partial.industryContext ?? normalized.industryHook,
    estimatedReadingMinutes: partial.estimatedReadingMinutes ?? skeleton.durationMinutes ?? 45,
    estimatedPracticeMinutes: partial.estimatedPracticeMinutes ?? (normalized.includeLab ? 30 : 15),
    estimatedVideoMinutes: partial.estimatedVideoMinutes ?? (skeleton.videos?.length ? 12 : 0),
    requiredDiagrams: partial.requiredDiagrams ?? (normalized.useDiagrams || normalized.useVisuals),
    requiredCode: partial.requiredCode ?? normalized.useCode,
    requiredTables: partial.requiredTables ?? (interview.lessonStructure ?? []).includes("comparison-table"),
    requiredVideo: partial.requiredVideo ?? (Boolean(skeleton.videos?.length) || interview.videoStrategy?.includeVideos === true),
    requiredQuiz: partial.requiredQuiz ?? normalized.includeQuiz,
    requiredLab: partial.requiredLab ?? normalized.includeLab,
    requiredReferences: partial.requiredReferences ?? (interview.lessonStructure ?? []).includes("references"),
    requiredAssignment: partial.requiredAssignment ?? hasLearningComponent(interview, "Assignments"),
    requiredInterviewPrep: partial.requiredInterviewPrep ?? hasLearningComponent(interview, "Interview Questions"),
    conceptOrder: Array.isArray(partial.conceptOrder) && partial.conceptOrder.length
      ? partial.conceptOrder.map(String)
      : normalized.sectionsToEmphasize,
    microLearningFlow: Array.isArray(partial.microLearningFlow) && partial.microLearningFlow.length
      ? partial.microLearningFlow.map(String)
      : [
          "Hook and motivation",
          "Core concept",
          "Worked example",
          "Guided practice",
          "Knowledge checkpoint",
          "Summary and bridge",
        ],
    practiceIntervals: Array.isArray(partial.practiceIntervals) && partial.practiceIntervals.length
      ? partial.practiceIntervals.map(String)
      : ["After each major concept", "End of lesson recap"],
    revisionSpacing: typeof partial.revisionSpacing === "string" && partial.revisionSpacing.trim()
      ? partial.revisionSpacing
      : "Revisit prior module concepts in opening recap",
    difficultyCurve: typeof partial.difficultyCurve === "string" && partial.difficultyCurve.trim()
      ? partial.difficultyCurve
      : `Progress from ${skeleton.difficultyTier ?? "intermediate"} foundations to applied practice`,
    knowledgeCheckpoints: Array.isArray(partial.knowledgeCheckpoints) && partial.knowledgeCheckpoints.length
      ? partial.knowledgeCheckpoints.map(String)
      : normalized.learningGoals.slice(0, 4),
    bloomsLevels: Array.isArray(partial.bloomsLevels) && partial.bloomsLevels.length
      ? partial.bloomsLevels.map(String)
      : ["Understand", "Apply", "Analyze"],
    motivation: partial.motivation,
    reflectionPrompts: partial.reflectionPrompts,
    learningStrategy: partial.learningStrategy,
    cognitiveLoadNotes: partial.cognitiveLoadNotes,
    suggestedPractice: partial.suggestedPractice,
    adaptiveProfile: partial.adaptiveProfile,
    retrievalContext: partial.retrievalContext,
  };
}

export function formatPedagogyForPrompt(plan: LessonPedagogyPlan | LessonBlueprintPlan | null | undefined): string {
  const safeJoin = (arr: unknown, sep = "; "): string =>
    Array.isArray(arr) ? arr.join(sep) : String(arr ?? "");

  if (!plan) {
    return "PEDAGOGY PLAN: (unavailable — use lesson title and objectives)";
  }

  const base = `
PEDAGOGY PLAN (follow this reasoning):
Prior knowledge: ${safeJoin(plan.priorKnowledge)}
Learning goals: ${safeJoin(plan.learningGoals)}
Misconceptions to address: ${safeJoin(plan.misconceptions)}
Struggle points: ${safeJoin(plan.strugglePoints)}
Simplification: ${plan.simplificationStrategy}
Industry hook: ${plan.industryHook}
Build on previous: ${plan.connectionToPrevious}
Bridge to next: ${plan.connectionToNext}
Use visuals: ${plan.useVisuals} | code: ${plan.useCode} | math: ${plan.useMath} | analogies: ${plan.useAnalogies}
Include lab: ${plan.includeLab} | quiz: ${plan.includeQuiz}
Emphasize sections: ${safeJoin(plan.sectionsToEmphasize, ", ")}
`.trim();

  if ("microLearningFlow" in plan && plan.microLearningFlow?.length) {
    return `${base}\n\n${formatMasterPedagogyForPrompt(plan as LessonBlueprintPlan)}`;
  }
  return base;
}
