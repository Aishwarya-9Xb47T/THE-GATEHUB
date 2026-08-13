import type { AiGeneratedQuestion, AiGenerationPreview } from "@/lib/aiAssessmentStudio/types";

export interface DifficultyMix {
  easy: number;
  medium: number;
  hard: number;
}

export interface QuizRules {
  questionTimer: boolean;
  wholeQuizTimer: boolean;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  showExplanations: boolean;
  leaderboard: boolean;
  negativeMarking: boolean;
  xp: boolean;
  streaks: boolean;
  passingScore: number;
  attempts: number;
  retake: boolean;
  certificate: boolean;
}

export interface AiQuizDesignerState {
  title: string;
  subject: string;
  customSubject: string;
  educationLevel: string;
  customEducationLevel: string;
  purposes: string[];
  contentSources: string[];
  topicDetail: string;
  pastedText: string;
  websiteUrl: string;
  youtubeUrl: string;
  files: File[];
  questionCount: number;
  composition: Record<string, number>;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  difficultyMix: DifficultyMix;
  bloomDistribution: Record<string, number>;
  contentOptions: Record<string, boolean>;
  mediaPreferences: Record<string, boolean>;
  behaviors: string[];
  rules: QuizRules;
}

export interface AiQuizDesignerDraft {
  version: number;
  step: number;
  state: Omit<AiQuizDesignerState, "files">;
  savedAt: string;
}

export interface DesignerGenerationResult {
  jobId: string;
  preview: AiGenerationPreview;
}

export type DesignerQuestions = AiGeneratedQuestion[];
