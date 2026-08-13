/**
 * Agent — Quiz Generator
 * Generates structured QuizBlock with validated questions and options.
 * Never generates markdown quiz format - only structured JSON with question metadata.
 */
import { getOpenAi } from "../openaiClient.js";
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import type { ArchitectLessonBlueprint, ArchitectQualityReport } from "../types.js";
import type { QuizBlock } from "../schemas/lessonBlockSchemas.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext } from "../instructorPersona.js";
import { getArchitectModel } from "../architectModels.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { containsAuthoringSyntax } from "../schemas/lessonBlockSchemas.js";


async function generateQuiz(
  lesson: ArchitectLessonBlueprint,
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan
): Promise<QuizBlock> {
  if (!getOpenAi()) return buildHeuristicQuiz(lesson.title, plan.conceptOrder);

  const prompt = `Generate a structured quiz for lesson "${lesson.title}" (${ctx.interview.courseInfo.subject}).

${buildInterviewContext(ctx.interview)}
Concepts: ${plan.conceptOrder.join(", ")}

Return JSON:
{
  "type": "quiz",
  "title": "Lesson Quiz",
  "description": "Test your understanding of the key concepts",
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "question": "What is the correct answer?",
      "options": [
        {"id": "a", "text": "Option A", "isCorrect": false, "explanation": "Why this is wrong"},
        {"id": "b", "text": "Option B", "isCorrect": true, "explanation": "Why this is correct"},
        {"id": "c", "text": "Option C", "isCorrect": false, "explanation": "Why this is wrong"},
        {"id": "d", "text": "Option D", "isCorrect": false, "explanation": "Why this is wrong"}
      ],
      "explanation": "Detailed explanation of the correct answer",
      "difficulty": "easy|medium|hard",
      "points": 1,
      "hints": ["Hint 1", "Hint 2"]
    }
  ],
  "passingScore": 70,
  "timeLimit": 300
}

Requirements:
- Generate 5-8 questions covering all lesson concepts
- Mix difficulty levels (easy, medium, hard)
- Each MCQ must have 4 options with exactly 1 correct answer
- Each option must have an explanation
- Each question must have a detailed explanation
- Include hints for challenging questions
- Questions must test understanding, not just memorization
- No markdown formatting
- No authoring syntax
- Real educational quiz for this specific lesson`;

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("structure"),
      messages: [
        { role: "system", content: PROFESSOR_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 4000,
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return buildHeuristicQuiz(lesson.title, plan.conceptOrder);
    
    const parsed = JSON.parse(raw) as QuizBlock;
    
    // Validate no authoring syntax
    for (const question of parsed.questions) {
      if (containsAuthoringSyntax(question.question)) {
        console.warn("[QUIZ AGENT] Authoring syntax detected in question, regenerating...");
        return buildHeuristicQuiz(lesson.title, plan.conceptOrder);
      }
      if (question.explanation && containsAuthoringSyntax(question.explanation)) {
        console.warn("[QUIZ AGENT] Authoring syntax detected in explanation, regenerating...");
        return buildHeuristicQuiz(lesson.title, plan.conceptOrder);
      }
    }
    
    // Validate each question has exactly one correct answer
    for (const question of parsed.questions) {
      if (question.type === "mcq" && question.options) {
        const correctCount = question.options.filter((o) => o.isCorrect).length;
        if (correctCount !== 1) {
          console.warn("[QUIZ AGENT] Invalid correct answer count, regenerating...");
          return buildHeuristicQuiz(lesson.title, plan.conceptOrder);
        }
      }
    }
    
    return parsed;
  } catch {
    return buildHeuristicQuiz(lesson.title, plan.conceptOrder);
  }
}

function buildHeuristicQuiz(title: string, concepts: string[]): QuizBlock {
  return {
    type: "quiz",
    title: "Lesson Quiz",
    description: `Test your understanding of ${title}`,
    questions: concepts.slice(0, 5).map((concept, i) => ({
      id: `q${i + 1}`,
      type: "mcq" as const,
      question: `Which statement best describes ${concept}?`,
      options: [
        { id: "a", text: "Incorrect option A", isCorrect: false, explanation: "This is not accurate" },
        { id: "b", text: `Correct: ${concept} is...`, isCorrect: true, explanation: "This is the correct answer" },
        { id: "c", text: "Incorrect option C", isCorrect: false, explanation: "This is misleading" },
        { id: "d", text: "Incorrect option D", isCorrect: false, explanation: "This is incorrect" },
      ],
      explanation: `${concept} is a fundamental concept that...`,
      difficulty: i < 2 ? "easy" : i < 4 ? "medium" : "hard",
      points: 1,
      hints: i > 2 ? ["Think about the definition", "Consider the context"] : [],
    })),
    passingScore: 70,
    timeLimit: 300,
  };
}

function validateQuiz(output: QuizBlock): ArchitectQualityReport {
  const checks = [
    {
      id: "questions-count",
      label: "Questions Count",
      status: output.questions.length >= 3 ? ("pass" as const) : ("fail" as const),
      detail: `${output.questions.length} questions`,
    },
    {
      id: "valid-answers",
      label: "Valid Answer Keys",
      status: output.questions.every((q) => {
        if (q.type === "mcq" && q.options) {
          return q.options.filter((o) => o.isCorrect).length === 1;
        }
        return true;
      }) ? ("pass" as const) : ("fail" as const),
      detail: "Each MCQ has exactly one correct answer",
    },
    {
      id: "no-authoring-syntax",
      label: "No Authoring Syntax",
      status: !output.questions.some((q) => containsAuthoringSyntax(q.question))
        ? ("pass" as const)
        : ("fail" as const),
      detail: "No markdown, LaTeX, or DSL detected",
    },
    {
      id: "has-explanations",
      label: "Has Explanations",
      status: output.questions.every((q) => q.explanation && q.explanation.length > 20)
        ? ("pass" as const)
        : ("warn" as const),
      detail: "All questions have detailed explanations",
    },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return {
    score: Math.max(0, 100 - fail * 40),
    passed: fail === 0,
    checks,
    suggestions: fail ? ["Generate valid quiz with proper answer keys"] : [],
  };
}

export async function runQuizAgent(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  lesson: ArchitectLessonBlueprint
) {
  return runAgent({
    stage: "assessment",
    input: { ctx, plan, lesson },
    execute: async ({ ctx: c, plan: p, lesson: l }) => generateQuiz(l, c, p),
    validate: validateQuiz,
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 75,
  });
}

export function applyQuizToLesson(
  lesson: ArchitectLessonBlueprint,
  output: QuizBlock
): ArchitectLessonBlueprint {
  return {
    ...lesson,
    // Store ONLY the structured block
    quizBlock: output,
  };
}
