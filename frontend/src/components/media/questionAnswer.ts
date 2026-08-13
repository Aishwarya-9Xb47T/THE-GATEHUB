import {
  isChoiceType,
  isHotspotType,
  isMatchingType,
  isOrderingType,
  isTextAnswerType,
} from "./questionPlayer/types";

/** Whether the learner has provided a submittable answer for a question type. */
export function hasQuestionAnswer(
  type: string,
  value: unknown,
  optionCount = 0
): boolean {
  if (type === "multiple_select") {
    return Array.isArray(value) && value.length > 0;
  }

  if (isOrderingType(type)) {
    return Array.isArray(value) && value.length === optionCount && optionCount > 0;
  }

  if (isMatchingType(type)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const map = value as Record<string, string>;
    const pairCount = Math.floor(optionCount / 2);
    const filled = Object.values(map).filter(Boolean).length;
    return pairCount > 0 && filled >= pairCount;
  }

  if (isTextAnswerType(type) || type === "essay") {
    return typeof value === "string" && value.trim().length > 0;
  }

  if (isHotspotType(type)) {
    return typeof value === "string" && value.trim().length > 0;
  }

  if (isChoiceType(type) || type === "true_false" || type === "poll") {
    return typeof value === "string" && value.length > 0;
  }

  return value !== undefined && value !== null && value !== "";
}

export function initialAnswerForType(type: string): unknown {
  if (type === "multiple_select") return [];
  if (isOrderingType(type)) return [];
  if (isMatchingType(type)) return {};
  return "";
}
