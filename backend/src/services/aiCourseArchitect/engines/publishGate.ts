/**
 * V6 Part 3 — Central publish gate (blocks publish until all conditions met).
 * Must NOT call buildQualityAssuranceOutput (avoids circular recursion with QA agent).
 */
import type { ArchitectBlueprint, AICourseArchitectInterview } from "../types.js";
import { reviewFullBlueprint } from "../pipeline/qualityReviewer.js";
import { runSelfEvaluation } from "../orchestrator/selfEvaluator.js";
import { runVirtualStudentSimulation } from "./studentSimulationEngine.js";
import { computeLessonQualityDimensions } from "./lessonQualityScore.js";
import { auditCourseAccessibility } from "./accessibilityEngine.js";
import { SELF_HEALING_THRESHOLD } from "../architectPerformance.js";
import { isLikelyFakeUrl } from "../externalResearchApis.js";
import { scanObjectForPlaceholders } from "../pipeline/placeholderGuards.js";
import { isSubstantiveText } from "../pipeline/placeholderGuards.js";

export interface PublishGateResult {
  ready: boolean;
  score: number;
  threshold: number;
  blockers: string[];
  checks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
}

export function evaluatePublishGate(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): PublishGateResult {
  const fullReview = reviewFullBlueprint(blueprint, interview);
  const selfEval = runSelfEvaluation(blueprint, interview, fullReview.score);
  const simulation = runVirtualStudentSimulation(blueprint, interview);
  const accessibility = auditCourseAccessibility(blueprint);
  const blockers: string[] = [
    ...fullReview.suggestions,
    ...selfEval.improvements,
  ];
  const checks: PublishGateResult["checks"] = [];

  const lessons = blueprint.modules.flatMap((m) => m.lessons);
  const titles = lessons.map((l) => l.title.toLowerCase());
  const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);

  const placeholderHits = lessons.flatMap((l) =>
    scanObjectForPlaceholders({ theory: l.theory, quiz: l.quizQuestions, lab: l.codingLab })
  );
  const fakeUrls = lessons.flatMap((l) => [
    ...(l.videos ?? []).filter((v) => isLikelyFakeUrl(v.url)).map((v) => v.title),
    ...(l.lessonReferences ?? []).filter((r) => isLikelyFakeUrl(r.url)).map((r) => r.title),
    ...(l.researchPapers ?? []).filter((p) => isLikelyFakeUrl(p.url)).map((p) => p.title),
  ]);
  const missingObjectives = lessons.filter((l) => (l.objectives?.length ?? 0) < 2);
  const emptySections = lessons.filter((l) => !isSubstantiveText(l.theory, 80));
  const failedCode = lessons.filter((l) => l.codeValidation && !l.codeValidation.passed);
  const invalidDiagrams = lessons.filter((l) =>
    (l.diagrams ?? []).some((d) => !d.mermaid || d.mermaid.length < 10)
  );

  const dimensionScores = lessons.map((l) => computeLessonQualityDimensions(l, interview));
  const avgOverall =
    dimensionScores.length
      ? Math.round(dimensionScores.reduce((n, d) => n + d.overall, 0) / dimensionScores.length)
      : Math.round((fullReview.score + selfEval.overallScore) / 2);

  if (placeholderHits.length) blockers.push(`Placeholder text: ${placeholderHits.length}`);
  if (fakeUrls.length) blockers.push(`Broken/suspicious URLs: ${fakeUrls.length}`);
  if (dupes.length) blockers.push(`Duplicate lessons: ${dupes.slice(0, 3).join(", ")}`);
  if (missingObjectives.length) blockers.push(`Missing objectives: ${missingObjectives.length}`);
  if (emptySections.length) blockers.push(`Empty theory sections: ${emptySections.length}`);
  if (failedCode.length) blockers.push(`Invalid code: ${failedCode.map((l) => l.title).join(", ")}`);
  if (invalidDiagrams.length) blockers.push(`Invalid diagrams: ${invalidDiagrams.length}`);
  if (!simulation.passed) blockers.push("Student simulation failed");
  if (!accessibility.passed) blockers.push(`Accessibility: ${accessibility.issues.length} issues`);
  if (avgOverall < SELF_HEALING_THRESHOLD) blockers.push(`Quality score ${avgOverall} < ${SELF_HEALING_THRESHOLD}`);
  if (!fullReview.passed) blockers.push("Blueprint quality review failed");

  checks.push(
    { id: "placeholders", label: "No placeholders", passed: !placeholderHits.length, detail: `${placeholderHits.length}` },
    { id: "urls", label: "URLs verified", passed: !fakeUrls.length, detail: `${fakeUrls.length}` },
    { id: "objectives", label: "Objectives present", passed: !missingObjectives.length, detail: `${missingObjectives.length}` },
    { id: "code", label: "Code valid", passed: !failedCode.length, detail: `${failedCode.length}` },
    { id: "diagrams", label: "Diagrams valid", passed: !invalidDiagrams.length, detail: `${invalidDiagrams.length}` },
    { id: "simulation", label: "Student simulation", passed: simulation.passed, detail: `${simulation.score}` },
    { id: "accessibility", label: "Accessibility", passed: accessibility.passed, detail: `${accessibility.score}` },
    { id: "quality", label: "Overall quality", passed: avgOverall >= SELF_HEALING_THRESHOLD, detail: `${avgOverall}` }
  );

  const qaPassed =
    fullReview.passed &&
    selfEval.overallScore >= SELF_HEALING_THRESHOLD &&
    placeholderHits.length === 0 &&
    dupes.length === 0 &&
    fakeUrls.length === 0;

  const ready =
    blockers.length === 0 &&
    qaPassed &&
    simulation.passed &&
    avgOverall >= SELF_HEALING_THRESHOLD;

  return {
    ready,
    score: avgOverall,
    threshold: SELF_HEALING_THRESHOLD,
    blockers: [...new Set(blockers)].slice(0, 20),
    checks,
  };
}
