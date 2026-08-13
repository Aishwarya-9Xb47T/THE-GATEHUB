/**
 * V4 Agent 12 — Self-evaluation before publish.
 */
import type { ArchitectBlueprint, AICourseArchitectInterview } from "../types.js";
import type { SelfEvaluationResult } from "./contracts.js";
import { scanObjectForPlaceholders } from "../pipeline/placeholderGuards.js";
import { hasLearningComponent } from "../types.js";
import { PUBLISH_THRESHOLD } from "../architectPerformance.js";

export function runSelfEvaluation(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview,
  qualityScore: number
): SelfEvaluationResult {
  const lessons = blueprint.modules.flatMap((m) => m.lessons);
  const improvements: string[] = [];

  const placeholderHits = lessons.flatMap((l) =>
    scanObjectForPlaceholders({ theory: l.theory, quiz: l.quizQuestions, lab: l.codingLab })
  );
  if (placeholderHits.length) improvements.push("Remove placeholder content from lessons");

  const avgTheory =
    lessons.reduce((n, l) => n + (l.theory?.split(/\s+/).length ?? 0), 0) / Math.max(lessons.length, 1);
  if (avgTheory < 280) improvements.push("Expand theory depth across lessons");

  const quizLessons = lessons.filter((l) => (l.quizQuestions?.length ?? 0) >= 8);
  const needsQuiz = hasLearningComponent(interview, "Quiz");
  if (needsQuiz && quizLessons.length < lessons.length * 0.9) {
    improvements.push("Complete 10-question quizzes for all lessons");
  }

  const labLessons = lessons.filter(
    (l) => l.codingLab && l.codingLab.starterCode.length > 80 && !/your solution here/i.test(l.codingLab.starterCode)
  );
  if (
    (hasLearningComponent(interview, "Coding") || hasLearningComponent(interview, "Coding Lab")) &&
    labLessons.length < lessons.length * 0.85
  ) {
    improvements.push("Complete coding labs with runnable starter code");
  }

  const outcomesOk = (blueprint.learningOutcomes?.length ?? 0) >= 5;
  const progressionOk = Boolean(blueprint.difficultyProgression && blueprint.modules.length >= 2);
  const academicOk = Boolean(blueprint.academicBlueprint?.bloomsTaxonomyMapping?.length);

  const overallScore = Math.round(
    (qualityScore * 0.5 +
      (placeholderHits.length === 0 ? 20 : 0) +
      (avgTheory >= 280 ? 15 : 0) +
      (outcomesOk ? 5 : 0) +
      (progressionOk ? 5 : 0) +
      (academicOk ? 5 : 0)) *
      (needsQuiz ? (quizLessons.length / Math.max(lessons.length, 1)) * 0.5 + 0.5 : 1)
  );

  const threshold = PUBLISH_THRESHOLD;
  const pass = overallScore >= threshold && improvements.length === 0;

  return {
    courseraReady: pass && avgTheory >= 300,
    mitReady: pass && academicOk && progressionOk,
    stanfordReady: pass && outcomesOk,
    deeplearningAiReady: pass && (!needsQuiz || quizLessons.length === lessons.length),
    professorApproved: pass && placeholderHits.length === 0,
    studentWouldPay: overallScore >= 90,
    overallScore: Math.min(100, overallScore),
    improvements: pass ? [] : improvements.length ? improvements : ["Raise quality score above 95%"],
  };
}
