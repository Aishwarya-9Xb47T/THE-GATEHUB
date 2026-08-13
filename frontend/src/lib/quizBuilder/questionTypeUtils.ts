import type { QuizQuestion, QuizQuestionOption } from "./types";

export const CHOICE_TYPES = new Set(["multiple_choice", "multiple_select", "true_false", "poll", "image_based"]);
export const ORDERING_TYPES = new Set(["ordering", "sequence"]);
export const TEXT_ANSWER_TYPES = new Set(["fill_blank", "short_answer", "essay", "numerical"]);
export const MATCHING_TYPES = new Set(["matching", "matrix"]);
export const CODING_TYPES = new Set(["coding", "debugging", "predict_output", "sql"]);
export const MEDIA_TYPES = new Set(["image_based", "video_based", "audio_based", "hotspot"]);
export const CONTEXT_TYPES = new Set(["case_study", "scenario"]);

function optId(prefix: string, i: number) {
  return `${prefix}-o${i}-${Date.now()}`;
}

export function defaultOptionsForType(type: string, questionId: string): QuizQuestionOption[] {
  switch (type) {
    case "true_false":
      return [
        { id: optId(questionId, 0), text: "True", isCorrect: true, order: 0 },
        { id: optId(questionId, 1), text: "False", isCorrect: false, order: 1 },
      ];
    case "multiple_select":
      return [0, 1, 2, 3].map((i) => ({
        id: optId(questionId, i),
        text: "",
        isCorrect: i === 0,
        order: i,
      }));
    case "ordering":
    case "sequence":
      return [0, 1, 2, 3].map((i) => ({
        id: optId(questionId, i),
        text: "",
        isCorrect: true,
        order: i,
      }));
    case "matching":
      return [0, 1, 2].flatMap((i) => [
        { id: optId(questionId, i * 2), text: "", isCorrect: true, order: i * 2 },
        { id: optId(questionId, i * 2 + 1), text: "", isCorrect: false, order: i * 2 + 1 },
      ]);
    case "poll":
      return [0, 1, 2, 3].map((i) => ({
        id: optId(questionId, i),
        text: "",
        isCorrect: false,
        order: i,
      }));
    case "fill_blank":
    case "short_answer":
    case "numerical":
    case "essay":
      return [{ id: optId(questionId, 0), text: "", isCorrect: true, order: 0 }];
    case "matrix":
      return [0, 1, 2].map((i) => ({
        id: optId(questionId, i),
        text: "",
        isCorrect: i === 0,
        order: i,
      }));
    default:
      return [0, 1, 2, 3].map((i) => ({
        id: optId(questionId, i),
        text: "",
        isCorrect: i === 0,
        order: i,
      }));
  }
}

/** Preserve stem, explanation, hints, tags, media when switching types */
export function changeQuestionType(question: QuizQuestion, newType: string): QuizQuestion {
  const preserved = {
    id: question.id,
    text: question.text,
    difficulty: question.difficulty,
    marks: question.marks,
    order: question.order,
    explanation: question.explanation,
    hints: question.hints,
    tags: question.tags,
    bloomLevel: question.bloomLevel,
    estimatedSeconds: question.estimatedSeconds,
    sectionId: question.sectionId,
    media: question.media,
    metadata: { ...question.metadata },
  };

  const oldType = question.type;
  const sameCategory =
    (CHOICE_TYPES.has(oldType) && CHOICE_TYPES.has(newType)) ||
    (ORDERING_TYPES.has(oldType) && ORDERING_TYPES.has(newType)) ||
    (TEXT_ANSWER_TYPES.has(oldType) && TEXT_ANSWER_TYPES.has(newType)) ||
    (CODING_TYPES.has(oldType) && CODING_TYPES.has(newType));

  let options = question.options;
  if (!sameCategory || options.length === 0) {
    options = defaultOptionsForType(newType, question.id);
  } else if (newType === "true_false" && options.length > 2) {
    options = defaultOptionsForType("true_false", question.id);
  } else if (newType === "poll") {
    options = options.map((o) => ({ ...o, isCorrect: false }));
  }

  const meta = { ...preserved.metadata };
  if (newType === "numerical" && !meta.numericAnswer) meta.numericAnswer = "";
  if (newType === "numerical" && meta.numericTolerance == null) meta.numericTolerance = 0;
  if (CODING_TYPES.has(newType) && !meta.starterCode) meta.starterCode = "";
  if (CODING_TYPES.has(newType) && !meta.solutionCode) meta.solutionCode = "";
  if (CONTEXT_TYPES.has(newType) && !meta.context) meta.context = "";
  if (newType === "hotspot" && !meta.hotspots) meta.hotspots = [];
  if (newType === "matrix" && !meta.matrixRows) meta.matrixRows = ["Row 1", "Row 2"];
  if (newType === "matrix" && !meta.matrixCols) meta.matrixCols = ["Col A", "Col B"];

  return { ...preserved, type: newType, options, metadata: meta };
}

export function newQuestion(order: number, type = "multiple_choice"): QuizQuestion {
  const id = `new-${Date.now()}-${order}`;
  return {
    id,
    text: "",
    type,
    difficulty: "medium",
    marks: 1,
    order,
    explanation: "",
    hints: [],
    tags: [],
    bloomLevel: "L2",
    estimatedSeconds: 45,
    sectionId: null,
    media: null,
    metadata: {},
    options: defaultOptionsForType(type, id),
  };
}
