const STORAGE_KEY = "gatehub_ai_template_prefs";

export interface AiTemplatePreferences {
  audience?: string;
  difficulty?: string;
  questionCount?: number;
  composition?: Record<string, number>;
  bloomLevel?: string;
  media?: Record<string, boolean>;
  modes?: string[];
  timerMode?: string;
  scoring?: Record<string, unknown>;
}

export function loadAiTemplatePreferences(): AiTemplatePreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AiTemplatePreferences) : {};
  } catch {
    return {};
  }
}

export function saveAiTemplatePreferences(prefs: AiTemplatePreferences) {
  try {
    const existing = loadAiTemplatePreferences();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...prefs }));
  } catch {
    /* ignore */
  }
}

export const AI_QUESTION_TYPES = [
  { id: "multiple_choice", label: "MCQ" },
  { id: "multiple_select", label: "Multiple Select" },
  { id: "true_false", label: "True / False" },
  { id: "fill_blank", label: "Fill Blank" },
  { id: "short_answer", label: "Short Answer" },
  { id: "essay", label: "Essay" },
  { id: "matching", label: "Matching" },
  { id: "ordering", label: "Ordering" },
  { id: "hotspot", label: "Hotspot" },
  { id: "poll", label: "Poll" },
  { id: "numerical", label: "Numerical" },
  { id: "matrix", label: "Matrix" },
  { id: "coding", label: "Coding" },
] as const;

export const AI_AUDIENCES = ["School", "College", "Corporate", "Certification", "Training", "Interview"] as const;

export interface AiWizardState {
  title: string;
  subject: string;
  description: string;
  audience: string;
  difficulty: string;
  questionCount: number;
  composition: Record<string, number>;
  bloomLevel: string;
  media: {
    images: boolean;
    diagrams: boolean;
    tables: boolean;
    formulas: boolean;
    codeSnippets: boolean;
    explanations: boolean;
    hints: boolean;
    references: boolean;
  };
  modes: string[];
  timerMode: "per_question" | "whole_quiz" | "none";
  scoring: {
    mode: string;
    negativeMarking: boolean;
    xp: boolean;
    leaderboard: boolean;
  };
  saveAs: "template" | "quiz" | "both";
  category: string;
}

export function defaultAiWizardState(prefs?: AiTemplatePreferences): AiWizardState {
  const count = prefs?.questionCount ?? 20;
  const composition = prefs?.composition ?? { multiple_choice: count };
  return {
    title: "",
    subject: "",
    description: "",
    audience: prefs?.audience ?? "College",
    difficulty: prefs?.difficulty ?? "medium",
    questionCount: count,
    composition,
    bloomLevel: prefs?.bloomLevel ?? "Mixed",
    media: {
      images: prefs?.media?.images ?? false,
      diagrams: prefs?.media?.diagrams ?? false,
      tables: prefs?.media?.tables ?? false,
      formulas: prefs?.media?.formulas ?? false,
      codeSnippets: prefs?.media?.codeSnippets ?? false,
      explanations: prefs?.media?.explanations ?? true,
      hints: prefs?.media?.hints ?? true,
      references: prefs?.media?.references ?? false,
    },
    modes: prefs?.modes ?? ["live", "homework"],
    timerMode: (prefs?.timerMode as AiWizardState["timerMode"]) ?? "per_question",
    scoring: {
      mode: "default",
      negativeMarking: false,
      xp: true,
      leaderboard: true,
      ...(prefs?.scoring as object),
    },
    saveAs: "both",
    category: "Training",
  };
}

export function compositionTotal(composition: Record<string, number>) {
  return Object.values(composition).reduce((a, b) => a + b, 0);
}
