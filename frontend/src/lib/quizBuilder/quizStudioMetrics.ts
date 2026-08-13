import type { QuizEditorData, QuizQuestion } from "./types";
import { validateQuestionLive, questionStatus } from "./questionLiveValidation";

export function questionCompletionPercent(q: QuizQuestion): number {
  let score = 0;
  if (q.text.trim()) score += 40;
  if (q.explanation?.trim()) score += 20;
  if (q.options.some((o) => o.text.trim())) score += 20;
  if (q.type !== "multiple_choice" && q.type !== "multiple_select" || q.options.some((o) => o.isCorrect && o.text.trim())) {
    score += 20;
  }
  return Math.min(100, score);
}

export function computeStudioMetrics(quiz: QuizEditorData, validationValid?: boolean) {
  const questions = quiz.questions;
  const totalMarks = questions.reduce((s, q) => s + (q.marks || 1), 0);
  const estimatedMinutes = Math.max(1, Math.ceil(questions.reduce((s, q) => s + (q.estimatedSeconds || 45), 0) / 60));
  const completions = questions.map(questionCompletionPercent);
  const avgCompletion = completions.length
    ? Math.round(completions.reduce((a, b) => a + b, 0) / completions.length)
    : 0;

  let validCount = 0;
  for (const q of questions) {
    const issues = validateQuestionLive(q);
    if (!issues.some((i) => i.level === "error")) validCount++;
  }
  const validationScore = questions.length ? Math.round((validCount / questions.length) * 100) : 100;

  return {
    questionCount: questions.length,
    estimatedMinutes,
    totalMarks,
    completionPercent: avgCompletion,
    validationScore,
    isValid: validationValid ?? validationScore === 100,
  };
}

export function getQuestionMeta(q: QuizQuestion) {
  const issues = validateQuestionLive(q);
  const status = questionStatus(q, issues);
  const completion = questionCompletionPercent(q);
  const hasErrors = issues.some((i) => i.level === "error");
  const meta = q.metadata as Record<string, unknown>;
  return { issues, status, completion, hasErrors, meta };
}
