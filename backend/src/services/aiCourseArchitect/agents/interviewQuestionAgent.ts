/**
 * Agent — Interview Question AI
 * Generates interview questions for each lesson
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


export interface InterviewQuestion {
  question: string;
  answer: string;
  difficulty: "entry" | "junior" | "mid" | "senior" | "lead";
  category: "theoretical" | "practical" | "behavioral" | "system-design";
  hints: string[];
  keyPoints: string[];
  followUpQuestions: string[];
}

export async function generateInterviewQuestions(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview
): Promise<InterviewQuestion[]> {
  const questions = getOpenAi()
    ? await generateQuestionsWithAI(lesson, mod, interview)
    : null;

  if (questions && questions.length >= 5) {
    return questions;
  }

  return buildHeuristicQuestions(lesson, mod, interview);
}

async function generateQuestionsWithAI(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview
): Promise<InterviewQuestion[] | null> {
  if (!getOpenAi()) return null;

  const prompt = `You are a senior hiring manager and technical interviewer. Generate interview questions for a lesson titled "${lesson.title}" in module "${mod.title}" of a ${interview.courseInfo.subject} course.

${buildInterviewContext(interview)}

Requirements:
- Generate 8-12 interview questions
- Mix of difficulty levels (entry, junior, mid, senior, lead)
- Mix of question categories (theoretical, practical, behavioral, system-design)
- Each question must have a detailed answer, hints, key points, and follow-up questions
- Questions should be relevant to ${interview.courseInfo.industry} roles

Return JSON with an array of questions with:
{
  "question": "full interview question text",
  "answer": "detailed answer",
  "difficulty": "entry|junior|mid|senior|lead",
  "category": "theoretical|practical|behavioral|system-design",
  "hints": ["hint 1", "hint 2"],
  "keyPoints": ["key point 1", "key point 2"],
  "followUpQuestions": ["follow up 1", "follow up 2"]
}

Only return valid JSON, no other text.`;

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("interview"),
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
    const questions = parsed.questions || parsed;

    if (!Array.isArray(questions)) {
      return null;
    }

    return questions as InterviewQuestion[];
  } catch (err) {
    console.error("[Interview Question Agent] OpenAI failed:", err);
    return null;
  }
}

function buildHeuristicQuestions(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview
): InterviewQuestion[] {
  const topic = lesson.title.split("—").pop()?.trim() || lesson.title;
  const subject = interview.courseInfo.subject;

  return [
    {
      question: `Explain what ${topic} is and why it's important in ${subject}.`,
      answer: `${topic} is a core concept in ${subject} that helps solve specific problems... (detailed answer)`,
      difficulty: "entry",
      category: "theoretical",
      hints: [
        `Think about the problem ${topic} solves`,
        `Consider real-world applications in ${interview.courseInfo.industry}`
      ],
      keyPoints: [
        `Definition of ${topic}`,
        `Importance in ${subject}`,
        `Real-world use cases`
      ],
      followUpQuestions: [
        `Can you give an example of how ${topic} is used in practice?`,
        `What are the alternatives to ${topic}?`
      ]
    },
    {
      question: `Walk me through how you would implement ${topic} in a production environment.`,
      answer: `When implementing ${topic} in production, I would follow these steps... (detailed answer)`,
      difficulty: "mid",
      category: "practical",
      hints: [
        `Think about scalability`,
        `Consider error handling`,
        `Remember testing and documentation`
      ],
      keyPoints: [
        `Implementation steps`,
        `Scalability considerations`,
        `Error handling`,
        `Testing strategy`
      ],
      followUpQuestions: [
        `How would you monitor ${topic} in production?`,
        `What challenges might you face when scaling ${topic}?`
      ]
    },
    {
      question: `Tell me about a time you used ${topic} to solve a real problem.`,
      answer: `In my previous role, I used ${topic} to... (STAR method answer)`,
      difficulty: "senior",
      category: "behavioral",
      hints: [
        `Use the STAR method`,
        `Focus on the outcome`,
        `Quantify results if possible`
      ],
      keyPoints: [
        `Situation`,
        `Task`,
        `Action`,
        `Result`
      ],
      followUpQuestions: [
        `What would you do differently now?`,
        `How did you measure success?`
      ]
    }
  ];
}

function validateInterviewQuestions(questions: InterviewQuestion[]): ArchitectQualityReport {
  const checks = [
    {
      id: "count",
      label: "Question count",
      status: questions.length >= 5 ? ("pass" as const) : ("warn" as const),
      detail: `${questions.length} questions`,
    },
    {
      id: "answers",
      label: "Answer quality",
      status: questions.every((q) => isSubstantiveText(q.answer, 30)) ? ("pass" as const) : ("fail" as const),
      detail: "",
    },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return {
    score: Math.max(0, 100 - fail * 35),
    passed: fail === 0 && questions.length >= 3,
    checks,
    suggestions: [],
  };
}

export async function runInterviewQuestionAgent(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  lesson: ArchitectLessonBlueprint
) {
  return runAgent({
    stage: "interview-prep",
    input: { ctx, plan, lesson },
    execute: async ({ ctx: c, lesson: l }) => generateInterviewQuestions(l, c.mod, c.interview),
    validate: validateInterviewQuestions,
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 75,
  });
}
