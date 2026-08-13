export interface PlayerOption {
  id: string;
  text: string;
  order?: number;
}

export interface PlayerQuestion {
  id: string;
  text: string;
  type: string;
  options: PlayerOption[];
  metadata?: Record<string, unknown> | null;
}

export function isChoiceType(type: string): boolean {
  return ["multiple_choice", "multiple_select", "true_false", "poll", "image_based"].includes(type);
}

export function isOrderingType(type: string): boolean {
  return type === "ordering" || type === "sequence";
}

export function isMatchingType(type: string): boolean {
  return type === "matching" || type === "matrix";
}

export function isTextAnswerType(type: string): boolean {
  return ["short_answer", "fill_blank", "numerical"].includes(type);
}

export function isHotspotType(type: string): boolean {
  return type === "hotspot";
}
