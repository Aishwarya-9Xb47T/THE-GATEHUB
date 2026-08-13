/**
 * V6 — AI Orchestrator (extends V5; backward compatible).
 */
import type { AICourseArchitectInterview, ArchitectBlueprint, ArchitectQualityReport } from "../types.js";
import { normalizeInterview } from "../types.js";
import { runPlanningPipeline } from "./planningPipeline.js";
import { runContentPipeline } from "./lessonPipeline.js";
import { runDeliveryPipeline } from "./deliveryPipeline.js";
import { runImprovementLoop } from "./improvementLoop.js";
import type { DeliveryPipelineOutput, OrchestratorManifest, PlanningPipelineOutput } from "./contracts.js";

export type OrchestratorPhase = "planning" | "content" | "delivery" | "full-content";

export interface OrchestratorOptions {
  interview: AICourseArchitectInterview;
  blueprint?: ArchitectBlueprint;
  onProgress?: (msg: string, pct: number) => void;
}

export interface OrchestratorContentResult {
  blueprint: ArchitectBlueprint;
  qualityReport: ArchitectQualityReport;
  manifest: OrchestratorManifest;
  improvement: { roundsRun: number; lessonsImproved: number; finalScore: number };
}

/** Agents 1 → 3: Course vision → curriculum structure (no lesson bodies). */
export async function orchestratePlanning(opts: OrchestratorOptions): Promise<PlanningPipelineOutput> {
  return runPlanningPipeline({ interview: normalizeInterview(opts.interview) });
}

/** Agents 4 → 8 + self-improvement until quality threshold. */
export async function orchestrateContent(opts: OrchestratorOptions): Promise<OrchestratorContentResult> {
  if (!opts.blueprint?.modules?.length) {
    throw new Error("Approved blueprint required for content orchestration");
  }
  const interview = normalizeInterview(opts.interview);
  const content = await runContentPipeline({
    interview,
    blueprint: opts.blueprint,
    coursePlan: opts.blueprint.coursePlannerOutput,
    moduleDesign: opts.blueprint.moduleDesignerOutput,
    onProgress: opts.onProgress,
  });

  const improvement = await runImprovementLoop(content.blueprint, interview, opts.onProgress);

  const qualityReport: ArchitectQualityReport = {
    ...content.qualityReport,
    score: improvement.finalScore,
    passed: improvement.readyToPublish,
  };

  if (improvement.blueprint.orchestratorManifest) {
    improvement.blueprint.orchestratorManifest.selfEvaluationScore = improvement.finalScore;
    improvement.blueprint.orchestratorManifest.readyToPublish = improvement.readyToPublish;
  }

  return {
    blueprint: improvement.blueprint,
    qualityReport,
    manifest: improvement.blueprint.orchestratorManifest ?? content.manifest,
    improvement: {
      roundsRun: improvement.roundsRun,
      lessonsImproved: improvement.lessonsImproved,
      finalScore: improvement.finalScore,
    },
  };
}

/** Agents 9 → 13: Media, LaTeX, student experience, QA gate, publish readiness. */
export async function orchestrateDelivery(opts: OrchestratorOptions): Promise<DeliveryPipelineOutput> {
  if (!opts.blueprint?.modules?.length) {
    throw new Error("Generated blueprint required for delivery orchestration");
  }
  return runDeliveryPipeline({
    interview: normalizeInterview(opts.interview),
    blueprint: opts.blueprint,
  });
}
