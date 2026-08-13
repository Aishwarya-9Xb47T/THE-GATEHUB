import type { AiQuizDesignerState } from "./types";
import { loadDesignerPreferences } from "./preferences";

export function defaultDesignerState(): AiQuizDesignerState {
  const prefs = loadDesignerPreferences();
  const count = prefs.questionCount ?? 20;
  return {
    title: "",
    subject: "Computer Science",
    customSubject: "",
    educationLevel: prefs.educationLevel ?? "University",
    customEducationLevel: "",
    purposes: ["Practice"],
    contentSources: ["topic"],
    topicDetail: "",
    pastedText: "",
    websiteUrl: "",
    youtubeUrl: "",
    files: [],
    questionCount: count,
    composition: prefs.composition ?? { multiple_choice: Math.min(10, count), true_false: 4, multiple_select: 3, short_answer: 3 },
    difficulty: (prefs.difficulty as AiQuizDesignerState["difficulty"]) ?? "medium",
    difficultyMix: { easy: 40, medium: 40, hard: 20 },
    bloomDistribution: prefs.bloomDistribution ?? {
      Remember: 10,
      Understand: 25,
      Apply: 30,
      Analyze: 20,
      Evaluate: 10,
      Create: 5,
    },
    contentOptions: prefs.contentOptions ?? {
      explanations: true,
      hints: true,
      feedback: true,
      references: false,
      learningObjectives: true,
      images: false,
      diagrams: true,
      tables: false,
      formulas: false,
      codeSnippets: false,
      scenarios: true,
      caseStudies: false,
      misconceptions: false,
      followUp: false,
      discussion: false,
    },
    mediaPreferences: prefs.mediaPreferences ?? {
      images: true,
      infographics: false,
      charts: true,
      diagrams: true,
      flowcharts: false,
      codeScreenshots: false,
      mathEquations: false,
      audio: false,
      videoReferences: false,
    },
    behaviors: prefs.behaviors ?? ["Self-paced Live", "Homework"],
    rules: {
      questionTimer: true,
      wholeQuizTimer: false,
      randomizeQuestions: true,
      randomizeOptions: true,
      showExplanations: true,
      leaderboard: true,
      negativeMarking: false,
      xp: true,
      streaks: false,
      passingScore: 60,
      attempts: 1,
      retake: false,
      certificate: false,
    },
  };
}

export function compositionTotal(composition: Record<string, number>) {
  return Object.values(composition).reduce((a, b) => a + b, 0);
}

/** Scale composition when total question count changes — preserves ratios, fixes rounding. */
export function scaleComposition(composition: Record<string, number>, newTotal: number): Record<string, number> {
  const currentTotal = compositionTotal(composition);
  if (newTotal <= 0) return {};
  if (currentTotal <= 0) return { multiple_choice: newTotal };

  const entries = Object.entries(composition).filter(([, n]) => n > 0);
  if (!entries.length) return { multiple_choice: newTotal };

  const scaled = Object.fromEntries(
    entries.map(([type, count]) => [type, Math.floor((count / currentTotal) * newTotal)])
  );
  let remainder = newTotal - compositionTotal(scaled);
  const order = [...entries].sort((a, b) => b[1] - a[1]);
  let i = 0;
  while (remainder > 0 && order.length) {
    const type = order[i % order.length]![0];
    scaled[type] = (scaled[type] || 0) + 1;
    remainder--;
    i++;
  }
  return scaled;
}

export function bloomTotal(dist: Record<string, number>) {
  return Object.values(dist).reduce((a, b) => a + b, 0);
}

export function resolvedSubject(state: AiQuizDesignerState) {
  return state.subject === "Custom" ? state.customSubject : state.subject;
}

export function resolvedLevel(state: AiQuizDesignerState) {
  return state.educationLevel === "Custom" ? state.customEducationLevel : state.educationLevel;
}
