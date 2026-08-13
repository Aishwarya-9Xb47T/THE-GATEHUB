/**
 * Agent — Learning Objectives Generator
 * Generates structured LearningObjectivesBlock with Bloom's taxonomy alignment.
 * Never generates markdown or LaTeX - only structured JSON.
 */
import { getOpenAi } from "../openaiClient.js";
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import type { ArchitectLessonBlueprint, ArchitectQualityReport } from "../types.js";
import type { LearningObjectivesBlock } from "../schemas/lessonBlockSchemas.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext } from "../instructorPersona.js";
import { getArchitectModel } from "../architectModels.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { runAgent } from "../orchestrator/agentRunner.js";


const BLOOM_LEVELS = ["remember", "understand", "apply", "analyze", "evaluate", "create"] as const;

async function generateLearningObjectives(
  lesson: ArchitectLessonBlueprint,
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan
): Promise<LearningObjectivesBlock> {
  if (!getOpenAi()) return buildHeuristicObjectives(lesson.title, ctx.interview.courseInfo.subject);

  const prompt = `Generate structured learning objectives for lesson "${lesson.title}" (${ctx.interview.courseInfo.subject}).

${buildInterviewContext(ctx.interview)}
Concepts: ${plan.conceptOrder.join(", ")}

Return JSON:
{
  "type": "learning-objectives",
  "title": "Learning Objectives",
  "objectives": [
    {
      "id": "obj-1",
      "text": "Students will be able to...",
      "bloomLevel": "remember|understand|apply|analyze|evaluate|create",
      "measurable": true
    }
  ]
}

Requirements:
- Generate 4-6 specific, measurable objectives
- Use Bloom's taxonomy verbs appropriate for the difficulty level
- Each objective must be measurable (avoid "understand", "know" - use "explain", "identify", "apply")
- Align objectives with the lesson concepts
- No markdown, no LaTeX, no placeholders
- Real educational objectives for this specific lesson`;

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("structure"),
      messages: [
        { role: "system", content: PROFESSOR_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 1500,
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return buildHeuristicObjectives(lesson.title, ctx.interview.courseInfo.subject);
    return JSON.parse(raw) as LearningObjectivesBlock;
  } catch {
    return buildHeuristicObjectives(lesson.title, ctx.interview.courseInfo.subject);
  }
}

function buildHeuristicObjectives(title: string, subject: string): LearningObjectivesBlock {
  return {
    type: "learning-objectives",
    title: "Learning Objectives",
    objectives: [
      {
        id: "obj-1",
        text: `Define the core concepts of ${title}`,
        bloomLevel: "remember",
        measurable: true,
      },
      {
        id: "obj-2",
        text: `Explain how ${title} applies in ${subject}`,
        bloomLevel: "understand",
        measurable: true,
      },
      {
        id: "obj-3",
        text: `Apply ${title} principles to solve problems`,
        bloomLevel: "apply",
        measurable: true,
      },
      {
        id: "obj-4",
        text: `Analyze different approaches to ${title}`,
        bloomLevel: "analyze",
        measurable: true,
      },
    ],
  };
}

function validateObjectives(output: LearningObjectivesBlock): ArchitectQualityReport {
  const checks = [
    {
      id: "objectives-count",
      label: "Objectives Count",
      status: output.objectives.length >= 3 ? ("pass" as const) : ("fail" as const),
      detail: `${output.objectives.length} objectives`,
    },
    {
      id: "measurable",
      label: "Measurable Objectives",
      status: output.objectives.every((o) => o.measurable) ? ("pass" as const) : ("warn" as const),
      detail: `${output.objectives.filter((o) => o.measurable).length}/${output.objectives.length} measurable`,
    },
    {
      id: "bloom-alignment",
      label: "Bloom's Taxonomy",
      status: output.objectives.every((o) => BLOOM_LEVELS.includes(o.bloomLevel as any))
        ? ("pass" as const)
        : ("fail" as const),
      detail: "All objectives aligned to Bloom's levels",
    },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return {
    score: Math.max(0, 100 - fail * 30),
    passed: fail === 0,
    checks,
    suggestions: fail ? ["Generate valid measurable learning objectives"] : [],
  };
}

export async function runObjectivesAgent(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  lesson: ArchitectLessonBlueprint
) {
  return runAgent({
    stage: "objectives",
    input: { ctx, plan, lesson },
    execute: async ({ ctx: c, plan: p, lesson: l }) => generateLearningObjectives(l, c, p),
    validate: validateObjectives,
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 80,
  });
}

export function applyObjectivesToLesson(
  lesson: ArchitectLessonBlueprint,
  output: LearningObjectivesBlock
): ArchitectLessonBlueprint {
  return {
    ...lesson,
    // Store ONLY the structured block
    objectivesBlock: output,
  };
}
