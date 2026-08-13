/**
 * V6 Part 4 — Master Pedagogy Engine (24-step instructional framework).
 */
import type { LessonBlueprintPlan } from "../orchestrator/contracts.js";
import type { AICourseArchitectInterview, ArchitectLessonBlueprint } from "../types.js";
import { isSubstantiveText } from "../pipeline/placeholderGuards.js";

export const MASTER_PEDAGOGY_STEPS = [
  "attention",
  "motivation",
  "learning-objectives",
  "prerequisite-review",
  "concept-introduction",
  "real-world-problem",
  "theory",
  "visualization",
  "examples",
  "worked-example",
  "interactive-exercise",
  "try-it-yourself",
  "common-mistakes",
  "best-practices",
  "knowledge-check",
  "quiz",
  "assignment",
  "mini-project",
  "summary",
  "revision-notes",
  "reflection",
  "next-lesson-preview",
] as const;

export type PedagogyStepId = (typeof MASTER_PEDAGOGY_STEPS)[number];

export interface PedagogyStepMapping {
  step: PedagogyStepId;
  label: string;
  lessonField?: keyof ArchitectLessonBlueprint;
  required: boolean;
}

export const PEDAGOGY_STEP_MAP: PedagogyStepMapping[] = [
  { step: "attention", label: "Attention", lessonField: "introduction", required: true },
  { step: "motivation", label: "Motivation", required: true },
  { step: "learning-objectives", label: "Learning Objectives", lessonField: "objectives", required: true },
  { step: "prerequisite-review", label: "Prerequisite Review", required: false },
  { step: "concept-introduction", label: "Concept Introduction", lessonField: "conceptExplanation", required: true },
  { step: "real-world-problem", label: "Real-world Problem", lessonField: "caseStudy", required: false },
  { step: "theory", label: "Theory", lessonField: "theory", required: true },
  { step: "visualization", label: "Visualization", lessonField: "visualDiagram", required: false },
  { step: "examples", label: "Examples", lessonField: "examples", required: true },
  { step: "worked-example", label: "Worked Example", lessonField: "executionSteps", required: false },
  { step: "interactive-exercise", label: "Interactive Exercise", lessonField: "practice", required: false },
  { step: "try-it-yourself", label: "Try It Yourself", lessonField: "codingLab", required: false },
  { step: "common-mistakes", label: "Common Mistakes", lessonField: "commonMistakes", required: true },
  { step: "best-practices", label: "Best Practices", lessonField: "bestPractices", required: true },
  { step: "knowledge-check", label: "Knowledge Check", required: false },
  { step: "quiz", label: "Quiz", lessonField: "quizQuestions", required: false },
  { step: "assignment", label: "Assignment", lessonField: "assignment", required: false },
  { step: "mini-project", label: "Mini Project", lessonField: "miniProject", required: false },
  { step: "summary", label: "Summary", lessonField: "summary", required: true },
  { step: "revision-notes", label: "Revision Notes", lessonField: "revisionNotes", required: false },
  { step: "reflection", label: "Reflection", lessonField: "discussionPrompt", required: false },
  { step: "next-lesson-preview", label: "Next Lesson Preview", required: false },
];

export function applyMasterPedagogyToPlan(
  plan: LessonBlueprintPlan,
  interview: AICourseArchitectInterview
): LessonBlueprintPlan {
  const flow = PEDAGOGY_STEP_MAP.map((s) => s.label);
  const requiredSteps = PEDAGOGY_STEP_MAP.filter((s) => s.required).map((s) => s.step);

  return {
    ...plan,
    microLearningFlow: flow,
    knowledgeCheckpoints: plan.knowledgeCheckpoints.length
      ? plan.knowledgeCheckpoints
      : ["After concept introduction", "After worked example", "Before summary"],
    motivation: plan.motivation ?? `Why ${plan.lessonObjective} matters in ${interview.courseInfo.industry}`,
    reflectionPrompts: plan.reflectionPrompts?.length
      ? plan.reflectionPrompts
      : [
          "What was the most surprising concept in this lesson?",
          "How would you explain this to a colleague?",
        ],
    learningStrategy:
      plan.learningStrategy ??
      `Follow master pedagogy: ${flow.slice(0, 6).join(" → ")} → ... → ${flow[flow.length - 1]}`,
    suggestedPractice: plan.suggestedPractice?.length
      ? plan.suggestedPractice
      : requiredSteps.includes("try-it-yourself") && plan.requiredLab
        ? ["Guided lab", "Independent practice"]
        : ["Worked example review", "Knowledge check"],
  };
}

export function validatePedagogyCompliance(
  lesson: ArchitectLessonBlueprint,
  plan: LessonBlueprintPlan
): { passed: boolean; score: number; missing: string[] } {
  const missing: string[] = [];

  for (const step of PEDAGOGY_STEP_MAP) {
    if (!step.required) continue;
    if (step.lessonField) {
      const val = lesson[step.lessonField];
      if (Array.isArray(val) && val.length === 0) missing.push(step.label);
      else if (typeof val === "string" && !isSubstantiveText(val, 30)) missing.push(step.label);
    } else if (step.step === "motivation" && !plan.motivation) {
      missing.push(step.label);
    }
  }

  if ((lesson.objectives?.length ?? 0) < 2) missing.push("Learning Objectives");
  const score = Math.max(0, 100 - missing.length * 8);
  return { passed: missing.length <= 2, score, missing };
}

export function formatMasterPedagogyForPrompt(plan: LessonBlueprintPlan): string {
  return `
MASTER PEDAGOGY FLOW (follow this exact educational sequence):
${plan.microLearningFlow.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Motivation: ${plan.motivation ?? "Connect to learner goals"}
Reflection prompts: ${(plan.reflectionPrompts ?? []).join("; ")}
Learning strategy: ${plan.learningStrategy ?? "Scaffolded progression"}
Cognitive load: ${plan.cognitiveLoadNotes ?? "Balance theory with practice"}
`.trim();
}
