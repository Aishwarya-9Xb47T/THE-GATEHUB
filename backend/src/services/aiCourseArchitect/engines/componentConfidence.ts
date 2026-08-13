/**
 * V6 Part 4 — AI confidence scores per component.
 */
import type { ArchitectLessonBlueprint } from "../types.js";
import { isSubstantiveText } from "../pipeline/placeholderGuards.js";

export interface ComponentConfidence {
  component: string;
  confidence: number;
  evidenceCount: number;
  verificationStatus: "verified" | "partial" | "unverified";
  qaStatus: "pass" | "warn" | "fail";
  regenerationCount: number;
  sourceQuality: number;
  needsRegeneration: boolean;
}

const CONFIDENCE_THRESHOLD = parseFloat(process.env.AI_ARCHITECT_COMPONENT_CONFIDENCE_THRESHOLD || "0.75");

export function scoreLessonComponents(
  lesson: ArchitectLessonBlueprint,
  retrievalConfidence = 0
): ComponentConfidence[] {
  const scores: ComponentConfidence[] = [];

  scores.push(scoreComponent("theory", isSubstantiveText(lesson.theory, 200) ? 0.9 : 0.5, retrievalConfidence));
  scores.push(scoreComponent("objectives", (lesson.objectives?.length ?? 0) >= 3 ? 0.92 : 0.6, retrievalConfidence));
  if (lesson.codeExample) {
    scores.push(scoreComponent("code", lesson.codeValidation?.passed ? 0.95 : 0.55, retrievalConfidence, lesson.codeValidation ? 1 : 0));
  }
  if (lesson.quizQuestions?.length) {
    scores.push(scoreComponent("quiz", Math.min(0.95, 0.6 + lesson.quizQuestions.length * 0.03), retrievalConfidence));
  }
  if (lesson.codingLab) scores.push(scoreComponent("lab", 0.8, retrievalConfidence));
  if (lesson.assignment) scores.push(scoreComponent("assignment", 0.82, retrievalConfidence));
  if (lesson.diagrams?.length) scores.push(scoreComponent("diagram", 0.85, retrievalConfidence));
  if (lesson.videos?.length) scores.push(scoreComponent("video", 0.78, retrievalConfidence));
  if (lesson.researchPapers?.length) scores.push(scoreComponent("research", 0.8, retrievalConfidence));

  return scores;
}

function scoreComponent(
  component: string,
  confidence: number,
  sourceQuality: number,
  regenCount = 0
): ComponentConfidence {
  const needsRegeneration = confidence < CONFIDENCE_THRESHOLD;
  return {
    component,
    confidence: Math.round(confidence * 100),
    evidenceCount: sourceQuality > 0 ? Math.round(sourceQuality * 10) : 0,
    verificationStatus: confidence >= 0.85 ? "verified" : confidence >= 0.6 ? "partial" : "unverified",
    qaStatus: confidence >= 0.85 ? "pass" : confidence >= 0.65 ? "warn" : "fail",
    regenerationCount: regenCount,
    sourceQuality: Math.round(sourceQuality * 100),
    needsRegeneration,
  };
}

export function componentsNeedingRegeneration(scores: ComponentConfidence[]): string[] {
  return scores.filter((s) => s.needsRegeneration).map((s) => s.component);
}
