import { randomUUID } from "crypto";
import type { AiAssessmentConfig, AiGeneratedQuestion } from "./types.js";
import { normalizeImportQuestionType } from "../import/importQuizMaterializer.js";
import { expandTypeSequence } from "../../assessmentGeneration/assessmentGenerationService.js";

function normalizeBloom(level?: string): string {
  if (!level) return "L2";
  const m = level.match(/L?(\d)/i);
  if (m) return `L${m[1]}`;
  const map: Record<string, string> = {
    remember: "L1",
    understand: "L2",
    apply: "L3",
    analyze: "L4",
    evaluate: "L5",
    create: "L6",
    balanced: "L3",
  };
  return map[level.toLowerCase()] || "L2";
}

const SAMPLE_STEMS = [
  (topic: string, i: number) => `Which statement best describes a core concept in ${topic}? (Sample Q${i + 1})`,
  (topic: string, i: number) => `In ${topic}, what is the primary purpose of the technique discussed in your material? (Q${i + 1})`,
  (topic: string, i: number) => `A student is working on ${topic}. Which approach would be most appropriate? (Q${i + 1})`,
  (topic: string, i: number) => `Evaluate the following about ${topic}: which option is correct? (Q${i + 1})`,
  (topic: string, i: number) => `Practical application in ${topic}: select the best answer. (Q${i + 1})`,
];

export function generateOfflineDemoQuestions(config: AiAssessmentConfig): AiGeneratedQuestion[] {
  const topic = config.topic || config.subject || config.quizName || "this subject";
  const count = config.questionCount;
  const startIndex = config.generationStartIndex ?? 0;
  const typeSequence = expandTypeSequence(config);
  const difficulties = ["easy", "medium", "hard"];
  const blooms = ["L1", "L2", "L3", "L4"];

  return Array.from({ length: count }, (_, i) => {
    const globalIndex = startIndex + i;
    const stemFn = SAMPLE_STEMS[globalIndex % SAMPLE_STEMS.length]!;
    const type = normalizeImportQuestionType(typeSequence[i] || "multiple_choice");

    const base: AiGeneratedQuestion = {
      id: randomUUID(),
      stem: stemFn(topic, globalIndex),
      type,
      difficulty: config.difficulty && config.difficulty !== "adaptive" ? config.difficulty : difficulties[i % difficulties.length],
      bloomLevel: normalizeBloom(config.bloomLevel || blooms[i % blooms.length]),
      explanation: config.generateExplanations !== false
        ? "This is a locally generated sample. Replace with your own content before publishing."
        : undefined,
      topic: config.subject || topic,
      tags: ["demo-mode", "offline-sample", ...(config.generateTags ? [topic] : [])],
      hints: config.generateHints ? ["Review your source material for the correct concept."] : undefined,
      confidence: 0.55,
      estimatedSeconds: 60,
      marks: 1,
      selected: true,
      warnings: ["Demo mode — sample question generated locally for UI testing."],
      metadata: { aiGenerated: false, demoMode: true, offline: true },
    };

    if (type === "true_false") {
      return {
        ...base,
        options: [
          { text: "True", isCorrect: i % 2 === 0 },
          { text: "False", isCorrect: i % 2 !== 0 },
        ],
      };
    }

    return {
      ...base,
      options: [
        { text: `Correct concept related to ${topic}`, isCorrect: true },
        { text: "A plausible but incorrect alternative", isCorrect: false },
        { text: "Another common misconception", isCorrect: false },
        { text: "An unrelated distractor", isCorrect: false },
      ],
    };
  });
}
