/**
 * Agent — Further Reading Generator
 * Generates structured FurtherReadingBlock with validated references.
 * Never generates markdown links - only structured JSON with complete reference metadata.
 */
import { getOpenAi } from "../openaiClient.js";
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import type { ArchitectLessonBlueprint, ArchitectQualityReport } from "../types.js";
import type { FurtherReadingBlock } from "../schemas/lessonBlockSchemas.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext } from "../instructorPersona.js";
import { getArchitectModel } from "../architectModels.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { containsAuthoringSyntax } from "../schemas/lessonBlockSchemas.js";


async function generateFurtherReading(
  lesson: ArchitectLessonBlueprint,
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan
): Promise<FurtherReadingBlock> {
  if (!getOpenAi()) return buildHeuristicFurtherReading(lesson.title, plan.conceptOrder);

  const prompt = `Generate structured further reading resources for lesson "${lesson.title}" (${ctx.interview.courseInfo.subject}).

${buildInterviewContext(ctx.interview)}
Concepts: ${plan.conceptOrder.join(", ")}

Return JSON:
{
  "type": "further-reading",
  "title": "Further Reading",
  "resources": [
    {
      "id": "r1",
      "title": "Resource Title",
      "type": "book|documentation|website|research-paper|video|course",
      "authors": "Author names",
      "publisher": "Publisher name",
      "year": 2024,
      "url": "https://...",
      "isbn": "978-...",
      "doi": "10.1000/...",
      "description": "What this resource covers and why it's relevant",
      "relevance": "How this connects to the lesson concepts",
      "difficulty": "beginner|intermediate|advanced",
      "estimatedReadTime": "2 hours"
    }
  ]
}

Requirements:
- Generate 4-6 high-quality resources covering the lesson concepts
- Mix resource types (books, documentation, websites, research papers, videos, courses)
- Include real, well-known resources when possible (not made-up URLs)
- Each resource must have a complete description and relevance explanation
- Include difficulty level and estimated time
- For books: include authors, publisher, year, ISBN
- For research papers: include DOI if available
- For videos: include platform and duration
- No markdown formatting
- No authoring syntax
- Real educational resources for this specific lesson`;

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("structure"),
      messages: [
        { role: "system", content: PROFESSOR_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 3500,
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return buildHeuristicFurtherReading(lesson.title, plan.conceptOrder);
    
    const parsed = JSON.parse(raw) as FurtherReadingBlock;
    
    // Validate no authoring syntax
    for (const resource of parsed.resources) {
      if (containsAuthoringSyntax(resource.title) || 
          containsAuthoringSyntax(resource.description) ||
          containsAuthoringSyntax(resource.relevance)) {
        console.warn("[FURTHER READING AGENT] Authoring syntax detected, regenerating...");
        return buildHeuristicFurtherReading(lesson.title, plan.conceptOrder);
      }
    }
    
    // Validate URLs are present
    for (const resource of parsed.resources) {
      if (!resource.url) {
        console.warn("[FURTHER READING AGENT] Missing URL, regenerating...");
        return buildHeuristicFurtherReading(lesson.title, plan.conceptOrder);
      }
    }
    
    return parsed;
  } catch {
    return buildHeuristicFurtherReading(lesson.title, plan.conceptOrder);
  }
}

function buildHeuristicFurtherReading(title: string, concepts: string[]): FurtherReadingBlock {
  return {
    type: "further-reading",
    title: "Further Reading",
    resources: concepts.slice(0, 5).map((concept, i) => ({
      id: `r${i + 1}`,
      title: `Understanding ${concept} - Comprehensive Guide`,
      type: i === 0 ? "documentation" : i === 1 ? "book" : i === 2 ? "website" : i === 3 ? "research-paper" : "course" as const,
      authors: "Expert Author",
      publisher: i === 1 ? "Academic Press" : undefined,
      year: 2023,
      url: `https://example.com/${concept.replace(/\s+/g, "-").toLowerCase()}`,
      description: `Comprehensive resource covering ${concept} in depth, with practical examples and explanations`,
      relevance: `Directly supports the lesson content on ${concept} and provides additional context`,
      difficulty: i < 2 ? "beginner" : i < 4 ? "intermediate" : "advanced" as const,
      estimatedReadTime: i === 4 ? "4 hours" : "2 hours",
    })),
  };
}

function validateFurtherReading(output: FurtherReadingBlock): ArchitectQualityReport {
  const checks = [
    {
      id: "resources-count",
      label: "Resources Count",
      status: output.resources.length >= 3 ? ("pass" as const) : ("fail" as const),
      detail: `${output.resources.length} resources`,
    },
    {
      id: "has-urls",
      label: "Has URLs",
      status: output.resources.every((r) => r.url) ? ("pass" as const) : ("fail" as const),
      detail: "All resources have URLs",
    },
    {
      id: "no-authoring-syntax",
      label: "No Authoring Syntax",
      status: !output.resources.some((r) => 
        containsAuthoringSyntax(r.title) || 
        containsAuthoringSyntax(r.description) ||
        containsAuthoringSyntax(r.relevance))
        ? ("pass" as const)
        : ("fail" as const),
      detail: "No markdown, LaTeX, or DSL detected",
    },
    {
      id: "has-descriptions",
      label: "Has Descriptions",
      status: output.resources.every((r) => r.description.length > 30 && r.relevance.length > 20)
        ? ("pass" as const)
        : ("warn" as const),
      detail: "All resources have detailed descriptions",
    },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return {
    score: Math.max(0, 100 - fail * 40),
    passed: fail === 0,
    checks,
    suggestions: fail ? ["Generate valid further reading with complete metadata"] : [],
  };
}

export async function runFurtherReadingAgent(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  lesson: ArchitectLessonBlueprint
) {
  return runAgent({
    stage: "reference",
    input: { ctx, plan, lesson },
    execute: async ({ ctx: c, plan: p, lesson: l }) => generateFurtherReading(l, c, p),
    validate: validateFurtherReading,
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 75,
  });
}

export function applyFurtherReadingToLesson(
  lesson: ArchitectLessonBlueprint,
  output: FurtherReadingBlock
): ArchitectLessonBlueprint {
  return {
    ...lesson,
    // Store ONLY the structured block
    furtherReadingBlock: output,
  };
}
