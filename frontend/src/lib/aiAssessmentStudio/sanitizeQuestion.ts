import type { AiGeneratedQuestion } from "./types";

/** Strip leaked mock/debug labels from question text. */
export function stripMockArtifacts(text: string): string {
  return text
    .replace(/\s*\[Mock:[^\]]*\]/gi, "")
    .replace(/\s*\(Mock:[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeAiQuestion(q: AiGeneratedQuestion): AiGeneratedQuestion {
  return {
    ...q,
    stem: stripMockArtifacts(q.stem),
    warnings: q.warnings?.filter((w) => !/mock provider/i.test(w)),
    options: q.options?.map((o) => ({ ...o, text: stripMockArtifacts(o.text) })),
  };
}

export function sanitizeAiQuestions(questions: AiGeneratedQuestion[]): AiGeneratedQuestion[] {
  return questions.map(sanitizeAiQuestion);
}
