/** Frontend mirror of backend luQuestionTypes — keep in sync */

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

export function questionTypeLabel(type: string): string {
  return QUESTION_TYPE_LABELS[type as LuQuestionType] ?? type;
}
