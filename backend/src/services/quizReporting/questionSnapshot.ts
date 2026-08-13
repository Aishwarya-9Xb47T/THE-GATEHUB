/**
 * Immutable question content captured at answer / attempt time
 * so later quiz edits cannot corrupt historical reports.
 */

export type QuestionSnapshotOption = {
  id: string;
  text: string;
  isCorrect: boolean;
  order: number;
};

export type QuestionSnapshot = {
  questionId: string;
  order: number;
  text: string;
  type: string;
  marks: number;
  negativeMarks: number;
  difficulty: string | null;
  bloomLevel: string | null;
  hint: string | null;
  explanation: string | null;
  metadata: unknown;
  options: QuestionSnapshotOption[];
};

type QuestionLike = {
  id: string;
  order: number;
  text: string;
  type: string;
  marks: number;
  negativeMarks: number;
  difficulty?: string | null;
  bloomLevel?: string | null;
  hint?: string | null;
  explanation?: string | null;
  metadata?: unknown;
  options?: Array<{
    id: string;
    text: string;
    isCorrect: boolean;
    order: number;
  }>;
};

export function buildQuestionSnapshot(q: QuestionLike): QuestionSnapshot {
  return {
    questionId: q.id,
    order: q.order ?? 0,
    text: q.text || "",
    type: q.type || "multiple_choice",
    marks: typeof q.marks === "number" ? q.marks : 1,
    negativeMarks: typeof q.negativeMarks === "number" ? q.negativeMarks : 0,
    difficulty: q.difficulty ?? null,
    bloomLevel: q.bloomLevel ?? null,
    hint: q.hint ?? null,
    explanation: q.explanation ?? null,
    metadata: q.metadata ?? null,
    options: (q.options || [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: Boolean(o.isCorrect),
        order: o.order ?? 0,
      })),
  };
}

export function parseQuestionSnapshot(raw: unknown): QuestionSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<QuestionSnapshot>;
  if (!s.questionId || typeof s.text !== "string") return null;
  return {
    questionId: String(s.questionId),
    order: Number(s.order ?? 0),
    text: String(s.text || ""),
    type: String(s.type || "multiple_choice"),
    marks: Number(s.marks ?? 1),
    negativeMarks: Number(s.negativeMarks ?? 0),
    difficulty: s.difficulty ?? null,
    bloomLevel: s.bloomLevel ?? null,
    hint: s.hint ?? null,
    explanation: s.explanation ?? null,
    metadata: s.metadata ?? null,
    options: Array.isArray(s.options)
      ? s.options.map((o, i) => ({
          id: String(o.id || `opt_${i}`),
          text: String(o.text || ""),
          isCorrect: Boolean(o.isCorrect),
          order: Number(o.order ?? i),
        }))
      : [],
  };
}
