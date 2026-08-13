/**
 * Resolves question order and index → question identity.
 * Implementation reads frozen order from config (Phase 5 migration).
 */
export interface QuestionRef {
  id: string;
  index: number;
}

export interface QuestionProgression {
  /** Total questions in this deployment */
  readonly questionCount: number;

  /** Zero-based index for question id, or -1 if unknown */
  indexOf(questionId: string): number;

  /** Question at index, or null if out of range */
  at(index: number): QuestionRef | null;

  /** Next index after current, or null if complete */
  nextAfter(currentIndex: number): number | null;

  /** Whether index is the last question */
  isLast(index: number): boolean;
}
