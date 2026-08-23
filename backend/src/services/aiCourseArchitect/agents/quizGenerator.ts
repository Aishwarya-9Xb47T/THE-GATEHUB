/**
 * Agent 5 — Quiz Engine
 * Generates comprehensive assessments: 10 MCQs, 5 True/False, 5 Fill in Blanks, 5 Match Following, 5 Scenario Questions.
 */
import OpenAI from "openai";
import { getOpenAi } from "../openaiClient.js";
import type {
  AICourseArchitectInterview,
  ArchitectLessonBlueprint,
  ArchitectModuleBlueprint,
  ArchitectQuizQuestion,
  LessonPedagogyPlan,
  MCQQuestion,
  TrueFalseQuestion,
  FillBlankQuestion,
  MatchFollowingQuestion,
  ScenarioQuestion,
} from "../types.js";
import { hasLearningComponent, hasLessonStructure } from "../types.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext, ANTI_HALLUCINATION_RULES, buildConceptualQuizGuidance } from "../instructorPersona.js";
import { getArchitectModel } from "../architectModels.js";
import { isSubstantiveText, scanForPlaceholders, shuffleOptions } from "../pipeline/placeholderGuards.js";
import type { LessonOutlineContext } from "../lessonPlanningEngine.js";


const MCQ_COUNT = 10;
const TRUE_FALSE_COUNT = 5;
const FILL_BLANK_COUNT = 5;
const MATCH_FOLLOWING_COUNT = 5;
const SCENARIO_COUNT = 5;

export async function generateLessonQuiz(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview,
  pedagogy: LessonPedagogyPlan,
  outline: LessonOutlineContext,
  lessonContent?: Partial<ArchitectLessonBlueprint>
): Promise<ArchitectQuizQuestion[]> {
  if (!hasLearningComponent(interview, "Quiz") && !hasLessonStructure(interview, "mini-quiz")) {
    return [];
  }

  const generated = getOpenAi()
    ? await generateQuizWithAI(lesson, mod, interview, pedagogy, outline, lessonContent)
    : null;

  if (generated && generated.length >= 25) {
    return generated;
  }

  return buildHeuristicQuiz(lesson, mod, interview, lessonContent);
}

async function generateQuizWithAI(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview,
  pedagogy: LessonPedagogyPlan,
  outline: LessonOutlineContext,
  lessonContent?: Partial<ArchitectLessonBlueprint>
): Promise<ArchitectQuizQuestion[] | null> {
  if (!getOpenAi()) return null;

  const theorySnippet = (lessonContent?.theory ?? lesson.theory ?? "").slice(0, 1200);
  const prompt = `Generate a comprehensive professional lesson quiz as JSON for "${lesson.title}" in module "${mod.title}".

${buildInterviewContext(interview)}

Lesson goals: ${Array.isArray(pedagogy?.learningGoals) ? pedagogy.learningGoals.join("; ") : ""}
Prior lessons: ${outline.priorLessons.map((p) => p.lessonTitle).join(" → ") || "course start"}
Theory snippet: ${theorySnippet}

${buildConceptualQuizGuidance(lesson.difficultyTier ?? "intermediate")}

${ANTI_HALLUCINATION_RULES}

Requirements:
Generate exactly:
- ${MCQ_COUNT} multiple-choice questions (type: "mcq")
- ${TRUE_FALSE_COUNT} true/false questions (type: "true-false")
- ${FILL_BLANK_COUNT} fill-in-the-blank questions (type: "fill-blank")
- ${MATCH_FOLLOWING_COUNT} match-the-following questions (type: "match-following")
- ${SCENARIO_COUNT} scenario-based questions (type: "scenario")

ALL questions must include:
- type: the question type (one of the above)
- text: question text
- explanation: detailed explanation (2-3 sentences)
- difficulty: "easy" | "medium" | "hard"
- topic: subtopic tested
- bloomLevel: "Remember" | "Understand" | "Apply" | "Analyze" | "Evaluate"
- timeEstimateSeconds: estimated time in seconds
- hints: array of hints
- learningObjective: which lesson objective this tests
- marks: number of marks for this question

MCQ questions also need:
- options: 4 distinct plausible options
- correctAnswer: exact text of correct option
- wrongOptionExplanations: object explaining why each wrong option is wrong

True/False questions also need:
- correctAnswer: boolean (true or false)

Fill-in-the-blank questions also need:
- correctAnswer: array of correct answers (one per blank)
- blanksCount: number of blanks in the question

Match-the-following questions also need:
- leftColumn: array of items on the left
- rightColumn: array of items on the right (shuffled)
- correctMatches: object mapping left items to right items

Scenario questions also need:
- scenario: the scenario text
- correctAnswer: the correct answer/explanation
- followUpQuestions: optional array of follow-up questions

NEVER use "Question 1", "Question 2", or placeholder text!

Return JSON:
{
  "questions": [
    // Include all question types here
  ]
}`;

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("quiz"),
      messages: [
        { role: "system", content: PROFESSOR_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: 12000,
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { questions?: ArchitectQuizQuestion[] };
    return normalizeQuizQuestions(parsed.questions ?? []);
  } catch (err) {
    console.error("[Quiz Agent] OpenAI failed:", err);
    return null;
  }
}

function normalizeQuizQuestions(questions: ArchitectQuizQuestion[]): ArchitectQuizQuestion[] {
  return questions.map((q) => {
    if (q.type === "mcq") {
      const mcq = q as MCQQuestion;
      const options = shuffleOptions(
        (mcq.options ?? []).filter((o) => o?.trim() && !scanForPlaceholders(o)).slice(0, 4)
      );
      while (options.length < 4) {
        options.push(`Distractor option ${options.length + 1}`);
      }
      const correct =
        options.find((o) => o === mcq.correctAnswer) ??
        options.find((o) => o.toLowerCase() === mcq.correctAnswer?.toLowerCase()) ??
        options[0];
      return {
        ...mcq,
        options,
        correctAnswer: correct,
        difficulty: mcq.difficulty ?? "medium",
        bloomLevel: mcq.bloomLevel ?? "Understand",
        timeEstimateSeconds: mcq.timeEstimateSeconds ?? 60,
        hints: mcq.hints?.length ? mcq.hints : [],
        learningObjective: mcq.learningObjective ?? "",
        marks: mcq.marks ?? 1,
      };
    }
    return {
      ...q,
      difficulty: q.difficulty ?? "medium",
      bloomLevel: q.bloomLevel ?? "Understand",
      timeEstimateSeconds: q.timeEstimateSeconds ?? 60,
      hints: q.hints?.length ? q.hints : [],
      learningObjective: q.learningObjective ?? "",
      marks: q.marks ?? 1,
    };
  });
}

function buildHeuristicQuiz(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview,
  lessonContent?: Partial<ArchitectLessonBlueprint>
): ArchitectQuizQuestion[] {
  const topic = lesson.title.split("—").pop()?.trim() || lesson.title;
  const subject = interview.courseInfo.subject;
  const tier = lesson.difficultyTier ?? "intermediate";

  const questions: ArchitectQuizQuestion[] = [];

  // Generate MCQs
  for (let i = 0; i < MCQ_COUNT; i++) {
    const correct = "Apply concepts systematically with verification and documentation";
    const options = shuffleOptions([
      correct,
      "Memorize definitions without practicing application",
      "Skip foundational steps to save time",
      "Copy solutions without understanding trade-offs",
    ]);
    questions.push({
      type: "mcq",
      text: i === 0 
        ? `In ${subject}, what is the primary purpose of ${topic} in professional practice?`
        : i === 1 
        ? `Which approach best demonstrates mastery of ${topic} at ${tier} level?`
        : `When applying ${topic} in ${interview.courseInfo.industry}, what is crucial for success?`,
      options,
      correctAnswer: correct,
      explanation: `${topic} in ${subject} requires systematic application, not memorization alone. Professionals verify assumptions, measure outcomes, and document trade-offs — the hallmark of ${tier}-level competency.`,
      wrongOptionExplanations: {
        "Memorize definitions without practicing application": "Recall alone does not build durable skill or professional judgment.",
        "Skip foundational steps to save time": "Skipping foundations causes compounding errors in real projects.",
        "Copy solutions without understanding trade-offs": "Copying without understanding fails in novel scenarios and interviews.",
      },
      difficulty: i < 3 ? "easy" : i < 7 ? "medium" : "hard",
      topic,
      bloomLevel: i < 4 ? "Understand" : i < 8 ? "Apply" : "Analyze",
      timeEstimateSeconds: 45 + i * 5,
      hints: [`Review the core theory section on ${topic}`, `Consider the worked examples in ${mod.title}`],
      learningObjective: lesson.objectives[i % lesson.objectives.length] || "Understand core concepts",
      marks: i < 3 ? 1 : i < 7 ? 2 : 3,
    } satisfies MCQQuestion);
  }

  // Generate True/False
  for (let i = 0; i < TRUE_FALSE_COUNT; i++) {
    questions.push({
      type: "true-false",
      text: i % 2 === 0
        ? `${topic} is a core concept in ${subject} that has practical applications in ${interview.courseInfo.industry}.`
        : `It is best practice to skip documentation when implementing ${topic} to save time.`,
      correctAnswer: i % 2 === 0,
      explanation: i % 2 === 0
        ? `True: ${topic} is indeed a fundamental concept with wide industry applications.`
        : `False: Documentation is always important, especially when implementing ${topic}.`,
      difficulty: i < 2 ? "easy" : "medium",
      topic,
      bloomLevel: i % 2 === 0 ? "Understand" : "Analyze",
      timeEstimateSeconds: 30,
      hints: ["Recall the lesson content"],
      learningObjective: lesson.objectives[0] || "Understand core concepts",
      marks: 1,
    } satisfies TrueFalseQuestion);
  }

  // Generate Fill-in-the-Blanks
  for (let i = 0; i < FILL_BLANK_COUNT; i++) {
    questions.push({
      type: "fill-blank",
      text: `The key principle of ${topic} is __________ and it is important because __________.`,
      correctAnswer: ["systematic application", "it ensures consistent results"],
      blanksCount: 2,
      explanation: `Understanding the key principles of ${topic} is essential for successful implementation.`,
      difficulty: i < 2 ? "easy" : "medium",
      topic,
      bloomLevel: i < 2 ? "Apply" : "Analyze",
      timeEstimateSeconds: 45,
      hints: ["Recall the lesson theory", "Think about practical applications"],
      learningObjective: lesson.objectives[1] || "Apply concepts in practice",
      marks: 2,
    } satisfies FillBlankQuestion);
  }

  // Generate Match-the-Following
  for (let i = 0; i < MATCH_FOLLOWING_COUNT; i++) {
    questions.push({
      type: "match-following",
      text: `Match the following terms related to ${topic} with their correct descriptions.`,
      leftColumn: ["Term 1", "Term 2", "Term 3", "Term 4"],
      rightColumn: ["Description B", "Description D", "Description A", "Description C"],
      correctMatches: {
        "Term 1": "Description A",
        "Term 2": "Description B",
        "Term 3": "Description C",
        "Term 4": "Description D",
      },
      explanation: `Matching terms with their descriptions helps reinforce understanding of ${topic}.`,
      difficulty: "medium",
      topic,
      bloomLevel: i < 2 ? "Apply" : "Analyze",
      timeEstimateSeconds: 60,
      hints: ["Review the glossary", "Recall definitions from the lesson"],
      learningObjective: lesson.objectives[0] || "Understand core concepts",
      marks: 4,
    } satisfies MatchFollowingQuestion);
  }

  // Generate Scenario Questions
  for (let i = 0; i < SCENARIO_COUNT; i++) {
    questions.push({
      type: "scenario",
      text: `Given the scenario below, what would you do?`,
      scenario: `You are working on a project in ${interview.courseInfo.industry} that requires implementing ${topic}. You encounter an unexpected issue.`,
      correctAnswer: `First, verify your assumptions and check the documentation. Then, systematically debug the issue following the ${topic} best practices from the lesson.`,
      followUpQuestions: ["What would you do if the issue persists?", "How would you prevent this in the future?"],
      explanation: `Systematic debugging and verification are crucial when working with ${topic} in real-world scenarios.`,
      difficulty: i < 3 ? "medium" : "hard",
      topic,
      bloomLevel: "Apply",
      timeEstimateSeconds: 120,
      hints: ["Recall the common mistakes section", "Think about best practices"],
      learningObjective: lesson.objectives[2] || "Apply concepts in real-world scenarios",
      marks: 5,
    } satisfies ScenarioQuestion);
  }

  return questions;
}
