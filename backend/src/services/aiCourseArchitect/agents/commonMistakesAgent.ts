/**
 * Agent — Common Mistakes Generator
 * Generates structured CommonMistakesBlock with detailed error analysis.
 * Never generates markdown lists - only structured JSON with mistake metadata.
 */
import { getOpenAi } from "../openaiClient.js";
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import type { ArchitectLessonBlueprint, ArchitectQualityReport } from "../types.js";
import type { CommonMistakesBlock } from "../schemas/lessonBlockSchemas.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext } from "../instructorPersona.js";
import { getArchitectModel } from "../architectModels.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { containsAuthoringSyntax } from "../schemas/lessonBlockSchemas.js";


async function generateCommonMistakes(
  lesson: ArchitectLessonBlueprint,
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan
): Promise<CommonMistakesBlock> {
  if (!getOpenAi()) return buildHeuristicCommonMistakes(lesson.title, plan.conceptOrder);

  const prompt = `Generate structured common mistakes for lesson "${lesson.title}" (${ctx.interview.courseInfo.subject}).

${buildInterviewContext(ctx.interview)}
Concepts: ${plan.conceptOrder.join(", ")}

Return JSON:
{
  "type": "common-mistakes",
  "title": "Common Mistakes to Avoid",
  "mistakes": [
    {
      "id": "m1",
      "mistake": "Description of the common mistake",
      "whyItHappens": "Explanation of why students make this error",
      "howToAvoid": "Specific steps to prevent this mistake",
      "example": "Code example showing the mistake",
      "correctedExample": "Code example showing the correct approach",
      "severity": "critical|major|minor"
    }
  ]
}

Requirements:
- Generate 4-6 common mistakes students make with this topic
- Each mistake must explain WHY it happens (root cause)
- Each mistake must provide specific prevention steps
- Include code examples showing the mistake and correction
- Mark severity appropriately (critical = breaks functionality, major = causes bugs, minor = style/optimization)
- Mistakes must be real and common, not edge cases
- No markdown formatting
- No authoring syntax
- Real educational content for this specific lesson`;

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("structure"),
      messages: [
        { role: "system", content: PROFESSOR_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 3000,
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return buildHeuristicCommonMistakes(lesson.title, plan.conceptOrder);
    
    const parsed = JSON.parse(raw) as CommonMistakesBlock;
    
    // Validate no authoring syntax
    for (const mistake of parsed.mistakes) {
      if (containsAuthoringSyntax(mistake.mistake) || 
          containsAuthoringSyntax(mistake.whyItHappens) ||
          containsAuthoringSyntax(mistake.howToAvoid)) {
        console.warn("[COMMON MISTAKES AGENT] Authoring syntax detected, regenerating...");
        return buildHeuristicCommonMistakes(lesson.title, plan.conceptOrder);
      }
    }
    
    return parsed;
  } catch {
    return buildHeuristicCommonMistakes(lesson.title, plan.conceptOrder);
  }
}

function buildHeuristicCommonMistakes(title: string, concepts: string[]): CommonMistakesBlock {
  return {
    type: "common-mistakes",
    title: "Common Mistakes to Avoid",
    mistakes: concepts.slice(0, 4).map((concept, i) => ({
      id: `m${i + 1}`,
      mistake: `Misunderstanding ${concept} or applying it incorrectly`,
      whyItHappens: `Students often confuse ${concept} with similar concepts or miss key nuances`,
      howToAvoid: `Review the definition of ${concept} carefully and practice with examples`,
      example: `// Incorrect usage of ${concept}`,
      correctedExample: `// Correct usage of ${concept}`,
      severity: i === 0 ? "critical" : i < 2 ? "major" : "minor" as const,
    })),
  };
}

function validateCommonMistakes(output: CommonMistakesBlock): ArchitectQualityReport {
  const checks = [
    {
      id: "mistakes-count",
      label: "Mistakes Count",
      status: output.mistakes.length >= 3 ? ("pass" as const) : ("fail" as const),
      detail: `${output.mistakes.length} mistakes`,
    },
    {
      id: "has-explanations",
      label: "Has Explanations",
      status: output.mistakes.every((m) => m.whyItHappens.length > 20 && m.howToAvoid.length > 20)
        ? ("pass" as const)
        : ("warn" as const),
      detail: "All mistakes have detailed explanations",
    },
    {
      id: "no-authoring-syntax",
      label: "No Authoring Syntax",
      status: !output.mistakes.some((m) => 
        containsAuthoringSyntax(m.mistake) || 
        containsAuthoringSyntax(m.whyItHappens) ||
        containsAuthoringSyntax(m.howToAvoid))
        ? ("pass" as const)
        : ("fail" as const),
      detail: "No markdown, LaTeX, or DSL detected",
    },
    {
      id: "has-examples",
      label: "Has Examples",
      status: output.mistakes.every((m) => m.example && m.correctedExample)
        ? ("pass" as const)
        : ("warn" as const),
      detail: "All mistakes have example and correction",
    },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return {
    score: Math.max(0, 100 - fail * 40),
    passed: fail === 0,
    checks,
    suggestions: fail ? ["Generate valid common mistakes with explanations"] : [],
  };
}

export async function runCommonMistakesAgent(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  lesson: ArchitectLessonBlueprint
) {
  return runAgent({
    stage: "lesson-writer",
    input: { ctx, plan, lesson },
    execute: async ({ ctx: c, plan: p, lesson: l }) => generateCommonMistakes(l, c, p),
    validate: validateCommonMistakes,
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 75,
  });
}

export function applyCommonMistakesToLesson(
  lesson: ArchitectLessonBlueprint,
  output: CommonMistakesBlock
): ArchitectLessonBlueprint {
  return {
    ...lesson,
    // Store ONLY the structured block
    commonMistakesBlock: output,
  };
}
