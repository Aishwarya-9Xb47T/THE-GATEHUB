/**
 * Agent 13 — Visual Content Agent
 * Determines where visuals improve learning (illustrations, tables, concept maps).
 */
import { getOpenAi } from "../openaiClient.js";
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import type { ArchitectLessonBlueprint, ArchitectQualityReport } from "../types.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext, buildMediaRecommendationGuidance } from "../instructorPersona.js";
import { getArchitectModel } from "../architectModels.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { isSubstantiveText } from "../pipeline/placeholderGuards.js";


export type VisualContentOutput = NonNullable<ArchitectLessonBlueprint["visualContent"]>;

async function generateVisualContent(
  lesson: ArchitectLessonBlueprint,
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan
): Promise<VisualContentOutput> {
  if (!getOpenAi()) return buildHeuristicVisuals(lesson.title);

  const prompt = `Suggest visual learning aids for lesson "${lesson.title}".

${buildInterviewContext(ctx.interview)}
Emphasize: ${plan.sectionsToEmphasize.join(", ")}
${buildMediaRecommendationGuidance(lesson.title, ctx.interview.courseInfo.industry)}

Return JSON array "visuals":
[{
  "type": "illustration|infographic|comparison-table|concept-map",
  "title": "...",
  "description": "what to depict",
  "placement": "where in lesson",
  "suggestedContent": "table rows or map nodes"
}]`;

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("visual"),
      messages: [
        { role: "system", content: PROFESSOR_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.35,
      max_tokens: 1800,
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return buildHeuristicVisuals(lesson.title);
    const parsed = JSON.parse(raw) as { visuals?: VisualContentOutput };
    return parsed.visuals ?? (parsed as unknown as VisualContentOutput);
  } catch {
    return buildHeuristicVisuals(lesson.title);
  }
}

function buildHeuristicVisuals(title: string): VisualContentOutput {
  return [
    {
      type: "concept-map",
      title: `${title} Concept Map`,
      description: `Central node "${title}" with related prerequisites and outcomes.`,
      placement: "After theory section",
    },
    {
      type: "comparison-table",
      title: "Approaches Compared",
      description: "Compare common approaches, trade-offs, and when to use each.",
      placement: "Before examples",
      suggestedContent: "| Approach | Pros | Cons | Use When |",
    },
  ];
}

function validateVisuals(visuals: VisualContentOutput): ArchitectQualityReport {
  const types = new Set(visuals.map((v) => v.type));
  const placementOk = visuals.every((v) => isSubstantiveText(v.placement ?? "", 8));
  const checks = [
    {
      id: "count",
      label: "Visual suggestions",
      status: visuals.length >= 2 ? ("pass" as const) : ("warn" as const),
      detail: `${visuals.length} items`,
    },
    {
      id: "quality",
      label: "Descriptions",
      status: visuals.every((v) => isSubstantiveText(v.description, 15)) ? ("pass" as const) : ("fail" as const),
      detail: "",
    },
    {
      id: "media-variety",
      label: "Media type variety",
      status: types.size >= 2 ? ("pass" as const) : ("warn" as const),
      detail: `${types.size} visual types`,
    },
    {
      id: "placement",
      label: "Lesson placement rationale",
      status: placementOk ? ("pass" as const) : ("fail" as const),
      detail: placementOk ? "All placements specified" : "Missing placement",
    },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return {
    score: Math.max(0, 100 - fail * 35),
    passed: fail === 0,
    checks,
    suggestions: [],
  };
}

export async function runVisualContentAgent(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  lesson: ArchitectLessonBlueprint
) {
  return runAgent({
    stage: "visual-content",
    input: { ctx, plan, lesson },
    execute: async ({ ctx: c, plan: p, lesson: l }) => generateVisualContent(l, c, p),
    validate: validateVisuals,
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 75,
  });
}
