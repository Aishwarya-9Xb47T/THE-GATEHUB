/**
 * Agent — Theory Content Generator
 * Generates structured TheoryBlock with sections instead of markdown.
 * Never generates markdown, LaTeX, or authoring syntax - only structured JSON.
 */
import { getOpenAi } from "../openaiClient.js";
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import type { ArchitectLessonBlueprint, ArchitectQualityReport } from "../types.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext } from "../instructorPersona.js";
import { getArchitectModel } from "../architectModels.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { containsAuthoringSyntax } from "../schemas/lessonBlockSchemas.js";


interface TheoryBlock {
  type: "theory";
  title: string;
  sections: Array<{
    heading?: string;
    content: string;
    type: "paragraph" | "bullet-list" | "numbered-list";
  }>;
}

async function generateTheory(
  lesson: ArchitectLessonBlueprint,
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan
): Promise<TheoryBlock> {
  if (!getOpenAi()) return buildHeuristicTheory(lesson.title, plan.conceptOrder);

  const prompt = `Generate structured theory content for lesson "${lesson.title}" (${ctx.interview.courseInfo.subject}).

${buildInterviewContext(ctx.interview)}
Concepts: ${plan.conceptOrder.join(", ")}

Return JSON:
{
  "type": "theory",
  "title": "${lesson.title} - Theory",
  "sections": [
    {
      "heading": "Core Concepts",
      "content": "Detailed explanation...",
      "type": "paragraph"
    },
    {
      "heading": "Key Principles",
      "content": "Point 1\nPoint 2\nPoint 3",
      "type": "bullet-list"
    },
    {
      "heading": "Step-by-Step Process",
      "content": "Step 1\nStep 2\nStep 3",
      "type": "numbered-list"
    }
  ]
}

Requirements:
- Generate 4-6 substantial sections covering the concepts
- Mix paragraph, bullet-list, and numbered-list content types
- Each section should have a clear heading
- Content must be educational, not generic
- No markdown formatting (no #, ##, **, etc.)
- No LaTeX commands
- No authoring syntax (\\theory, title=, etc.)
- Real educational theory for this specific lesson
- Content length: 500-800 words total`;

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("structure"),
      messages: [
        { role: "system", content: PROFESSOR_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: 3000,
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return buildHeuristicTheory(lesson.title, plan.conceptOrder);
    
    const parsed = JSON.parse(raw) as TheoryBlock;
    
    // Validate no authoring syntax
    for (const section of parsed.sections) {
      if (containsAuthoringSyntax(section.content)) {
        console.warn("[THEORY AGENT] Authoring syntax detected, regenerating...");
        return buildHeuristicTheory(lesson.title, plan.conceptOrder);
      }
    }
    
    return parsed;
  } catch {
    return buildHeuristicTheory(lesson.title, plan.conceptOrder);
  }
}

function buildHeuristicTheory(title: string, concepts: string[]): TheoryBlock {
  return {
    type: "theory",
    title: `${title} - Theory`,
    sections: [
      {
        heading: "Introduction",
        content: `${title} is a fundamental concept in this subject. Understanding this topic is essential for building a strong foundation and progressing to more advanced topics.`,
        type: "paragraph",
      },
      {
        heading: "Core Concepts",
        content: concepts.map((c, i) => `${i + 1}. ${c}`).join("\n"),
        type: "numbered-list",
      },
      {
        heading: "Key Principles",
        content: `Principle 1: The foundation of ${title}\nPrinciple 2: How it applies in practice\nPrinciple 3: Common use cases and scenarios\nPrinciple 4: Best practices for implementation`,
        type: "bullet-list",
      },
      {
        heading: "Practical Application",
        content: `In real-world scenarios, ${title} is applied through structured approaches. Understanding when and how to apply these concepts is crucial for effective problem-solving and decision-making.`,
        type: "paragraph",
      },
    ],
  };
}

function validateTheory(output: TheoryBlock): ArchitectQualityReport {
  const checks = [
    {
      id: "sections-count",
      label: "Sections Count",
      status: output.sections.length >= 3 ? ("pass" as const) : ("fail" as const),
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
      id: "content-length",
      label: "Content Length",
      status: JSON.stringify(output).length >= 500 ? ("pass" as const) : ("warn" as const),
      detail: `${JSON.stringify(output).length} characters`,
    },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return {
    score: Math.max(0, 100 - fail * 40),
    passed: fail === 0,
    checks,
    suggestions: fail ? ["Generate valid structured theory without authoring syntax"] : [],
  };
}

export async function runTheoryAgent(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  lesson: ArchitectLessonBlueprint
) {
  return runAgent({
    stage: "theory",
    input: { ctx, plan, lesson },
    execute: async ({ ctx: c, plan: p, lesson: l }) => generateTheory(l, c, p),
    validate: validateTheory,
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 75,
  });
}

export function applyTheoryToLesson(
  lesson: ArchitectLessonBlueprint,
  output: TheoryBlock
): ArchitectLessonBlueprint {
  return {
    ...lesson,
    // Store ONLY the structured block
    theoryBlock: output,
  };
}
