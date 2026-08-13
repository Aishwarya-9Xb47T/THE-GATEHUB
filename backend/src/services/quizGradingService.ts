export interface GradedQuestion {
  id: string;
  text: string;
  type: string;
  marks: number;
  explanation?: string | null;
  metadata?: Record<string, unknown> | null;
  options: Array<{ id: string; text: string; isCorrect: boolean; order?: number }>;
}

export interface GradeResult {
  questionId: string;
  userAnswer: unknown;
  isCorrect: boolean;
  correctOptions: string[];
  explanation?: string | null;
  marksEarned: number;
}

function normalizeTextAnswer(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function gradeTextAnswer(question: GradedQuestion, userAnswer: unknown): boolean {
  const normalized = normalizeTextAnswer(userAnswer);
  if (!normalized) return false;

  const metadata = question.metadata as Record<string, unknown> | null;
  let accepted: string[] = [];

  const metaAnswers =
    metadata?.acceptableAnswers ??
    metadata?.correctAnswers ??
    metadata?.answerKey ??
    metadata?.expectedAnswer;

  if (Array.isArray(metaAnswers)) {
    accepted = metaAnswers.map(normalizeTextAnswer).filter(Boolean);
  } else if (typeof metaAnswers === "string" || typeof metaAnswers === "number") {
    accepted = String(metaAnswers).split("|").map(normalizeTextAnswer).filter(Boolean);
  }

  if (accepted.length === 0) {
    accepted = question.options
      .filter((o) => o.isCorrect)
      .map((o) => normalizeTextAnswer(o.text))
      .filter(Boolean);
  }

  const finalAccepted: string[] = [];
  for (const ans of accepted) {
    if (ans.includes("|")) {
      finalAccepted.push(...ans.split("|").map(normalizeTextAnswer).filter(Boolean));
    } else {
      finalAccepted.push(ans);
    }
  }

  return finalAccepted.some((answer) => answer === normalized);
}

export function gradeAnswer(
  question: GradedQuestion,
  userAnswer: unknown
): { isCorrect: boolean; correctOptions: string[] } {
  const correctOptions = question.options.filter((o) => o.isCorrect).map((o) => o.id);

  if (question.type === "multiple_choice" || question.type === "true_false") {
    const isCorrect = typeof userAnswer === "string" && correctOptions.includes(userAnswer);
    return { isCorrect, correctOptions };
  }

  if (question.type === "multiple_select") {
    const submitted = Array.isArray(userAnswer) ? new Set(userAnswer) : new Set<string>();
    const isCorrect =
      correctOptions.length === submitted.size && correctOptions.every((id) => submitted.has(id));
    return { isCorrect, correctOptions };
  }

  if (question.type === "short_answer" || question.type === "fill_blank") {
    return { isCorrect: gradeTextAnswer(question, userAnswer), correctOptions };
  }

  if (question.type === "ordering" || question.type === "sequence") {
    const correctOrder = [...question.options]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((o) => o.id);
    const submitted = Array.isArray(userAnswer) ? (userAnswer as string[]) : [];
    const isCorrect =
      correctOrder.length > 0 &&
      correctOrder.length === submitted.length &&
      correctOrder.every((id, i) => id === submitted[i]);
    return { isCorrect, correctOptions: correctOrder };
  }

  if (question.type === "matching" || question.type === "matrix") {
    const pairs: Array<{ leftId: string; rightId: string }> = [];
    for (let i = 0; i < question.options.length; i += 2) {
      const left = question.options[i];
      const right = question.options[i + 1];
      if (left && right) pairs.push({ leftId: left.id, rightId: right.id });
    }
    const map =
      userAnswer && typeof userAnswer === "object" && !Array.isArray(userAnswer)
        ? (userAnswer as Record<string, string>)
        : {};
    const isCorrect =
      pairs.length > 0 && pairs.every((p) => map[p.leftId] === p.rightId);
    return { isCorrect, correctOptions: pairs.map((p) => p.rightId) };
  }

  if (question.type === "hotspot") {
    const meta = question.metadata ?? {};
    const correctLabel = String(
      meta.correctHotspot ||
        question.options.find((o) => o.isCorrect)?.text ||
        ""
    ).trim();
    const normalized = normalizeTextAnswer(userAnswer);
    const isCorrect = Boolean(correctLabel) && normalized === normalizeTextAnswer(correctLabel);
    return { isCorrect, correctOptions: correctLabel ? [correctLabel] : correctOptions };
  }

  if (question.type === "numerical") {
    const meta = question.metadata ?? {};
    const expected = String(meta.numericAnswer ?? "").trim();
    const tolerance = Number(meta.numericTolerance ?? 0);
    const submitted = String(userAnswer ?? "").trim();
    if (expected === "" || submitted === "") return { isCorrect: false, correctOptions: expected ? [expected] : [] };
    const diff = Math.abs(Number(expected) - Number(submitted));
    const isCorrect = !isNaN(diff) && diff <= Math.abs(tolerance);
    return { isCorrect, correctOptions: expected ? [expected] : correctOptions };
  }

  // Dropdown = same as MCQ
  if (question.type === "dropdown") {
    const isCorrect = typeof userAnswer === "string" && correctOptions.includes(userAnswer);
    return { isCorrect, correctOptions };
  }

  // Essay / Poll — no auto-grading, answer stored but not auto-scored
  if (question.type === "essay" || question.type === "poll") {
    return { isCorrect: false, correctOptions: [] };
  }

  return { isCorrect: false, correctOptions };
}

export function gradeQuizAnswers(
  questions: GradedQuestion[],
  answers: Record<string, unknown>
): { score: number; results: GradeResult[] } {
  let score = 0;
  const results = questions.map((q) => {
    const userAnswer = answers[q.id];
    const { isCorrect, correctOptions } = gradeAnswer(q, userAnswer);
    const marksEarned = isCorrect ? q.marks : 0;
    if (isCorrect) score += q.marks;

    return {
      questionId: q.id,
      userAnswer,
      isCorrect,
      correctOptions,
      explanation: q.explanation,
      marksEarned,
    };
  });

  return { score, results };
}

export function calculateLivePoints(
  isCorrect: boolean,
  responseTimeMs: number,
  timerSeconds: number,
  streak: number,
  settings: {
    correctnessWeight: number;
    speedWeight: number;
    streakBonus: number;
  }
): number {
  if (!isCorrect) return 0;

  const timerMs = timerSeconds * 1000;
  const speedRatio = Math.max(0, 1 - responseTimeMs / timerMs);
  const speedBonus = Math.round(settings.speedWeight * speedRatio);
  const streakBonus = streak > 1 ? settings.streakBonus * (streak - 1) : 0;

  return settings.correctnessWeight + speedBonus + streakBonus;
}
