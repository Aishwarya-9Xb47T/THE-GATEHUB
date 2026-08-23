/**
 * Agent 2 — Instructional Designer
 * Designs pedagogy: concept order, micro-learning flow, checkpoints, difficulty curve.
 * Outputs the shared Lesson Blueprint plan — no lesson body content.
 */
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import type { ArchitectQualityReport } from "../types.js";
import { buildLessonOutlineContext, planLessonPedagogy, ensureLessonBlueprintPlan } from "../lessonPlanningEngine.js";
import { hasLearningComponent } from "../types.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext } from "../instructorPersona.js";
import { architectCompletionJSON } from "../architectLLM.js";
import { getAgentSpec } from "../agentSpecifications.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { enrichLessonPlanPart4 } from "../engines/part4Orchestrator.js";
import { runAgent } from "../orchestrator/agentRunner.js";

function toLessonBlueprintPlan(
  pedagogy: Awaited<ReturnType<typeof planLessonPedagogy>> | null | undefined,
  design: Partial<LessonBlueprintPlan>,
  ctx: LessonPipelineContext
): LessonBlueprintPlan {
  const base = ensureLessonBlueprintPlan(pedagogy, ctx.skeleton, ctx.interview);
  return {
    ...base,
    ...design,
    lessonObjective:
      (typeof design.lessonObjective === "string" && design.lessonObjective.trim())
        ? design.lessonObjective
        : base.lessonObjective,
    conceptOrder: Array.isArray(design.conceptOrder) && design.conceptOrder.length
      ? design.conceptOrder
      : base.conceptOrder,
    microLearningFlow: Array.isArray(design.microLearningFlow) && design.microLearningFlow.length
      ? design.microLearningFlow
      : base.microLearningFlow,
    practiceIntervals: Array.isArray(design.practiceIntervals) && design.practiceIntervals.length
      ? design.practiceIntervals
      : base.practiceIntervals,
    revisionSpacing:
      typeof design.revisionSpacing === "string" && design.revisionSpacing.trim()
        ? design.revisionSpacing
        : base.revisionSpacing,
    difficultyCurve:
      typeof design.difficultyCurve === "string" && design.difficultyCurve.trim()
        ? design.difficultyCurve
        : base.difficultyCurve,
    knowledgeCheckpoints: Array.isArray(design.knowledgeCheckpoints) && design.knowledgeCheckpoints.length
      ? design.knowledgeCheckpoints
      : base.knowledgeCheckpoints,
    bloomsLevels: Array.isArray(design.bloomsLevels) && design.bloomsLevels.length
      ? design.bloomsLevels
      : base.bloomsLevels,
    motivation: design.motivation ?? base.motivation,
    reflectionPrompts: design.reflectionPrompts ?? base.reflectionPrompts,
    learningStrategy: design.learningStrategy ?? base.learningStrategy,
    cognitiveLoadNotes: design.cognitiveLoadNotes ?? base.cognitiveLoadNotes,
    suggestedPractice: design.suggestedPractice ?? base.suggestedPractice,
    adaptiveProfile: ctx.adaptiveProfile ?? base.adaptiveProfile,
    retrievalContext: ctx.retrievalBundle ?? base.retrievalContext,
    // Preserve required* flags from pedagogy when design omits them
    requiredDiagrams: design.requiredDiagrams ?? base.requiredDiagrams,
    requiredCode: design.requiredCode ?? base.requiredCode,
    requiredTables: design.requiredTables ?? base.requiredTables,
    requiredVideo: design.requiredVideo ?? base.requiredVideo,
    requiredQuiz: design.requiredQuiz ?? base.requiredQuiz,
    requiredLab: design.requiredLab ?? base.requiredLab,
    requiredReferences: design.requiredReferences ?? base.requiredReferences,
    requiredAssignment: design.requiredAssignment ?? hasLearningComponent(ctx.interview, "Assignments"),
    requiredInterviewPrep: design.requiredInterviewPrep ?? hasLearningComponent(ctx.interview, "Interview Questions"),
  };
}

async function enrichInstructionalDesign(
  plan: LessonBlueprintPlan,
  ctx: LessonPipelineContext
): Promise<Partial<LessonBlueprintPlan>> {
  const outline = buildLessonOutlineContext(ctx.blueprint, ctx.modIndex, ctx.lessonIndex);
  const prompt = `You are a senior instructional designer (MIT/Stanford caliber).
${getAgentSpec("instructional-designer")}

Lesson: "${ctx.skeleton.title}" in module "${ctx.mod.title}"
${buildInterviewContext(ctx.interview)}

Prior: ${outline.priorLessons.map((p) => p.lessonTitle).join(" → ") || "Course start"}
Next: ${outline.nextLessons[0]?.lessonTitle ?? "Course end"}

Return JSON:
{
  "conceptOrder": ["concept 1"],
  "microLearningFlow": ["step 1"],
  "practiceIntervals": ["when to practice"],
  "revisionSpacing": "how to space revision",
  "difficultyCurve": "how difficulty ramps",
  "knowledgeCheckpoints": ["checkpoint questions"],
  "bloomsLevels": ["Understand", "Apply"],
  "motivation": "why this lesson matters",
  "reflectionPrompts": ["prompt 1"],
  "learningStrategy": "how to teach this lesson",
  "cognitiveLoadNotes": "how to balance load",
  "suggestedPractice": ["practice activity"]
}`;

  try {
    const parsed = await architectCompletionJSON<Partial<LessonBlueprintPlan>>({
      phase: "instructional-design",
      system: PROFESSOR_SYSTEM_PROMPT,
      user: prompt,
      maxTokens: 1500,
      temperature: 0.35,
    });
    return parsed ?? {};
  } catch {
    return {};
  }
}

function validateInstructionalDesign(plan: LessonBlueprintPlan): ArchitectQualityReport {
  const checks = [
    {
      id: "objective",
      label: "Lesson objective",
      status: (plan.lessonObjective?.length ?? 0) >= 10 ? ("pass" as const) : ("fail" as const),
      detail: plan.lessonObjective ?? "",
    },
    {
      id: "goals",
      label: "Learning goals",
      status: (plan.learningGoals?.length ?? 0) >= 2 ? ("pass" as const) : ("fail" as const),
      detail: `${plan.learningGoals?.length ?? 0} goals`,
    },
    {
      id: "flow",
      label: "Micro-learning flow",
      status: (plan.microLearningFlow?.length ?? 0) >= 4 ? ("pass" as const) : ("warn" as const),
      detail: `${plan.microLearningFlow?.length ?? 0} steps`,
    },
    {
      id: "checkpoints",
      label: "Knowledge checkpoints",
      status: (plan.knowledgeCheckpoints?.length ?? 0) >= 2 ? ("pass" as const) : ("warn" as const),
      detail: `${plan.knowledgeCheckpoints?.length ?? 0} checkpoints`,
    },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return { score: 100 - fail * 35, passed: fail === 0, checks, suggestions: [] };
}

async function executeInstructionalDesigner(ctx: LessonPipelineContext): Promise<LessonBlueprintPlan> {
  const base = ctx.baseLessonPlan;
  const outline = buildLessonOutlineContext(ctx.blueprint, ctx.modIndex, ctx.lessonIndex);
  const pedagogy = base
    ? base
    : await planLessonPedagogy(ctx.skeleton, ctx.mod, ctx.interview, outline);
  const design = await enrichInstructionalDesign(base ?? ({} as LessonBlueprintPlan), ctx);
  const plan = toLessonBlueprintPlan(pedagogy, design, ctx);
  return enrichLessonPlanPart4(
    {
      ...plan,
      adaptiveProfile: ctx.adaptiveProfile ?? plan.adaptiveProfile,
      retrievalContext: ctx.retrievalBundle ?? plan.retrievalContext,
    },
    ctx
  );
}

export async function runInstructionalDesignerAgent(ctx: LessonPipelineContext) {
  return runAgent({
    stage: "instructional-designer",
    input: ctx,
    execute: executeInstructionalDesigner,
    validate: validateInstructionalDesign,
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 80,
  });
}
