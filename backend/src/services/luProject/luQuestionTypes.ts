/**
 * Canonical question types — one model, many variants.
 * Quiz is the container; questions are children with kind "question".
 */

export const LU_QUESTION_TYPES = [
  "multiple-choice",
  "multiple-select",
  "true-false",
  "fill-blank",
  "short-answer",
  "long-answer",
  "essay",
  "matching",
  "ordering",
  "numerical",
  "coding",
  "file-upload",
  "case-study",
  "image-based",
  "audio-based",
  "video-based",
] as const;

export type LuQuestionType = (typeof LU_QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<LuQuestionType, string> = {
  "multiple-choice": "Multiple Choice",
  "multiple-select": "Multiple Select",
  "true-false": "True / False",
  "fill-blank": "Fill in the Blank",
  "short-answer": "Short Answer",
  "long-answer": "Long Answer",
  essay: "Essay",
  matching: "Matching",
  ordering: "Ordering",
  numerical: "Numerical",
  coding: "Coding Question",
  "file-upload": "File Upload",
  "case-study": "Case Study",
  "image-based": "Image Based",
  "audio-based": "Audio Based",
  "video-based": "Video Based",
};

export function isLuQuestionType(value: string): value is LuQuestionType {
  return (LU_QUESTION_TYPES as readonly string[]).includes(value);
}

export function defaultTitleForQuestionType(type: string, index: number): string {
  const label = isLuQuestionType(type) ? QUESTION_TYPE_LABELS[type] : type;
  return `${label} ${index}`;
}

/** Shared question config fields — every type inherits these. */
export function defaultQuestionConfig(
  questionType: LuQuestionType | string,
  title: string
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    questionType,
    question: title,
    marks: 1,
    difficulty: "medium",
    shuffle: false,
    required: true,
    explanation: "",
    hints: [] as string[],
    feedback: { correct: "", incorrect: "" },
    timeLimitSec: 0,
    image: "",
    video: "",
    audio: "",
  };

  switch (questionType) {
    case "multiple-choice":
      return {
        ...base,
        optionA: "Option A",
        optionB: "Option B",
        optionC: "Option C",
        optionD: "Option D",
        correct: "B",
      };
    case "multiple-select":
      return {
        ...base,
        options: ["Option A", "Option B", "Option C", "Option D"],
        correct: ["A", "B"],
      };
    case "true-false":
      return { ...base, correct: "true" };
    case "fill-blank":
      return { ...base, blanks: [{ id: "b1", answer: "", caseSensitive: false }] };
    case "short-answer":
      return { ...base, maxLength: 200, sampleAnswer: "" };
    case "long-answer":
    case "essay":
      return { ...base, minWords: 50, maxWords: 500, rubric: "" };
    case "matching":
      return {
        ...base,
        pairs: [
          { left: "Term A", right: "Definition A" },
          { left: "Term B", right: "Definition B" },
        ],
      };
    case "ordering":
      return { ...base, items: ["Step 1", "Step 2", "Step 3"], correctOrder: [0, 1, 2] };
    case "numerical":
      return { ...base, answer: 0, tolerance: 0.01, unit: "" };
    case "coding":
      return {
        ...base,
        language: "python",
        starterCode: "# Write your solution\n",
        tests: [{ input: "", expectedOutput: "" }],
        timeLimitMs: 5000,
      };
    case "file-upload":
      return { ...base, allowedTypes: ["pdf", "zip"], maxSizeMb: 10 };
    case "case-study":
      return { ...base, scenario: "", subQuestions: [] };
    case "image-based":
      return { ...base, imageUrl: "", hotspot: null };
    case "audio-based":
      return { ...base, audioUrl: "", transcript: "" };
    case "video-based":
      return { ...base, videoUrl: "", timestamp: 0 };
    default:
      return base;
  }
}
