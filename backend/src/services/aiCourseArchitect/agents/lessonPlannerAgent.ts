/**
 * V4 Agent 4 — Lesson Planner AI
 */
import type { ArchitectQualityReport } from "../types.js";
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import { buildLessonOutlineContext, planLessonPedagogy, ensureLessonBlueprintPlan } from "../lessonPlanningEngine.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { runAgent } from "../orchestrator/agentRunner.js";

function toLessonBlueprintPlan(
  pedagogy: Awaited<ReturnType<typeof planLessonPedagogy>> | null | undefined,
  ctx: LessonPipelineContext
): LessonBlueprintPlan {
  return ensureLessonBlueprintPlan(pedagogy, ctx.skeleton, ctx.interview);
}

function validateLessonPlan(plan: LessonBlueprintPlan): ArchitectQualityReport {
  const checks = [
    { id: "objective", label: "Lesson objective", status: plan.lessonObjective.length >= 10 ? ("pass" as const) : ("fail" as const), detail: plan.lessonObjective },
    { id: "goals", label: "Learning goals", status: (plan.learningGoals?.length ?? 0) >= 2 ? ("pass" as const) : ("fail" as const), detail: `${plan.learningGoals?.length ?? 0} goals` },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return { score: 100 - fail * 40, passed: fail === 0, checks, suggestions: [] };
}

async function executeLessonPlanner(ctx: LessonPipelineContext, _attempt: number): Promise<LessonBlueprintPlan> {
  const outline = buildLessonOutlineContext(ctx.blueprint, ctx.modIndex, ctx.lessonIndex);
  const pedagogy = await planLessonPedagogy(ctx.skeleton, ctx.mod, ctx.interview, outline);
  return {
    ...toLessonBlueprintPlan(pedagogy, ctx),
    adaptiveProfile: ctx.adaptiveProfile,
    retrievalContext: ctx.retrievalBundle,
  };
}

export async function runLessonPlannerAgent(ctx: LessonPipelineContext) {
  return runAgent({
    stage: "lesson-planner",
    input: ctx,
    execute: executeLessonPlanner,
    validate: validateLessonPlan,
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 80,
  });
}
