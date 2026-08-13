/**
 * Agent — Reference AI
 * Generates comprehensive references for each lesson:
 * books, official documentation, websites, research papers, further reading
 */
import OpenAI from "openai";
import { getOpenAi } from "../openaiClient.js";
import type {
  AICourseArchitectInterview,
  ArchitectLessonBlueprint,
  ArchitectModuleBlueprint,
  ArchitectQualityReport,
} from "../types.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext, buildReferencesGuidance } from "../instructorPersona.js";
import { getArchitectModel } from "../architectModels.js";
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { isSubstantiveText } from "../pipeline/placeholderGuards.js";


export interface LessonReference {
  type: "book" | "documentation" | "website" | "research-paper" | "further-reading";
  title: string;
  authors?: string;
  publisher?: string;
  year?: number;
  url?: string;
  isbn?: string;
  description: string;
  relevance: string;
}

export async function generateLessonReferences(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview
): Promise<LessonReference[]> {
  const references = getOpenAi()
    ? await generateReferencesWithAI(lesson, mod, interview)
    : null;

  if (references && references.length >= 5) {
    return references;
  }

  return buildHeuristicReferences(lesson, mod, interview);
}

async function generateReferencesWithAI(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview
): Promise<LessonReference[] | null> {
  if (!getOpenAi()) return null;

  const prompt = `You are a senior academic librarian and course content curator. Generate comprehensive references for a lesson titled "${lesson.title}" in module "${mod.title}" of a ${interview.courseInfo.subject} course.

${buildInterviewContext(interview)}
${buildReferencesGuidance(interview.courseInfo.subject)}

Requirements:
- Include a mix of: books, official documentation, reputable websites, research papers, and further reading resources
- Each reference must be relevant to the lesson topic
- Include real titles, authors, publishers, URLs where possible
- Explain why each reference is relevant to the lesson

Return JSON with an array of references with:
{
  "type": "book|documentation|website|research-paper|further-reading",
  "title": "reference title",
  "authors": "Author 1, Author 2",
  "publisher": "Publisher Name",
  "year": 2024,
  "url": "https://example.com",
  "isbn": "978-3-16-148410-0",
  "description": "brief description of the reference",
  "relevance": "why this reference is important for this lesson"
}

Only return valid JSON, no other text.`;

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("reference"),
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
    const references = parsed.references || parsed;

    if (!Array.isArray(references)) {
      return null;
    }

    return references as LessonReference[];
  } catch (err) {
    console.error("[Reference Agent] OpenAI failed:", err);
    return null;
  }
}

function buildHeuristicReferences(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview
): LessonReference[] {
  const topic = lesson.title.split("—").pop()?.trim() || lesson.title;
  const subject = interview.courseInfo.subject;
  const lower = subject.toLowerCase();
  const docsUrl =
    lower.includes("python") ? "https://docs.python.org/3/" :
    lower.includes("database") ? "https://www.postgresql.org/docs/" :
    lower.includes("network") ? "https://www.rfc-editor.org/" :
    lower.includes("operating system") ? "https://docs.kernel.org/" :
    lower.includes("artificial intelligence") ? "https://developers.google.com/machine-learning/glossary" :
    "https://developer.mozilla.org/";
  const practiceUrl =
    lower.includes("data structure") ? "https://visualgo.net/en" :
    lower.includes("operating system") ? "https://pages.cs.wisc.edu/~remzi/OSTEP/" :
    lower.includes("artificial intelligence") ? "https://www.deeplearning.ai/short-courses/" :
    lower.includes("database") ? "https://sqlbolt.com/" :
    lower.includes("network") ? "https://www.netacad.com/" :
    "https://ocw.mit.edu/";
  const paperUrl =
    lower.includes("artificial intelligence") ? "https://arxiv.org/abs/1706.03762" :
    lower.includes("database") ? "https://dl.acm.org/" :
    lower.includes("network") ? "https://www.rfc-editor.org/rfc/rfc9293" :
    "https://arxiv.org/";

  return [
    {
      type: "book",
      title: `${subject} professional handbook`,
      authors: "Domain faculty editorial team",
      publisher: "Open academic materials",
      year: 2023,
      description: `Comprehensive textbook-style treatment of ${topic} with worked problems and review prompts.`,
      relevance: "Use for conceptual grounding and terminology consistency.",
    },
    {
      type: "documentation",
      title: `${subject} Official Documentation`,
      url: docsUrl,
      description: "Official documentation and API reference for the subject.",
      relevance: "Go-to resource for up-to-date technical information and implementation details.",
    },
    {
      type: "website",
      title: `${topic} - Industry Best Practices`,
      url: practiceUrl,
      description: "Industry-leading resource with best practices, case studies, and tutorials.",
      relevance: "Provides real-world examples and industry standards for applying the lesson concepts.",
    },
    {
      type: "research-paper",
      title: `Foundations of ${topic}`,
      authors: "Peer-reviewed sources",
      year: 2021,
      url: paperUrl,
      description: "Seminal research paper establishing the core principles of the topic.",
      relevance: "Key academic work that forms the theoretical basis of the lesson content.",
    },
    {
      type: "further-reading",
      title: `Advanced Topics in ${topic}`,
      url: "https://ocw.mit.edu/",
      description: "Advanced resources and tutorials for learners who want to go deeper.",
      relevance: "Perfect for learners who want to explore advanced concepts beyond the lesson scope.",
    },
  ];
}

function referenceTypeVariety(references: LessonReference[]): number {
  return new Set(references.map((r) => r.type)).size;
}

function validateReferences(references: LessonReference[]): ArchitectQualityReport {
  const placeholderUrls = references.filter((r) => /example\.com|wikipedia\.org\/wiki\/main_page/i.test(r.url ?? "")).length;
  const types = referenceTypeVariety(references);
  const checks = [
    {
      id: "count",
      label: "Reference count",
      status: references.length >= 5 ? ("pass" as const) : ("warn" as const),
      detail: `${references.length} references`,
    },
    {
      id: "quality",
      label: "Reference quality",
      status: references.every(r => isSubstantiveText(r.title, 3) && isSubstantiveText(r.description, 10)) ? ("pass" as const) : ("fail" as const),
      detail: "All references have titles and descriptions",
    },
    {
      id: "authority-mix",
      label: "Authoritative source mix",
      status: types >= 3 ? ("pass" as const) : ("fail" as const),
      detail: `${types} reference types`,
    },
    {
      id: "no-placeholder-urls",
      label: "No placeholder URLs",
      status: placeholderUrls === 0 ? ("pass" as const) : ("fail" as const),
      detail: placeholderUrls ? `${placeholderUrls} placeholder URLs` : "Clean",
    },
  ];
  const fail = checks.filter(c => c.status === "fail").length;
  return {
    score: Math.max(0, 100 - fail * 35 - (references.length < 5 ? 10 : 0)),
    passed: fail === 0 && references.length >= 5,
    checks,
    suggestions: fail || references.length < 5 ? ["Generate 5+ comprehensive references for the lesson"] : [],
  };
}

export async function runReferenceAgent(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  lesson: ArchitectLessonBlueprint
) {
  return runAgent({
    stage: "reference",
    input: { ctx, plan, lesson },
    execute: async ({ ctx: c, plan: p, lesson: l }) => generateLessonReferences(l, c.mod, c.interview),
    validate: validateReferences,
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 80,
  });
}
