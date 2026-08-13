import type { AiQuizDesignerState } from "./types";
import { compositionTotal, resolvedLevel, resolvedSubject } from "./defaultState";

/** Builds the internal AI prompt context from wizard answers (never shown raw to instructor). */
export function buildDesignerPromptSummary(state: AiQuizDesignerState) {
  const types = Object.entries(state.composition)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${t.replace(/_/g, " ")}: ${n}`)
    .join(", ");

  const bloom = Object.entries(state.bloomDistribution)
    .filter(([, n]) => n > 0)
    .map(([b, n]) => `${b} ${n}%`)
    .join(", ");

  const media = Object.entries(state.mediaPreferences)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ");

  return {
    title: state.title,
    subject: resolvedSubject(state),
    level: resolvedLevel(state),
    purposes: state.purposes.join(", "),
    sources: state.contentSources.join(", "),
    topic: state.topicDetail || state.pastedText.slice(0, 200),
    questionCount: state.questionCount,
    composition: types,
    difficulty: state.difficulty,
    difficultyMix: state.difficulty === "mixed" ? state.difficultyMix : null,
    bloom,
    media: media || "None",
    estimatedMinutes: Math.max(10, Math.ceil(state.questionCount * 1.3)),
    behaviors: state.behaviors.join(", "),
  };
}

export function validateDesignerStep(step: number, state: AiQuizDesignerState): string | null {
  if (step === 0) {
    if (!state.title.trim()) return "Quiz title is required";
    if (!resolvedSubject(state).trim()) return "Subject is required";
    if (state.purposes.length === 0) return "Select at least one purpose";
  }
  if (step === 1) {
    if (state.contentSources.length === 0) return "Select at least one content source";
  }
  if (step === 2) {
    if (state.contentSources.includes("topic") && !state.topicDetail.trim()) {
      return "Describe the topic for AI to cover";
    }
    const needsFile = state.contentSources.some((s) => ["pdf", "docx", "pptx", "image", "notes", "syllabus"].includes(s));
    if (needsFile && state.files.length === 0) return "Upload at least one document";
    if (state.contentSources.includes("text") && !state.pastedText.trim()) return "Paste source text";
    if (state.contentSources.includes("website") && !state.websiteUrl.trim()) return "Enter a website URL";
    if (state.contentSources.includes("youtube") && !state.youtubeUrl.trim()) return "Enter a YouTube URL";
  }
  if (step === 3) {
    if (compositionTotal(state.composition) !== state.questionCount) {
      return `Question mix must total ${state.questionCount}`;
    }
  }
  return null;
}
