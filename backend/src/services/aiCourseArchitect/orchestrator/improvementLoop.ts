/**
 * V4 — Self-improvement loop: regenerate only weak lessons until quality threshold.
 */
import type { ArchitectBlueprint, AICourseArchitectInterview } from "../types.js";
import { reviewLessonContent, reviewFullBlueprint } from "../pipeline/qualityReviewer.js";
import { runSelfEvaluation } from "./selfEvaluator.js";
import { runSelfHealingLoop } from "../engines/selfHealing.js";
import { IMPROVEMENT_ROUNDS, PUBLISH_THRESHOLD } from "../architectPerformance.js";

export interface ImprovementLoopResult {
  blueprint: ArchitectBlueprint;
  roundsRun: number;
  lessonsImproved: number;
  finalScore: number;
  readyToPublish: boolean;
}

function findWeakLessons(blueprint: ArchitectBlueprint, interview: AICourseArchitectInterview) {
  const weak: Array<{ modIndex: number; lessonIndex: number; score: number }> = [];
  blueprint.modules.forEach((mod, modIndex) => {
    mod.lessons.forEach((lesson, lessonIndex) => {
      const report = reviewLessonContent(lesson, interview);
      if (!report.passed || report.score < PUBLISH_THRESHOLD) {
        weak.push({ modIndex, lessonIndex, score: report.score });
      }
    });
  });
  return weak.sort((a, b) => a.score - b.score);
}

async function improveLessonsParallel(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview,
  _weak: Array<{ modIndex: number; lessonIndex: number }>,
  onProgress?: (msg: string, pct: number) => void
): Promise<number> {
  const result = await runSelfHealingLoop(blueprint, interview, (msg) => onProgress?.(msg, 90));
  return result.lessonsHealed;
}

export async function runImprovementLoop(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview,
  onProgress?: (msg: string, pct: number) => void
): Promise<ImprovementLoopResult> {
  if (IMPROVEMENT_ROUNDS === 0) {
    const fullReview = reviewFullBlueprint(blueprint, interview);
    const selfEval = runSelfEvaluation(blueprint, interview, fullReview.score);
    const finalScore = Math.round((fullReview.score + selfEval.overallScore) / 2);
    return {
      blueprint,
      roundsRun: 0,
      lessonsImproved: 0,
      finalScore,
      readyToPublish: finalScore >= PUBLISH_THRESHOLD && fullReview.passed,
    };
  }

  let lessonsImproved = 0;
  let roundsRun = 0;

  for (let round = 0; round < IMPROVEMENT_ROUNDS; round++) {
    const fullReview = reviewFullBlueprint(blueprint, interview);
    const selfEval = runSelfEvaluation(blueprint, interview, fullReview.score);
    const combined = Math.round((fullReview.score + selfEval.overallScore) / 2);

    if (combined >= PUBLISH_THRESHOLD && fullReview.passed && selfEval.improvements.length === 0) {
      return { blueprint, roundsRun, lessonsImproved, finalScore: combined, readyToPublish: true };
    }

    const weak = findWeakLessons(blueprint, interview);
    if (!weak.length) break;

    roundsRun++;
    onProgress?.(`Improvement round ${round + 1}: ${weak.length} lesson(s)`, 88 + round * 3);
    lessonsImproved += await improveLessonsParallel(blueprint, interview, weak, onProgress);
  }

  const finalReview = reviewFullBlueprint(blueprint, interview);
  const finalSelf = runSelfEvaluation(blueprint, interview, finalReview.score);
  const finalScore = Math.round((finalReview.score + finalSelf.overallScore) / 2);

  return {
    blueprint,
    roundsRun,
    lessonsImproved,
    finalScore,
    readyToPublish: finalScore >= PUBLISH_THRESHOLD && finalReview.passed,
  };
}
