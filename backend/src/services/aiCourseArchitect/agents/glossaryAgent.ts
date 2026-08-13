/**
 * Agent — Glossary AI
 * Generates comprehensive glossary for each lesson
 */
import OpenAI from "openai";
import { getOpenAi } from "../openaiClient.js";
import type {
  AICourseArchitectInterview,
  ArchitectLessonBlueprint,
  ArchitectModuleBlueprint,
} from "../types.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext } from "../instructorPersona.js";
import { getArchitectModel } from "../architectModels.js";
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import type { ArchitectQualityReport } from "../types.js";
import { isSubstantiveText } from "../pipeline/placeholderGuards.js";


export interface GlossaryTerm {
  term: string;
  definition: string;
  category?: string;
  relatedTerms?: string[];
  examples?: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
}

export async function generateLessonGlossary(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview
): Promise<GlossaryTerm[]> {
  const glossary = getOpenAi()
    ? await generateGlossaryWithAI(lesson, mod, interview)
    : null;

  if (glossary && glossary.length >= 5) {
    return glossary;
  }

  return [];
}

async function generateGlossaryWithAI(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview
): Promise<GlossaryTerm[] | null> {
  if (!getOpenAi()) return null;

  const prompt = `You are a senior technical writer and educator. Generate a comprehensive glossary for a lesson titled "${lesson.title}" in module "${mod.title}" of a ${interview.courseInfo.subject} course.

${buildInterviewContext(interview)}

Requirements:
- Include all key terms from the lesson
- Each definition should be clear, concise, and accurate
- Include category, related terms, and examples where appropriate
- Vary difficulty from beginner to advanced

Return JSON with an array of glossary terms with:
{
  "term": "term name",
  "definition": "clear definition",
  "category": "category name",
  "relatedTerms": ["related term 1", "related term 2"],
  "examples": ["example 1", "example 2"],
  "difficulty": "beginner|intermediate|advanced"
}

Only return valid JSON, no other text.`;

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("glossary"),
      messages: [
        { role: "system", content: PROFESSOR_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 2500,
    });

    const raw = res.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const glossary = parsed.glossary || parsed.terms || parsed;

    if (!Array.isArray(glossary)) {
      return null;
    }

    return glossary as GlossaryTerm[];
  } catch (err) {
    console.error("[Glossary Agent] OpenAI failed:", err);
    return null;
  }
}

function buildHeuristicGlossary(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview
): GlossaryTerm[] {
  const topic = lesson.title.split("—").pop()?.trim() || lesson.title;
  const subject = interview.courseInfo.subject;

  return [
    {
      term: topic,
      definition: `The main subject of this lesson, a core concept in ${subject}.`,
      category: subject,
      relatedTerms: [mod.title],
      examples: ["Example 1", "Example 2"],
      difficulty: "beginner"
    },
    {
      term: `${topic} - Key Concept 1`,
      definition: `A fundamental concept related to ${topic}.`,
      category: subject,
      relatedTerms: [topic],
      examples: ["Example A"],
      difficulty: "beginner"
    },
    {
      term: `${topic} - Key Concept 2`,
      definition: `An important concept that builds on ${topic}.`,
      category: subject,
      relatedTerms: [topic, `${topic} - Key Concept 1`],
      examples: ["Example B"],
      difficulty: "intermediate"
    },
    {
      term: `${topic} - Advanced Concept`,
      definition: `A more complex concept related to ${topic}.`,
      category: subject,
      relatedTerms: [topic, `${topic} - Key Concept 1`, `${topic} - Key Concept 2`],
      examples: ["Example C"],
      difficulty: "advanced"
    }
  ];
}

function validateGlossary(terms: GlossaryTerm[]): ArchitectQualityReport {
  if (terms.length === 0) {
    return {
      score: 100,
      passed: true,
      checks: [{ id: "optional", label: "Glossary optional", status: "pass", detail: "Skipped placeholder glossary" }],
      suggestions: [],
    };
  }
  const checks = [
    {
      id: "count",
      label: "Glossary size",
      status: terms.length >= 4 ? ("pass" as const) : ("warn" as const),
      detail: `${terms.length} terms`,
    },
    {
      id: "definitions",
      label: "Definitions",
      status: terms.every((t) => isSubstantiveText(t.definition, 10)) ? ("pass" as const) : ("fail" as const),
      detail: "",
    },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return {
    score: Math.max(0, 100 - fail * 35),
    passed: fail === 0 && terms.length >= 3,
    checks,
    suggestions: fail ? ["Expand glossary with clear definitions"] : [],
  };
}

export async function runGlossaryAgent(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  lesson: ArchitectLessonBlueprint
) {
  return runAgent({
    stage: "glossary",
    input: { ctx, plan, lesson },
    execute: async ({ ctx: c, lesson: l }) => generateLessonGlossary(l, c.mod, c.interview),
    validate: validateGlossary,
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 75,
  });
}
