import type { AiAssessmentConfig, AiGeneratedQuestion } from "./types";

function normalizeBloom(level?: string): string {
  if (!level) return "L2";
  const m = level?.match(/L?(\d)/i);
  if (m) return `L${m[1]}`;
  return "L2";
}

const SAMPLE_STEMS = [
  (topic: string, i: number) => `Which statement best describes a core concept in ${topic}? (Sample Q${i + 1})`,
  (topic: string, i: number) => `In ${topic}, what is the primary purpose of the technique in your material? (Q${i + 1})`,
  (topic: string, i: number) => `A student is working on ${topic}. Which approach is most appropriate? (Q${i + 1})`,
];

function expandTypeSequence(config: AiAssessmentConfig): string[] {
  const dist = config.questionTypeDistribution;
  if (!dist || !Object.keys(dist).length) {
    const types = config.questionTypes?.filter((t) => t !== "mixed") || ["multiple_choice"];
    return Array.from({ length: config.questionCount }, (_, i) => types[i % types.length]!);
  }
  const sequence: string[] = [];
  for (const [type, count] of Object.entries(dist)) {
    for (let i = 0; i < count; i++) sequence.push(type);
  }
  return sequence.slice(0, config.questionCount);
}

export function generateOfflineDemoQuestions(config: AiAssessmentConfig): AiGeneratedQuestion[] {
  const topic = config.topic || config.subject || config.quizName || "this subject";
  const count = config.questionCount;
  const typeSequence = expandTypeSequence(config);

  return Array.from({ length: count }, (_, i) => {
    const type = typeSequence[i] || (i % 3 === 0 ? "true_false" : "multiple_choice");
    return {
      id: crypto.randomUUID(),
      stem: SAMPLE_STEMS[i % SAMPLE_STEMS.length]!(topic, i),
      type,
      difficulty: config.difficulty || "medium",
      bloomLevel: normalizeBloom(config.bloomLevel),
      explanation: "Demo mode — sample question. Edit before publishing.",
      topic,
      tags: ["demo-mode", "offline-sample"],
      options:
        type === "true_false"
          ? [
              { text: "True", isCorrect: true },
              { text: "False", isCorrect: false },
            ]
          : [
              { text: `Correct concept related to ${topic}`, isCorrect: true },
              { text: "Plausible distractor A", isCorrect: false },
              { text: "Plausible distractor B", isCorrect: false },
              { text: "Unrelated option", isCorrect: false },
            ],
      confidence: 0.55,
      estimatedSeconds: 60,
      marks: 1,
      selected: true,
      warnings: ["Demo mode — sample question generated locally."],
      metadata: { demoMode: true, offline: true },
    };
  });
}

export function generateOfflineDemoPreview(
  jobId: string,
  config: AiAssessmentConfig,
  source: import("./types").AiSourceType
): import("./types").AiGenerationPreview {
  const questions = generateOfflineDemoQuestions(config);
  const estSec = questions.reduce((s, q) => s + (q.estimatedSeconds || 60), 0);
  return {
    jobId,
    config,
    source,
    demoMode: true,
    questions,
    summary: {
      totalQuestions: questions.length,
      requestedQuestions: config.questionCount,
      generatedQuestions: questions.length,
      coveragePercent: 100,
      isComplete: questions.length === config.questionCount,
      byType: {},
      byDifficulty: {},
      byBloom: {},
      withAnswers: questions.length,
      averageConfidence: 55,
      qualityScore: 60,
      estimatedMinutes: Math.max(1, Math.ceil(estSec / 60)),
      warnings: ["Demo mode — sample questions generated locally."],
      topicCoverage: [config.topic || config.subject || "General"].filter(Boolean) as string[],
    },
  };
}
