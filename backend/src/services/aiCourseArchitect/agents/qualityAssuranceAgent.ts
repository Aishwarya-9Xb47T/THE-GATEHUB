/**
 * V4 Agent 12 — Quality Assurance AI
 */
import type { ArchitectBlueprint, AICourseArchitectInterview } from "../types.js";
import type { QualityAssuranceOutput } from "../orchestrator/contracts.js";
import type { ArchitectQualityReport } from "../types.js";
import { reviewFullBlueprint } from "../pipeline/qualityReviewer.js";
import { runSelfEvaluation } from "../orchestrator/selfEvaluator.js";
import { scanObjectForPlaceholders } from "../pipeline/placeholderGuards.js";
import { isLikelyFakeUrl } from "../externalResearchApis.js";
import { PUBLISH_THRESHOLD } from "../architectPerformance.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { evaluatePublishGate } from "../engines/publishGate.js";

const PUBLISH_THRESHOLD_QA = PUBLISH_THRESHOLD;

export function buildQualityAssuranceOutput(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): QualityAssuranceOutput {
  const fullReview = reviewFullBlueprint(blueprint, interview);
  const selfEval = runSelfEvaluation(blueprint, interview, fullReview.score);
  const placeholderHits = blueprint.modules.flatMap((m) =>
    m.lessons.flatMap((l) =>
      scanObjectForPlaceholders({
        theory: l.theory,
        quiz: l.quizQuestions,
        lab: l.codingLab,
        assignment: l.assignment,
        code: l.codeExample,
      })
    )
  );

  const titles = blueprint.modules.flatMap((m) => m.lessons.map((l) => l.title.toLowerCase()));
  const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);

  const fakeUrls = blueprint.modules.flatMap((m) =>
    m.lessons.flatMap((l) => [
      ...(l.videos ?? []).filter((v) => isLikelyFakeUrl(v.url)).map((v) => `video:${v.title}`),
      ...(l.lessonReferences ?? []).filter((r) => isLikelyFakeUrl(r.url)).map((r) => `ref:${r.title}`),
      ...(l.researchPapers ?? []).filter((p) => isLikelyFakeUrl(p.url)).map((p) => `paper:${p.title}`),
    ])
  );

  const lessonsMissingObjectives = blueprint.modules.flatMap((m) =>
    m.lessons.filter((l) => (l.objectives?.length ?? 0) < 3).map((l) => l.title)
  );

  const lessonsWithFailedCode = blueprint.modules.flatMap((m) =>
    m.lessons.filter((l) => l.codeValidation && !l.codeValidation.passed).map((l) => l.title)
  );

  const passed =
    fullReview.passed &&
    selfEval.overallScore >= PUBLISH_THRESHOLD &&
    placeholderHits.length === 0 &&
    dupes.length === 0 &&
    fakeUrls.length === 0 &&
    lessonsMissingObjectives.length === 0 &&
    lessonsWithFailedCode.length === 0;

  const publishGate = evaluatePublishGate(blueprint, interview);
  const finalPassed = passed && publishGate.ready;

  const regenerationInstructions = [
    ...fullReview.suggestions,
    ...lessonsWithFailedCode.map((t) => `Regenerate code only: ${t}`),
  ];

  return {
    passed: finalPassed,
    score: Math.round((fullReview.score + selfEval.overallScore + publishGate.score) / 3),
    blockedReasons: [
      ...regenerationInstructions,
      ...selfEval.improvements,
      ...placeholderHits.map((p) => `Placeholder: ${p}`),
      ...fakeUrls.map((u) => `Suspicious URL: ${u}`),
      ...publishGate.blockers,
      ...(lessonsMissingObjectives.length
        ? [`Lessons missing objectives: ${lessonsMissingObjectives.slice(0, 3).join(", ")}`]
        : []),
      ...(dupes.length ? [`Duplicate lessons: ${dupes.slice(0, 3).join(", ")}`] : []),
    ].slice(0, 16),
    selfEvaluation: selfEval,
    failedStages: finalPassed ? [] : ["quality-assurance"],
  };
}

function validateQa(output: QualityAssuranceOutput): ArchitectQualityReport {
  return {
    score: output.score,
    passed: output.passed,
    checks: [
      { id: "score", label: "Quality score",       status: output.score >= PUBLISH_THRESHOLD_QA ? "pass" : "fail", detail: `${output.score}/${PUBLISH_THRESHOLD_QA}` },
      { id: "self-eval", label: "Self-evaluation", status: output.selfEvaluation.overallScore >= PUBLISH_THRESHOLD_QA ? "pass" : "fail", detail: `${output.selfEvaluation.overallScore}` },
      { id: "placeholders", label: "No placeholders", status: output.blockedReasons.every((r) => !r.startsWith("Placeholder:")) ? "pass" : "fail", detail: "" },
    ],
    suggestions: output.blockedReasons,
  };
}

export async function runQualityAssuranceAgent(blueprint: ArchitectBlueprint, interview: AICourseArchitectInterview) {
  return runAgent({
    stage: "quality-assurance",
    input: { blueprint, interview },
    execute: async ({ blueprint: bp, interview: iv }) => buildQualityAssuranceOutput(bp, iv),
    validate: validateQa,
    maxAttempts: 1,
    minConfidence: PUBLISH_THRESHOLD_QA,
  });
}
