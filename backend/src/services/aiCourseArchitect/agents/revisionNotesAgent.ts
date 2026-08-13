/**
 * Agent — Revision Notes AI
 * Generates comprehensive revision notes for each lesson
 */
import OpenAI from "openai";
import { getOpenAi } from "../openaiClient.js";
import type {
  AICourseArchitectInterview,
  ArchitectLessonBlueprint,
  ArchitectModuleBlueprint,
  ArchitectQualityReport,
} from "../types.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext } from "../instructorPersona.js";
import { getArchitectModel } from "../architectModels.js";
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { isSubstantiveText } from "../pipeline/placeholderGuards.js";


export interface RevisionNotes {
  lessonTitle: string;
  quickSummary: string;
  keyConcepts: string[];
  importantFormulas: string[];
  commonMistakes: string[];
  examTips: string[];
  practiceQuestions: string[];
  furtherPractice: string[];
  mindMap?: string;
}

export async function generateRevisionNotes(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview
): Promise<RevisionNotes> {
  const notes = getOpenAi()
    ? await generateNotesWithAI(lesson, mod, interview)
    : null;

  if (notes) {
    return notes;
  }

  return buildHeuristicNotes(lesson, mod, interview);
}

async function generateNotesWithAI(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview
): Promise<RevisionNotes | null> {
  if (!getOpenAi()) return null;

  const prompt = `You are a senior educator and exam prep specialist. Generate comprehensive revision notes for a lesson titled "${lesson.title}" in module "${mod.title}" of a ${interview.courseInfo.subject} course.

${buildInterviewContext(interview)}

Requirements:
- Quick summary of the lesson
- List of key concepts
- Important formulas and equations
- Common mistakes to avoid
- Exam tips and strategies
- Practice questions
- Further practice suggestions

Return JSON with:
{
  "lessonTitle": "${lesson.title}",
  "quickSummary": "1-2 paragraph summary",
  "keyConcepts": ["concept 1", "concept 2"],
  "importantFormulas": ["formula 1", "formula 2"],
  "commonMistakes": ["mistake 1", "mistake 2"],
  "examTips": ["tip 1", "tip 2"],
  "practiceQuestions": ["question 1", "question 2"],
  "furtherPractice": ["suggestion 1", "suggestion 2"],
  "mindMap": "optional mind map description"
}

Only return valid JSON, no other text.`;

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("revision"),
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
    return parsed as RevisionNotes;
  } catch (err) {
    console.error("[Revision Notes Agent] OpenAI failed:", err);
    return null;
  }
}

function buildHeuristicNotes(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview
): RevisionNotes {
  const topic = lesson.title.split("—").pop()?.trim() || lesson.title;
  const subject = interview.courseInfo.subject;

  return {
    lessonTitle: lesson.title,
    quickSummary: `This lesson covers ${topic} in ${subject}. Key takeaways include...`,
    keyConcepts: [
      `Core principle of ${topic}`,
      `Application in ${interview.courseInfo.industry}`,
      `Common patterns and techniques`,
      `Best practices`
    ],
    importantFormulas: [
      `Formula 1: Description`,
      `Formula 2: Description`
    ],
    commonMistakes: lesson.commonMistakes || [
      "Skipping prerequisites",
      "Not testing edge cases",
      "Ignoring documentation"
    ],
    examTips: [
      "Review key concepts before the exam",
      "Practice with sample questions",
      "Manage your time effectively",
      "Show your work"
    ],
    practiceQuestions: [
      `Explain ${topic} in your own words`,
      `Give an example of ${topic} in practice`,
      `What are the advantages and disadvantages of ${topic}?`
    ],
    furtherPractice: [
      "Implement the concepts in a small project",
      "Teach the topic to someone else",
      "Find additional resources online"
    ]
  };
}

function validateRevisionNotes(notes: RevisionNotes): ArchitectQualityReport {
  const checks = [
    {
      id: "summary",
      label: "Quick summary present",
      status: isSubstantiveText(notes.quickSummary, 20) ? ("pass" as const) : ("fail" as const),
      detail: "Summary included",
    },
    {
      id: "keyConcepts",
      label: "Key concepts present",
      status: notes.keyConcepts.length >= 3 ? ("pass" as const) : ("warn" as const),
      detail: `${notes.keyConcepts.length} key concepts`,
    },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return {
    score: Math.max(0, 100 - fail * 35),
    passed: fail === 0,
    checks,
    suggestions: fail ? ["Generate comprehensive revision notes with summary and key concepts"] : [],
  };
}

export async function runRevisionNotesAgent(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  lesson: ArchitectLessonBlueprint
) {
  return runAgent({
    stage: "revision-notes",
    input: { ctx, plan, lesson },
    execute: async ({ ctx: c, plan: p, lesson: l }) => generateRevisionNotes(l, c.mod, c.interview),
    validate: validateRevisionNotes,
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 80,
  });
}
