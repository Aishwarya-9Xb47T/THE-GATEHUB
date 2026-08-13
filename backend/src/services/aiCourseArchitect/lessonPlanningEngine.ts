/**
 * V2 — Per-lesson pedagogy planning BEFORE content generation.
 * The AI reasons about prerequisites, misconceptions, and component selection first.
 */
import OpenAI from "openai";
import { getOpenAi } from "./openaiClient.js";
import type {
  AICourseArchitectInterview,
  ArchitectBlueprint,
  ArchitectLessonBlueprint,
  ArchitectModuleBlueprint,
  LessonPedagogyPlan,
} from "./types.js";
import type { LessonBlueprintPlan } from "./orchestrator/contracts.js";
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
    return { ...heuristic, ...parsed };
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
      : interview.courseInfo.prerequisites.length
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

export function formatPedagogyForPrompt(plan: LessonPedagogyPlan | LessonBlueprintPlan): string {
  const base = `
PEDAGOGY PLAN (follow this reasoning):
Prior knowledge: ${plan.priorKnowledge.join("; ")}
Learning goals: ${plan.learningGoals.join("; ")}
Misconceptions to address: ${plan.misconceptions.join("; ")}
Struggle points: ${plan.strugglePoints.join("; ")}
Simplification: ${plan.simplificationStrategy}
Industry hook: ${plan.industryHook}
Build on previous: ${plan.connectionToPrevious}
Bridge to next: ${plan.connectionToNext}
Use visuals: ${plan.useVisuals} | code: ${plan.useCode} | math: ${plan.useMath} | analogies: ${plan.useAnalogies}
Include lab: ${plan.includeLab} | quiz: ${plan.includeQuiz}
Emphasize sections: ${plan.sectionsToEmphasize.join(", ")}
`.trim();

  if ("microLearningFlow" in plan && plan.microLearningFlow?.length) {
    return `${base}\n\n${formatMasterPedagogyForPrompt(plan as LessonBlueprintPlan)}`;
  }
  return base;
}
