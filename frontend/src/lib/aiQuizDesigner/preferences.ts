const KEY = "gatehub_ai_quiz_designer_prefs";

export interface AiQuizDesignerPreferences {
  difficulty?: string;
  composition?: Record<string, number>;
  questionCount?: number;
  bloomDistribution?: Record<string, number>;
  contentOptions?: Record<string, boolean>;
  mediaPreferences?: Record<string, boolean>;
  behaviors?: string[];
  educationLevel?: string;
}

export function loadDesignerPreferences(): AiQuizDesignerPreferences {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AiQuizDesignerPreferences) : {};
  } catch {
    return {};
  }
}

export function saveDesignerPreferences(prefs: Partial<AiQuizDesignerPreferences>) {
  try {
    const existing = loadDesignerPreferences();
    localStorage.setItem(KEY, JSON.stringify({ ...existing, ...prefs }));
  } catch {
    /* ignore */
  }
}
