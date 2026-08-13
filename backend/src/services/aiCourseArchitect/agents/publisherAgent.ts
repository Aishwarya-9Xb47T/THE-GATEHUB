/**
 * V4 Agent 13 — Publisher AI
 */
import type { ArchitectBlueprint } from "../types.js";
import type { LatexFormatterOutput, PublisherOutput, QualityAssuranceOutput, StudentExperienceManifest } from "../orchestrator/contracts.js";
import type { ArchitectQualityReport } from "../types.js";
import { runAgent } from "../orchestrator/agentRunner.js";

function buildPublisherOutput(
  blueprint: ArchitectBlueprint,
  latex: LatexFormatterOutput,
  qa: QualityAssuranceOutput,
  experience: StudentExperienceManifest
): PublisherOutput {
  return {
    ready: qa.passed && latex.compileReady,
    lessonCount: experience.lessonCount,
    moduleCount: blueprint.modules.length,
    searchIndexReady: true,
    progressTrackingReady: true,
    certificateMetadataReady: Boolean(blueprint.certificateRequirements),
    analyticsMetadataReady: true,
  };
}

function validatePublisher(output: PublisherOutput): ArchitectQualityReport {
  return {
    score: output.ready ? 100 : 0,
    passed: output.ready,
    checks: [
      { id: "ready", label: "Publish ready", status: output.ready ? "pass" : "fail", detail: output.ready ? "All gates passed" : "Blocked" },
      { id: "metadata", label: "Metadata complete", status: output.searchIndexReady && output.progressTrackingReady ? "pass" : "fail", detail: "" },
    ],
    suggestions: output.ready ? [] : ["Resolve QA failures before publishing"],
  };
}

export async function runPublisherAgent(
  blueprint: ArchitectBlueprint,
  latex: LatexFormatterOutput,
  qa: QualityAssuranceOutput,
  experience: StudentExperienceManifest
) {
  return runAgent({
    stage: "publisher",
    input: { blueprint, latex, qa, experience },
    execute: async (input) => buildPublisherOutput(input.blueprint, input.latex, input.qa, input.experience),
    validate: validatePublisher,
    maxAttempts: 1,
    minConfidence: 100,
  });
}
