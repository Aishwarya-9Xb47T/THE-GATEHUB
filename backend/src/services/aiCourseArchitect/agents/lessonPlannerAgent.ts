/**
 * V4 Agent 4 — Lesson Planner AI
 */
import { hasLearningComponent } from "../types.js";
import type { ArchitectQualityReport } from "../types.js";
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import { buildLessonOutlineContext, planLessonPedagogy } from "../lessonPlanningEngine.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { runAgent } from "../orchestrator/agentRunner.js";

function toLessonBlueprintPlan(
  pedagogy: Awaited<ReturnType<typeof planLessonPedagogy>>,
  ctx: LessonPipelineContext
): LessonBlueprintPlan {
  const { skeleton, interview } = ctx;
  return {
    ...pedagogy,
    lessonObjective: (pedagogy.learningGoals as string[] | undefined)?.[0] ?? `Master concepts in ${skeleton.title}`,
    industryContext: pedagogy.industryHook,
    estimatedReadingMinutes: skeleton.durationMinutes ?? 45,
    estimatedPracticeMinutes: pedagogy.includeLab ? 30 : 15,
    estimatedVideoMinutes: skeleton.videos?.length ? 12 : 0,
    requiredDiagrams: pedagogy.useDiagrams || pedagogy.useVisuals,
    requiredCode: pedagogy.useCode,
    requiredTables: (interview.lessonStructure ?? []).includes("comparison-table"),
    requiredVideo: Boolean(skeleton.videos?.length) || interview.videoStrategy?.includeVideos === true,
    requiredQuiz: pedagogy.includeQuiz,
    requiredLab: pedagogy.includeLab,
    requiredReferences: (interview.lessonStructure ?? []).includes("references"),
    requiredAssignment: hasLearningComponent(interview, "Assignments"),
    requiredInterviewPrep: hasLearningComponent(interview, "Interview Questions"),
    conceptOrder: pedagogy.sectionsToEmphasize,
    microLearningFlow: [
      "Hook and motivation",
      "Core concept",
      "Worked example",
      "Guided practice",
      "Knowledge checkpoint",
      "Summary and bridge",
    ],
    practiceIntervals: ["After each major concept", "End of lesson recap"],
    revisionSpacing: "Revisit prior module concepts in opening recap",
    difficultyCurve: `Progress from ${skeleton.difficultyTier ?? "intermediate"} foundations to applied practice`,
    knowledgeCheckpoints: (pedagogy.learningGoals as string[] | undefined)?.slice(0, 4) ?? [],
    bloomsLevels: ["Understand", "Apply", "Analyze"],
    adaptiveProfile: ctx.adaptiveProfile,
    retrievalContext: ctx.retrievalBundle,
  };
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
  return toLessonBlueprintPlan(pedagogy, ctx);
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
