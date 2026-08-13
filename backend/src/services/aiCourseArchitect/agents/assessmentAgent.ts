/**
 * V4 Agent 6 — Assessment (Quiz) AI
 */
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import type { ArchitectLessonBlueprint, ArchitectQuizQuestion, ArchitectQualityReport } from "../types.js";
import { generateLessonQuiz } from "./quizGenerator.js";
import { buildLessonOutlineContext } from "../lessonPlanningEngine.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { isSubstantiveText, scanForPlaceholders } from "../pipeline/placeholderGuards.js";

function validateQuiz(questions: ArchitectQuizQuestion[]): ArchitectQualityReport {
  const higherOrder = new Set(["Apply", "Analyze", "Evaluate", "Create"]);
  const rememberCount = questions.filter((q) => q.bloomLevel === "Remember").length;
  const higherOrderCount = questions.filter((q) => higherOrder.has(q.bloomLevel)).length;
  const scenarioCount = questions.filter((q) => q.type === "scenario").length;
  const substantiveScenarios = questions.filter(
    (q) => q.type === "scenario" && isSubstantiveText((q as { scenario?: string }).scenario ?? q.text, 40)
  ).length;
  const recallRatio = questions.length ? rememberCount / questions.length : 1;
  const higherOrderRatio = questions.length ? higherOrderCount / questions.length : 0;

  const checks = [
    {
      id: "count",
      label: "Question count",
      status: questions.length >= 10 ? ("pass" as const) : questions.length >= 8 ? ("warn" as const) : ("fail" as const),
      detail: `${questions.length}/10`,
    },
    {
      id: "quality",
      label: "Question quality",
      status: questions.every(
        (q) =>
          isSubstantiveText(q.text, 6) &&
          scanForPlaceholders(q.text).length === 0 &&
          (q.type === "mcq" ? q.options.length === 4 : true) &&
          q.explanation.length >= 20
      )
        ? ("pass" as const)
        : ("fail" as const),
      detail: "No placeholders, full explanations",
    },
    {
      id: "bloom-higher-order",
      label: "Higher-order Bloom coverage",
      status: higherOrderRatio >= 0.45 ? ("pass" as const) : ("fail" as const),
      detail: `${Math.round(higherOrderRatio * 100)}% Apply+`,
    },
    {
      id: "recall-cap",
      label: "Recall question cap",
      status: recallRatio <= 0.2 ? ("pass" as const) : ("fail" as const),
      detail: `${Math.round(recallRatio * 100)}% Remember`,
    },
    {
      id: "scenario-depth",
      label: "Scenario-based reasoning",
      status: scenarioCount >= 3 && substantiveScenarios >= 3 ? ("pass" as const) : ("fail" as const),
      detail: `${substantiveScenarios} substantive scenarios`,
    },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return {
    score: Math.max(0, 100 - fail * 35 - (questions.length < 10 ? 10 : 0)),
    passed: fail === 0 && questions.length >= 8,
    checks,
    suggestions: fail || questions.length < 10 ? ["Generate application-focused questions with Analyze/Apply bloom levels and substantive scenarios"] : [],
  };
}

export async function runAssessmentAgent(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  lesson: ArchitectLessonBlueprint
) {
  const outline = buildLessonOutlineContext(ctx.blueprint, ctx.modIndex, ctx.lessonIndex);
  return runAgent({
    stage: "assessment",
    input: { ctx, plan, lesson, outline },
    execute: async ({ ctx: c, plan: p, lesson: l, outline: o }) =>
      generateLessonQuiz(c.skeleton, c.mod, c.interview, p, o, l),
    validate: validateQuiz,
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 85,
  });
}
