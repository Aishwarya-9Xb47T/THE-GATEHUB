export interface QuizPreviewResult {
  score: number;
  totalMarks: number;
  results: Array<{ questionId: string; isCorrect: boolean }>;
}

/** Grade a quiz locally for instructor preview (no persistence). */
export function gradeQuizLocally(
  quiz: { questions: Array<{ id: string; marks?: number; options?: Array<{ id: string; isCorrect: boolean }> }> },
  answers: Record<string, unknown>
): QuizPreviewResult {
  const results: QuizPreviewResult["results"] = [];
  let score = 0;
  let totalMarks = 0;

  for (const q of quiz.questions) {
    const marks = q.marks ?? 1;
    totalMarks += marks;
    const answer = answers[q.id];
    const correctIds = (q.options ?? []).filter((o) => o.isCorrect).map((o) => o.id);

    let isCorrect = false;
    if (Array.isArray(answer)) {
      const selected = [...answer].sort().join(",");
      const expected = [...correctIds].sort().join(",");
      isCorrect = selected === expected;
    } else if (typeof answer === "string") {
      isCorrect = correctIds.length === 1 && correctIds[0] === answer;
    }

    if (isCorrect) score += marks;
    results.push({ questionId: q.id, isCorrect });
  }

  return { score, totalMarks, results };
}
