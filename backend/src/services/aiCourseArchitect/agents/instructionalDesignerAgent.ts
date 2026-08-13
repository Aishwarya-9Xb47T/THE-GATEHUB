/**
 * Agent 2 — Instructional Designer
 * Designs pedagogy: concept order, micro-learning flow, checkpoints, difficulty curve.
 * Outputs the shared Lesson Blueprint plan — no lesson body content.
 */
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import type { ArchitectQualityReport } from "../types.js";
import { buildLessonOutlineContext, planLessonPedagogy } from "../lessonPlanningEngine.js";
import { hasLearningComponent } from "../types.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext } from "../instructorPersona.js";
import { architectCompletionJSON } from "../architectLLM.js";
import { getAgentSpec } from "../agentSpecifications.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { enrichLessonPlanPart4 } from "../engines/part4Orchestrator.js";
import { runAgent } from "../orchestrator/agentRunner.js";

function toLessonBlueprintPlan(
  pedagogy: Awaited<ReturnType<typeof planLessonPedagogy>>,
  design: Partial<LessonBlueprintPlan>,
  ctx: LessonPipelineContext
): LessonBlueprintPlan {
  const { skeleton, interview } = ctx;
  return {
    ...pedagogy,
    lessonObjective: pedagogy.learningGoals[0] ?? `Master concepts in ${skeleton.title}`,
    industryContext: pedagogy.industryHook,
    estimatedReadingMinutes: skeleton.durationMinutes ?? 45,
    estimatedPracticeMinutes: pedagogy.includeLab ? 30 : 15,
    estimatedVideoMinutes: skeleton.videos?.length ? 12 : 0,
    requiredDiagrams: pedagogy.useDiagrams || pedagogy.useVisuals,
    requiredCode: pedagogy.useCode,
    requiredTables: interview.lessonStructure.includes("comparison-table"),
    requiredVideo: Boolean(skeleton.videos?.length) || interview.videoStrategy.includeVideos === true,
    requiredQuiz: pedagogy.includeQuiz,
    requiredLab: pedagogy.includeLab,
    requiredReferences: interview.lessonStructure.includes("references"),
    requiredAssignment: hasLearningComponent(interview, "Assignments"),
    requiredInterviewPrep: hasLearningComponent(interview, "Interview Questions"),
    conceptOrder: design.conceptOrder ?? pedagogy.sectionsToEmphasize,
    microLearningFlow: design.microLearningFlow ?? [
      "Hook and motivation",
      "Core concept",
      "Worked example",
      "Guided practice",
      "Knowledge checkpoint",
      "Summary and bridge",
    ],
    practiceIntervals: design.practiceIntervals ?? ["After each major concept", "End of lesson recap"],
    revisionSpacing: design.revisionSpacing ?? "Revisit prior module concepts in opening recap",
    difficultyCurve: design.difficultyCurve ?? `Progress from ${skeleton.difficultyTier ?? "intermediate"} foundations to applied practice`,
    knowledgeCheckpoints: design.knowledgeCheckpoints ?? pedagogy.learningGoals.slice(0, 4),
    bloomsLevels: design.bloomsLevels ?? ["Understand", "Apply", "Analyze"],
    motivation: design.motivation,
    reflectionPrompts: design.reflectionPrompts,
    learningStrategy: design.learningStrategy,
    cognitiveLoadNotes: design.cognitiveLoadNotes,
    suggestedPractice: design.suggestedPractice,
    adaptiveProfile: ctx.adaptiveProfile,
    retrievalContext: ctx.retrievalBundle,
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
      status: plan.lessonObjective.length >= 10 ? ("pass" as const) : ("fail" as const),
      detail: plan.lessonObjective,
    },
    {
      id: "goals",
      label: "Learning goals",
      status: plan.learningGoals.length >= 2 ? ("pass" as const) : ("fail" as const),
      detail: `${plan.learningGoals.length} goals`,
    },
    {
      id: "flow",
      label: "Micro-learning flow",
      status: plan.microLearningFlow.length >= 4 ? ("pass" as const) : ("warn" as const),
      detail: `${plan.microLearningFlow.length} steps`,
    },
    {
      id: "checkpoints",
      label: "Knowledge checkpoints",
      status: plan.knowledgeCheckpoints.length >= 2 ? ("pass" as const) : ("warn" as const),
      detail: `${plan.knowledgeCheckpoints.length} checkpoints`,
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
