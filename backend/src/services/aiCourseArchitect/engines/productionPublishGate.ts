/**
 * V6 Part 4 — Production publishing gate (per-dimension ≥ 95).
 */
import type { ArchitectBlueprint, AICourseArchitectInterview } from "../types.js";
import { evaluatePublishGate, type PublishGateResult } from "./publishGate.js";
import { computeLessonQualityDimensions } from "./lessonQualityScore.js";
import { validatePedagogyCompliance } from "./masterPedagogy.js";
import { auditDifficultyProgression } from "./difficultyBalancer.js";
import { analyzeCurriculumGaps } from "./knowledgeGapAnalyzer.js";
import { bloomsCoverageScore, mapLessonBloomActivities } from "./bloomsEngine.js";
import { auditLessonFacts } from "../retrieval/hallucinationGuard.js";
import { isGenericLessonContent } from "../../lessonContentRepair.js";

export const PRODUCTION_DIMENSION_THRESHOLD = Math.max(
  85,
  parseInt(process.env.AI_ARCHITECT_PRODUCTION_THRESHOLD || "88", 10) || 88
);

export interface ProductionPublishGateResult extends PublishGateResult {
  dimensionGates: Record<string, { score: number; passed: boolean }>;
  pedagogyPassed: boolean;
  difficultyPassed: boolean;
  gapsPassed: boolean;
  bloomsPassed: boolean;
  hallucinationsDetected: boolean;
}

const DIMENSION_KEYS = [
  "educationalValue",
  "codeQuality",
  "researchQuality",
  "quizQuality",
  "projectQuality",
  "videoQuality",
  "accessibility",
] as const;

export function evaluateProductionPublishGate(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): ProductionPublishGateResult {
  const base = evaluatePublishGate(blueprint, interview);
  const lessons = blueprint.modules.flatMap((m) => m.lessons);
  const dims = lessons.map((l) => computeLessonQualityDimensions(l, interview));

  const dimensionGates: ProductionPublishGateResult["dimensionGates"] = {};
  for (const key of DIMENSION_KEYS) {
    const avg = dims.length
      ? Math.round(dims.reduce((n, d) => n + (d[key] ?? d.overall), 0) / dims.length)
      : 0;
    dimensionGates[key] = { score: avg, passed: avg >= PRODUCTION_DIMENSION_THRESHOLD };
  }
  const accuracyScore = dims.length ? Math.round(dims.reduce((n, d) => n + d.accuracy, 0) / dims.length) : 0;
  dimensionGates.accuracy = {
    score: accuracyScore,
    passed: accuracyScore >= PRODUCTION_DIMENSION_THRESHOLD,
  };
  dimensionGates.overall = { score: base.score, passed: base.score >= PRODUCTION_DIMENSION_THRESHOLD };

  const pedagogyResults = lessons.map((l) => validatePedagogyCompliance(l, { learningGoals: l.objectives ?? [], microLearningFlow: [] } as never));
  const pedagogyPassed = pedagogyResults.every((p) => p.passed);

  const difficulty = auditDifficultyProgression(blueprint);
  const gaps = analyzeCurriculumGaps(blueprint, interview);
  const bloomsScores = lessons.map((l) => bloomsCoverageScore(mapLessonBloomActivities(l, { bloomsLevels: [] } as never)));
  const bloomsPassed = bloomsScores.length ? bloomsScores.reduce((a, b) => a + b, 0) / bloomsScores.length >= 50 : true;

  const hallucinationsDetected = lessons.some((l) =>
    auditLessonFacts(l).some((f) => f.verdict === "unsupported")
  );

  const genericLessonCount = lessons.filter(
    (l) => isGenericLessonContent(l.theory || "") || (l.summary ? isGenericLessonContent(l.summary) : false)
  ).length;
  const genericContentRate = lessons.length ? genericLessonCount / lessons.length : 0;
  const weakScaffoldLessons = lessons.filter((l) => {
    const t = (l.theory || "").toLowerCase();
    const count = ["## foundation", "## structure", "## application", "## depth"].filter((h) => t.includes(h)).length;
    return count < 4;
  }).length;
  const weakSummaryLessons = lessons.filter((l) => (l.summary || "").split(/\s+/).filter(Boolean).length < 60).length;
  const weakReferenceLessons = lessons.filter((l) =>
    (l.furtherReading ?? []).filter((r) => !!r.url && !/example\.com|wikipedia\.org\/wiki\/main_page/i.test(r.url)).length < 3
  ).length;
  const continuityWeakLessons = lessons.filter((l) => {
    const blob = `${l.introduction || ""}\n${l.theory || ""}\n${l.revision || ""}`.toLowerCase();
    const count = ["prior lesson", "builds on", "next lesson", "prepare for next"].filter((m) => blob.includes(m)).length;
    return count < 2;
  }).length;

  const failedDims = Object.entries(dimensionGates).filter(([, v]) => !v.passed);
  const blockers = [
    ...base.blockers,
    ...failedDims.map(([k, v]) => `${k} ${v.score} < ${PRODUCTION_DIMENSION_THRESHOLD}`),
    ...(!pedagogyPassed ? ["Pedagogy compliance failed"] : []),
    ...(!difficulty.passed ? ["Difficulty progression jumps detected"] : []),
    ...(gaps.gaps.length > lessons.length * 0.2 ? [`Curriculum gaps: ${gaps.gaps.length}`] : []),
    ...(!bloomsPassed ? ["Insufficient Bloom's coverage"] : []),
    ...(hallucinationsDetected ? ["Hallucinations detected"] : []),
    ...(genericContentRate > 0.15 ? [`Generic AI content in ${genericLessonCount} lessons`] : []),
    ...(weakScaffoldLessons > 0 ? [`Progressive scaffolding missing in ${weakScaffoldLessons} lessons`] : []),
    ...(weakSummaryLessons > 0 ? [`Summary quality below threshold in ${weakSummaryLessons} lessons`] : []),
    ...(weakReferenceLessons > 0 ? [`References quality below threshold in ${weakReferenceLessons} lessons`] : []),
    ...(continuityWeakLessons > 0 ? [`Cross-lesson continuity weak in ${continuityWeakLessons} lessons`] : []),
  ];

  const ready =
    base.ready &&
    failedDims.length === 0 &&
    pedagogyPassed &&
    difficulty.passed &&
    !hallucinationsDetected &&
    genericContentRate <= 0.15 &&
    weakScaffoldLessons === 0 &&
    weakSummaryLessons === 0 &&
    weakReferenceLessons === 0 &&
    continuityWeakLessons <= Math.floor(lessons.length * 0.1) &&
    gaps.score >= 70;

  return {
    ...base,
    ready,
    blockers: [...new Set(blockers)].slice(0, 25),
    dimensionGates,
    pedagogyPassed,
    difficultyPassed: difficulty.passed,
    gapsPassed: gaps.score >= 70,
    bloomsPassed,
    hallucinationsDetected,
  };
}
