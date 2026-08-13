/**
 * Agent — Summary Content Generator
 * Generates structured SummaryBlock with sections instead of markdown.
 * Never generates markdown or authoring syntax - only structured JSON.
 */
import { getOpenAi } from "../openaiClient.js";
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import type { ArchitectLessonBlueprint, ArchitectQualityReport } from "../types.js";
import type { SummaryBlock } from "../schemas/lessonBlockSchemas.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext } from "../instructorPersona.js";
import { getArchitectModel } from "../architectModels.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { containsAuthoringSyntax } from "../schemas/lessonBlockSchemas.js";


async function generateSummary(
  lesson: ArchitectLessonBlueprint,
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan
): Promise<SummaryBlock> {
  if (!getOpenAi()) return buildHeuristicSummary(lesson.title, plan.conceptOrder);

  const prompt = `Generate structured summary content for lesson "${lesson.title}" (${ctx.interview.courseInfo.subject}).

${buildInterviewContext(ctx.interview)}
Concepts covered: ${plan.conceptOrder.join(", ")}

Return JSON:
{
  "type": "summary",
  "title": "Lesson Summary",
  "sections": [
    {
      "heading": "Key Takeaways",
      "content": "Point 1\nPoint 2\nPoint 3",
      "type": "bullet-list"
    },
    {
      "heading": "Core Concepts",
      "content": "Detailed recap...",
      "type": "paragraph"
    },
    {
      "heading": "Next Steps",
      "content": "Step 1\nStep 2",
      "type": "numbered-list"
    }
  ]
}

Requirements:
- Generate 3-5 concise sections summarizing the lesson
- Mix bullet-list, numbered-list, and paragraph content types
- Focus on key takeaways and actionable next steps
- Content must be concise and memorable
- No markdown formatting (no #, ##, **, etc.)
- No LaTeX commands
- No authoring syntax (\\theory, title=, etc.)
- Real educational summary for this specific lesson
- Content length: 200-400 words total`;

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("structure"),
      messages: [
        { role: "system", content: PROFESSOR_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 2000,
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return buildHeuristicSummary(lesson.title, plan.conceptOrder);
    
    const parsed = JSON.parse(raw) as SummaryBlock;
    
    // Validate no authoring syntax
    for (const section of parsed.sections) {
      if (containsAuthoringSyntax(section.content)) {
        console.warn("[SUMMARY AGENT] Authoring syntax detected, regenerating...");
        return buildHeuristicSummary(lesson.title, plan.conceptOrder);
      }
    }
    
    return parsed;
  } catch {
    return buildHeuristicSummary(lesson.title, plan.conceptOrder);
  }
}

function buildHeuristicSummary(title: string, concepts: string[]): SummaryBlock {
  return {
    type: "summary",
    title: "Lesson Summary",
    sections: [
      {
        heading: "Key Takeaways",
        content: concepts.map((c) => `- ${c} is essential for understanding ${title}`).join("\n"),
        type: "bullet-list",
      },
      {
        heading: "Core Concepts",
        content: `This lesson covered the fundamental aspects of ${title}. You learned how these concepts apply in real-world scenarios and why they matter for your learning journey.`,
        type: "paragraph",
      },
      {
        heading: "Next Steps",
        content: "Practice the concepts covered in this lesson\nApply them to real problems\nReview the key takeaways before moving on",
        type: "numbered-list",
      },
    ],
  };
}

function validateSummary(output: SummaryBlock): ArchitectQualityReport {
  const checks = [
    {
      id: "sections-count",
      label: "Sections Count",
      status: output.sections.length >= 2 ? ("pass" as const) : ("fail" as const),
      detail: `${output.sections.length} sections`,
    },
    {
      id: "no-authoring-syntax",
      label: "No Authoring Syntax",
      status: !output.sections.some((s) => containsAuthoringSyntax(s.content))
        ? ("pass" as const)
        : ("fail" as const),
      detail: "No markdown, LaTeX, or DSL detected",
    },
    {
      id: "conciseness",
      label: "Conciseness",
      status: JSON.stringify(output).length <= 2000 ? ("pass" as const) : ("warn" as const),
      detail: `${JSON.stringify(output).length} characters`,
    },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return {
    score: Math.max(0, 100 - fail * 40),
    passed: fail === 0,
    checks,
    suggestions: fail ? ["Generate valid structured summary without authoring syntax"] : [],
  };
}

export async function runSummaryAgent(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  lesson: ArchitectLessonBlueprint
) {
  return runAgent({
    stage: "summary",
    input: { ctx, plan, lesson },
    execute: async ({ ctx: c, plan: p, lesson: l }) => generateSummary(l, c, p),
    validate: validateSummary,
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 75,
  });
}

export function applySummaryToLesson(
  lesson: ArchitectLessonBlueprint,
  output: SummaryBlock
): ArchitectLessonBlueprint {
  return {
    ...lesson,
    // Store ONLY the structured block
    summaryBlock: output,
  };
}
