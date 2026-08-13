import type { AiQuizDesignerDraft, AiQuizDesignerState } from "./types";

const DRAFT_KEY = "gatehub_ai_quiz_designer_draft";
const DRAFT_VERSION = 1;

export function saveDesignerDraft(step: number, state: AiQuizDesignerState) {
  try {
    const { files: _files, ...rest } = state;
    const draft: AiQuizDesignerDraft = {
      version: DRAFT_VERSION,
      step,
      state: rest,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function loadDesignerDraft(): AiQuizDesignerDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as AiQuizDesignerDraft;
    if (draft.version !== DRAFT_VERSION) return null;
    return draft;
  } catch {
    return null;
  }
}

export function clearDesignerDraft() {
  localStorage.removeItem(DRAFT_KEY);
}
