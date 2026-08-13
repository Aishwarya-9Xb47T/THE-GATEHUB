import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { logger } from "../../utils/logger.js";

// ─── Live-Supported Question Types ───────────────────────────────────────────
export const LIVE_SUPPORTED_TYPES = new Set([
  "multiple_choice",
  "multiple_select",
  "true_false",
  "short_answer",
  "fill_blank",
  "poll",
  "ordering",
  "sequence",
  "matching",
  "matrix",
  "hotspot",
  "image_based",
  "video_based",
  "audio_based",
  "numerical",
  "essay",
  "dropdown",
]);

// ─── Types ────────────────────────────────────────────────────────────────────
export interface LiveQuizValidationError {
  rule: string;
  questionId: string;
  field: string;
  expected: string;
  actual: string;
  message: string;
  severity: "error" | "warning";
  autoFixable: boolean;
  autoFixAction?: string;
}

export interface LiveQuizValidationResult {
  ready: boolean;
  errors: LiveQuizValidationError[];
  warnings: LiveQuizValidationError[];
}

// ─── Canonical field for short-answer correct answers ─────────────────────────
// SINGLE SOURCE OF TRUTH: metadata.acceptableAnswers (string[])
// All importers, builder, validator, and grader use this field.
// Legacy field fallbacks: correctAnswers, answerKey, expectedAnswer, answer

export function extractAcceptableAnswers(metadata: Record<string, unknown>): string[] {
  const raw =
    metadata.acceptableAnswers ??
    metadata.correctAnswers ??
    metadata.answerKey ??
    metadata.expectedAnswer ??
    metadata.answer;

  if (Array.isArray(raw)) {
    return raw.map((a) => String(a).trim()).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw.split("|").map((a) => a.trim()).filter(Boolean);
  }
  if (typeof raw === "number" && !isNaN(raw)) {
    return [String(raw)];
  }
  return [];
}

// ─── Per-type Validation ──────────────────────────────────────────────────────
type RawQuestion = {
  id: string;
  text: string;
  type: string;
  order: number;
  metadata: unknown;
  options: Array<{ text: string; isCorrect: boolean; order?: number }>;
};

function validateQuestion(q: RawQuestion, index: number): LiveQuizValidationError[] {
  const errors: LiveQuizValidationError[] = [];
  const label = `Q${index + 1}`;
  const meta = (q.metadata as Record<string, unknown>) || {};

  // ── All types: must have question text ──
  if (!q.text?.trim()) {
    errors.push({
      rule: "Question text is required",
      questionId: q.id,
      field: "text",
      expected: "Non-empty string",
      actual: "(empty)",
      message: `${label}: Question text is missing`,
      severity: "error",
      autoFixable: false,
    });
  }

  switch (q.type) {
    // ─── MCQ ──────────────────────────────────────────────────
    case "multiple_choice":
    case "dropdown": {
      const filled = q.options.filter((o) => o.text?.trim());
      if (filled.length < 2) {
        errors.push({
          rule: "Must have at least 2 options with text",
          questionId: q.id,
          field: "options",
          expected: ">= 2 options",
          actual: `${filled.length} option(s)`,
          message: `${label}: Needs at least 2 options`,
          severity: "error",
          autoFixable: false,
        });
      }
      const correctCount = q.options.filter((o) => o.isCorrect).length;
      if (correctCount !== 1) {
        errors.push({
          rule: "Exactly one correct option must be selected",
          questionId: q.id,
          field: "options.isCorrect",
          expected: "Exactly 1 correct option",
          actual: `${correctCount} correct option(s)`,
          message: `${label}: Must have exactly one correct option`,
          severity: "error",
          autoFixable: correctCount === 0 && filled.length > 0,
          autoFixAction: "mark_first_correct",
        });
      }
      break;
    }

    // ─── Multiple Select ──────────────────────────────────────
    case "multiple_select": {
      const filled = q.options.filter((o) => o.text?.trim());
      if (filled.length < 2) {
        errors.push({
          rule: "Must have at least 2 options with text",
          questionId: q.id,
          field: "options",
          expected: ">= 2 options",
          actual: `${filled.length} option(s)`,
          message: `${label}: Needs at least 2 options`,
          severity: "error",
          autoFixable: false,
        });
      }
      const correctCount = q.options.filter((o) => o.isCorrect).length;
      if (correctCount < 1) {
        errors.push({
          rule: "At least one correct option must be selected",
          questionId: q.id,
          field: "options.isCorrect",
          expected: ">= 1 correct option",
          actual: "0 correct options",
          message: `${label}: No correct option marked`,
          severity: "error",
          autoFixable: filled.length > 0,
          autoFixAction: "mark_first_correct",
        });
      }
      break;
    }

    // ─── True/False ───────────────────────────────────────────
    case "true_false": {
      if (q.options.length < 2) {
        errors.push({
          rule: "Must have at least 2 options (True and False)",
          questionId: q.id,
          field: "options",
          expected: ">= 2 options",
          actual: `${q.options.length} option(s)`,
          message: `${label}: True/False needs two options`,
          severity: "error",
          autoFixable: true,
          autoFixAction: "create_true_false_options",
        });
      }
      const correctCount = q.options.filter((o) => o.isCorrect).length;
      if (correctCount !== 1) {
        errors.push({
          rule: "Exactly one of True/False must be selected as correct",
          questionId: q.id,
          field: "options.isCorrect",
          expected: "Exactly 1 correct option",
          actual: `${correctCount} correct option(s)`,
          message: `${label}: Must mark exactly one of True/False as correct`,
          severity: "error",
          autoFixable: correctCount === 0,
          autoFixAction: "mark_true_correct",
        });
      }
      break;
    }

    // ─── Short Answer / Fill Blank ────────────────────────────
    // IMPORTANT: NEVER validate options.isCorrect for short answer.
    // The correct answer lives in metadata.acceptableAnswers (canonical).
    // If no answer is configured it is a WARNING not a BLOCKER —
    // the quiz can still run; answers will need manual grading.
    case "short_answer":
    case "fill_blank": {
      const answers = extractAcceptableAnswers(meta);
      // Also check legacy: options with isCorrect=true
      const legacyCorrect = q.options.filter((o) => o.isCorrect && o.text?.trim());

      if (answers.length === 0 && legacyCorrect.length === 0) {
        errors.push({
          rule: "Short answer should have at least one acceptable answer for auto-grading",
          questionId: q.id,
          field: "metadata.acceptableAnswers",
          expected: "Array of accepted answer strings",
          actual: "Not configured",
          message: `${label}: No answer key set — answers will require manual grading`,
          severity: "warning",  // WARNING not blocking ERROR
          autoFixable: false,
        });
      }
      break;
    }

    // ─── Essay ────────────────────────────────────────────────
    // Essay never needs options or answer key.
    case "essay": {
      break;
    }

    // ─── Poll ─────────────────────────────────────────────────
    case "poll": {
      const filled = q.options.filter((o) => o.text?.trim());
      if (filled.length < 2) {
        errors.push({
          rule: "Poll must have at least 2 options",
          questionId: q.id,
          field: "options",
          expected: ">= 2 options",
          actual: `${filled.length} option(s)`,
          message: `${label}: Poll needs at least 2 options`,
          severity: "error",
          autoFixable: false,
        });
      }
      // Polls don't need a correct answer — scoring is not applicable
      break;
    }

    // ─── Ordering / Sequence ──────────────────────────────────
    case "ordering":
    case "sequence": {
      const filled = q.options.filter((o) => o.text?.trim());
      if (filled.length < 2) {
        errors.push({
          rule: "Ordering/Sequence must have at least 2 items",
          questionId: q.id,
          field: "options",
          expected: ">= 2 items",
          actual: `${filled.length} item(s)`,
          message: `${label}: Ordering needs at least 2 items`,
          severity: "error",
          autoFixable: false,
        });
      }
      break;
    }

    // ─── Matching / Matrix ────────────────────────────────────
    case "matching":
    case "matrix": {
      if (q.options.length < 4 || q.options.length % 2 !== 0) {
        errors.push({
          rule: "Matching/Matrix must have even number of options >= 4 (at least 2 pairs)",
          questionId: q.id,
          field: "options",
          expected: "Even count >= 4",
          actual: `${q.options.length} option(s)`,
          message: `${label}: Matching needs at least 2 complete pairs`,
          severity: "error",
          autoFixable: false,
        });
      }
      break;
    }

    // ─── Hotspot ──────────────────────────────────────────────
    case "hotspot": {
      const hotspotConfig = meta.hotspot ?? meta.coordinates ?? meta.hotspotRect ?? meta.hotspotArea;
      if (!hotspotConfig) {
        errors.push({
          rule: "Hotspot must have target coordinates configured",
          questionId: q.id,
          field: "metadata.hotspot",
          expected: "Hotspot coordinates/area",
          actual: "Not configured",
          message: `${label}: Hotspot area not defined`,
          severity: "error",
          autoFixable: false,
        });
      }
      break;
    }

    // ─── Numerical ────────────────────────────────────────────
    case "numerical": {
      const numAns = meta.numericAnswer;
      if (numAns === undefined || numAns === null || numAns === "") {
        errors.push({
          rule: "Numerical question must have a correct value",
          questionId: q.id,
          field: "metadata.numericAnswer",
          expected: "Numeric value",
          actual: "Not configured",
          message: `${label}: Correct numeric answer not set`,
          severity: "error",
          autoFixable: false,
        });
      }
      break;
    }

    // ─── Image/Video/Audio based ──────────────────────────────
    case "image_based":
    case "video_based":
    case "audio_based": {
      const mediaUrl = meta.mediaUrl ?? meta.imageUrl ?? meta.videoUrl ?? meta.audioUrl;
      if (!mediaUrl) {
        errors.push({
          rule: `${q.type} question must have a media URL`,
          questionId: q.id,
          field: `metadata.mediaUrl`,
          expected: "URL string",
          actual: "Not configured",
          message: `${label}: No media URL set`,
          severity: "warning",
          autoFixable: false,
        });
      }
      // Also validate like MCQ for options
      const correctCount = q.options.filter((o) => o.isCorrect).length;
      if (q.options.length >= 2 && correctCount === 0) {
        errors.push({
          rule: "At least one correct option must be marked",
          questionId: q.id,
          field: "options.isCorrect",
          expected: ">= 1 correct option",
          actual: "0 correct options",
          message: `${label}: No correct answer marked`,
          severity: "error",
          autoFixable: false,
        });
      }
      break;
    }

    default: {
      // Unknown type — warn but don't block
      errors.push({
        rule: `Question type "${q.type}" may not be supported in live quiz`,
        questionId: q.id,
        field: "type",
        expected: "Supported question type",
        actual: q.type,
        message: `${label}: Unknown type "${q.type}"`,
        severity: "warning",
        autoFixable: false,
      });
      break;
    }
  }

  return errors;
}

// ─── Main Validation Function ─────────────────────────────────────────────────
export function validateQuizForLive(questions: RawQuestion[]): LiveQuizValidationResult {
  if (questions.length === 0) {
    return {
      ready: false,
      errors: [{
        rule: "Quiz must have at least one question",
        questionId: "",
        field: "questions",
        expected: ">= 1 question",
        actual: "0 questions",
        message: "Quiz has no questions",
        severity: "error",
        autoFixable: false,
      }],
      warnings: [],
    };
  }

  const allIssues: LiveQuizValidationError[] = [];
  for (const [index, q] of questions.entries()) {
    allIssues.push(...validateQuestion(q, index));
  }

  const errors = allIssues.filter((e) => e.severity === "error");
  const warnings = allIssues.filter((e) => e.severity === "warning");

  return {
    ready: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Auto-Fix Engine ──────────────────────────────────────────────────────────
export async function autoFixQuizForLive(quizId: string): Promise<{ fixed: number; actions: string[] }> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!quiz) throw new AppError(404, "Quiz not found");

  const result = validateQuizForLive(quiz.questions);
  const fixableErrors = result.errors.filter((e) => e.autoFixable);
  const actions: string[] = [];
  let fixed = 0;

  for (const err of fixableErrors) {
    const q = quiz.questions.find((x) => x.id === err.questionId);
    if (!q) continue;

    try {
      if (err.autoFixAction === "mark_first_correct") {
        const firstFilled = q.options.find((o) => o.text?.trim());
        if (firstFilled) {
          // Reset all to false, then mark first as true
          await prisma.$transaction([
            prisma.option.updateMany({ where: { questionId: q.id }, data: { isCorrect: false } }),
            prisma.option.update({ where: { id: firstFilled.id }, data: { isCorrect: true } }),
          ]);
          actions.push(`Q${quiz.questions.indexOf(q) + 1}: Marked first option as correct`);
          fixed++;
        }
      } else if (err.autoFixAction === "create_true_false_options") {
        // Recreate True/False options
        await prisma.option.deleteMany({ where: { questionId: q.id } });
        await prisma.option.createMany({
          data: [
            { questionId: q.id, text: "True", isCorrect: true, order: 0 },
            { questionId: q.id, text: "False", isCorrect: false, order: 1 },
          ],
        });
        actions.push(`Q${quiz.questions.indexOf(q) + 1}: Created True/False options`);
        fixed++;
      } else if (err.autoFixAction === "mark_true_correct") {
        const trueOpt = q.options.find((o) => o.text.toLowerCase() === "true");
        if (trueOpt) {
          await prisma.$transaction([
            prisma.option.updateMany({ where: { questionId: q.id }, data: { isCorrect: false } }),
            prisma.option.update({ where: { id: trueOpt.id }, data: { isCorrect: true } }),
          ]);
          actions.push(`Q${quiz.questions.indexOf(q) + 1}: Marked "True" as correct`);
          fixed++;
        }
      }
    } catch (fixErr: any) {
      logger.error(`[autoFix] Failed to fix question ${q.id}: ${fixErr?.message}`);
    }
  }

  return { fixed, actions };
}

// ─── Assert Ready (throws on hard errors only, logs warnings) ─────────────────
export async function assertQuizReadyForLive(quizId: string) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!quiz) throw new AppError(404, "Quiz not found");

  logger.info(`[LIVE VALIDATION] Validating quiz ${quizId} — ${quiz.questions.length} questions`);

  const result = validateQuizForLive(quiz.questions);

  if (result.warnings.length > 0) {
    logger.warn(`[LIVE VALIDATION] ${result.warnings.length} warning(s) — quiz can still start`);
    for (const w of result.warnings) {
      logger.warn(`  [WARN] ${w.message} | field: ${w.field}`);
    }
  }

  if (!result.ready) {
    logger.error(`[LIVE VALIDATION] ${result.errors.length} blocking error(s) — quiz cannot start`);
    for (const e of result.errors) {
      logger.error(`  [BLOCK] ${e.message} | field: ${e.field} | expected: ${e.expected} | actual: ${e.actual}`);
    }
    throw new AppError(400, `VALIDATION_ERRORS:${JSON.stringify(result.errors)}`);
  }

  logger.info(`[LIVE VALIDATION] Quiz ${quizId} passed validation — ready to start`);
  return quiz;
}
