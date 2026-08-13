export interface QuizListItem {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  visibility: string;
  pinned: boolean;
  favorited: boolean;
  archivedAt: string | null;
  coverGradient: string;
  bannerUrl?: string | null;
  coverImageUrl?: string | null;
  thumbnailUrl?: string | null;
  theme?: string | null;
  questionCount: number;
  estimatedMinutes: number;
  difficulty: string;
  bloomSummary: string;
  questionTypes: string[];
  timesUsed: number;
  studentAttempts: number;
  averageScore: number;
  updatedAt: string;
  createdAt: string;
  course: { id: string; title: string } | null;
  settings: Record<string, unknown>;
}

export interface QuizQuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

export interface QuizQuestion {
  id: string;
  text: string;
  type: string;
  difficulty: string | null;
  marks: number;
  negativeMarks?: number;
  hint?: string | null;
  referenceLinks?: string | null;
  order: number;
  explanation: string | null;
  hints: string[];
  tags: string[];
  bloomLevel: string | null;
  estimatedSeconds: number | null;
  sectionId: string | null;
  media: unknown;
  metadata: Record<string, unknown>;
  options: QuizQuestionOption[];
}

export interface QuizEditorData {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  visibility: string;
  pinned: boolean;
  favorited: boolean;
  metadata: Record<string, unknown>;
  settings: QuizSettings;
  sections: QuizSection[];
  course: { id: string; title: string } | null;
  questions: QuizQuestion[];
  version: number;
}

export interface QuizSection {
  id: string;
  title: string;
}

export interface QuizSettings {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  randomSubset: number;
  timePerQuestion: number;
  showExplanations: boolean;
  passingScore: number;
  maxAttempts: number;
  negativeMarking: boolean;
}

export interface QuizValidationResult {
  valid: boolean;
  errors: Array<{ level: string; code: string; message: string; questionId?: string }>;
  warnings: Array<{ level: string; code: string; message: string; questionId?: string }>;
  summary: {
    questionCount: number;
    estimatedMinutes: number;
    difficultyDistribution: Record<string, number>;
    bloomDistribution: Record<string, number>;
    typeCounts: Record<string, number>;
    missingExplanations: number;
    missingAnswers: number;
    duplicateCount: number;
    mediaCount: number;
  };
}

export const BUILDER_QUESTION_TYPES = [
  { id: "multiple_choice", label: "Single Choice (MCQ)" },
  { id: "multiple_select", label: "Multiple Select (MSQ)" },
  { id: "true_false", label: "True / False" },
  { id: "fill_blank", label: "Fill in the Blank" },
  { id: "numerical", label: "Numerical" },
  { id: "matching", label: "Match the Following" },
  { id: "ordering", label: "Ordering" },
  { id: "sequence", label: "Sequence" },
  { id: "poll", label: "Poll" },
  { id: "short_answer", label: "Short Answer" },
  { id: "essay", label: "Essay" },
  { id: "image_based", label: "Image Based / Image Select" },
  { id: "video_based", label: "Video Based" },
  { id: "audio_based", label: "Audio Based" },
  { id: "hotspot", label: "Hotspot" },
  { id: "matrix", label: "Matrix" },
  { id: "coding", label: "Coding" },
  { id: "debugging", label: "Debugging" },
  { id: "predict_output", label: "Predict Output" },
  { id: "sql", label: "SQL" },
  { id: "case_study", label: "Case Study" },
  { id: "scenario", label: "Scenario" },
] as const;

export const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  BUILDER_QUESTION_TYPES.map((t) => [t.id, t.label])
);
