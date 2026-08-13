export interface QuizValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
  questionId?: string;
}

export interface QuizValidationResult {
  valid: boolean;
  errors: QuizValidationIssue[];
  warnings: QuizValidationIssue[];
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

function normalizeStem(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

export function validateQuizContent(quiz: {
  title: string;
  questions: Array<{
    id: string;
    text: string;
    type: string;
    difficulty?: string | null;
    explanation?: string | null;
    metadata?: unknown;
    options?: Array<{ text: string; isCorrect: boolean }>;
  }>;
}): QuizValidationResult {
  const errors: QuizValidationIssue[] = [];
  const warnings: QuizValidationIssue[] = [];
  const difficultyDistribution: Record<string, number> = {};
  const bloomDistribution: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  let missingExplanations = 0;
  let missingAnswers = 0;
  let mediaCount = 0;
  const stems = new Map<string, string>();
  let duplicateCount = 0;

  if (!quiz.title?.trim()) {
    errors.push({ level: "error", code: "NO_TITLE", message: "Quiz title is required" });
  }

  if (!quiz.questions.length) {
    errors.push({ level: "error", code: "NO_QUESTIONS", message: "Add at least one question" });
  }

  for (const q of quiz.questions) {
    typeCounts[q.type] = (typeCounts[q.type] || 0) + 1;
    const diff = q.difficulty || "medium";
    difficultyDistribution[diff] = (difficultyDistribution[diff] || 0) + 1;

    const meta = (q.metadata || {}) as Record<string, unknown>;
    const bloom = String(meta.bloomLevel || "L2");
    bloomDistribution[bloom] = (bloomDistribution[bloom] || 0) + 1;
    if (meta.media || meta.imageUrl || meta.videoUrl) mediaCount++;

    if (!q.text?.trim()) {
      errors.push({ level: "error", code: "EMPTY_QUESTION", message: "Question text is empty", questionId: q.id });
    }

    const norm = normalizeStem(q.text || "");
    if (norm && stems.has(norm)) {
      duplicateCount++;
      warnings.push({
        level: "warning",
        code: "DUPLICATE",
        message: "Possible duplicate question",
        questionId: q.id,
      });
    }
    if (norm) stems.set(norm, q.id);

    const needsOptions = ["multiple_choice", "multiple_select", "true_false"].includes(q.type);
    if (needsOptions) {
      const hasCorrect = q.options?.some((o) => o.isCorrect);
      if (!hasCorrect) {
        missingAnswers++;
        errors.push({
          level: "error",
          code: "NO_CORRECT_ANSWER",
          message: "No correct answer marked",
          questionId: q.id,
        });
      }
    }

    if (!q.explanation?.trim()) {
      missingExplanations++;
      warnings.push({
        level: "warning",
        code: "NO_EXPLANATION",
        message: "Explanation recommended",
        questionId: q.id,
      });
    }

    const text = q.text || "";
    if (text.includes("![](") && text.includes("broken")) {
      warnings.push({ level: "warning", code: "BROKEN_IMAGE", message: "Check image URLs", questionId: q.id });
    }
  }

  const estimatedMinutes = Math.max(1, Math.ceil(quiz.questions.length * 0.75));

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      questionCount: quiz.questions.length,
      estimatedMinutes,
      difficultyDistribution,
      bloomDistribution,
      typeCounts,
      missingExplanations,
      missingAnswers,
      duplicateCount,
      mediaCount,
    },
  };
}
