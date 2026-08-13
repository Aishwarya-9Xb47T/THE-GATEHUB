/**
 * Phase 7 — V4 orchestrated content generation (Agents 4 → 8 per lesson).
 */
import type { AICourseArchitectInterview, ArchitectBlueprint, ArchitectQualityReport } from "./types.js";
import { runContentPipeline } from "./orchestrator/lessonPipeline.js";
import { runImprovementLoop } from "./orchestrator/improvementLoop.js";

export async function populateApprovedBlueprint(
  skeleton: ArchitectBlueprint,
  interview: AICourseArchitectInterview,
  onProgress?: (msg: string, pct: number) => void
): Promise<{ blueprint: ArchitectBlueprint; qualityReport: ArchitectQualityReport }> {
  const result = await runContentPipeline({
    interview,
    blueprint: skeleton,
    coursePlan: skeleton.coursePlannerOutput,
    moduleDesign: skeleton.moduleDesignerOutput,
    onProgress,
  });

  const improved = await runImprovementLoop(result.blueprint, interview, onProgress);
  const qualityReport = {
    ...result.qualityReport,
    score: improved.finalScore,
    passed: improved.readyToPublish,
  };

  return { blueprint: improved.blueprint, qualityReport };
}

export { generateLessonContent } from "./lessonContentEngineCore.js";
