export const BANK_QUESTION_STATUSES = [
  "draft",
  "pending_review",
  "needs_changes",
  "approved",
  "published",
  "archived",
] as const;
export type BankQuestionStatus = (typeof BANK_QUESTION_STATUSES)[number];

export const BANK_QUESTION_SOURCES = ["manual", "ai", "imported", "migrated"] as const;
export type BankQuestionSource = (typeof BANK_QUESTION_SOURCES)[number];

export const BANK_QUESTION_TYPES = [
  "multiple_choice",
  "multiple_select",
  "true_false",
  "fill_blank",
  "numerical",
  "matching",
  "ordering",
  "drag_drop",
  "essay",
  "case_study",
  "scenario",
  "coding",
  "debugging",
  "predict_output",
  "sql",
  "diagram",
  "image_based",
  "video_based",
  "audio_based",
  "research_analysis",
] as const;
export type BankQuestionType = (typeof BANK_QUESTION_TYPES)[number];

export const BLOOM_LEVELS = ["L1", "L2", "L3", "L4", "L5", "L6"] as const;

export const COLLECTION_KINDS = ["folder", "smart", "template", "favorites"] as const;

export interface BankQuestionOptionInput {
  id?: string;
  text: string;
  isCorrect: boolean;
  order?: number;
}

export interface CreateBankQuestionInput {
  stem: string;
  type: string;
  difficulty?: string;
  bloomLevel?: string;
  status?: string;
  source?: string;
  language?: string;
  topic?: string;
  subtopic?: string;
  explanation?: string;
  hints?: string[];
  metadata?: Record<string, unknown>;
  tags?: string[];
  references?: unknown[];
  courseId?: string;
  learningUniverseId?: string;
  legacyQuestionId?: string;
  estimatedSeconds?: number;
  options?: BankQuestionOptionInput[];
}

export interface BankQuestionFilters {
  q?: string;
  status?: string;
  type?: string;
  difficulty?: string;
  bloomLevel?: string;
  source?: string;
  courseId?: string;
  topic?: string;
  tag?: string;
  language?: string;
  page?: number;
  limit?: number;
}

export function snapshotQuestion(q: {
  stem: string;
  type: string;
  difficulty: string | null;
  bloomLevel: string | null;
  explanation: string | null;
  hints: unknown;
  metadata: unknown;
  tags: unknown;
  options: Array<{ text: string; isCorrect: boolean; order: number }>;
}) {
  return {
    stem: q.stem,
    type: q.type,
    difficulty: q.difficulty,
    bloomLevel: q.bloomLevel,
    explanation: q.explanation,
    hints: q.hints,
    metadata: q.metadata,
    tags: q.tags,
    options: q.options,
  };
}

export function runBasicAIValidation(question: {
  stem: string;
  type: string;
  options: Array<{ text: string; isCorrect: boolean }>;
  explanation?: string | null;
}) {
  const checks: Record<string, { passed: boolean; message?: string }> = {};
  checks.grammar = { passed: question.stem.trim().length >= 10, message: "Stem too short" };
  checks.correctAnswer = {
    passed: question.options.some((o) => o.isCorrect),
    message: "No correct answer marked",
  };
  checks.distractors = {
    passed: question.options.filter((o) => !o.isCorrect).length >= 2,
    message: "Need at least 2 distractors for MCQ",
  };
  checks.explanation = {
    passed: !!question.explanation?.trim(),
    message: "Explanation recommended",
  };
  const failed = Object.values(checks).filter((c) => !c.passed);
  return {
    status: failed.length === 0 ? "passed" : "failed",
    checks,
  };
}
