/**
 * Backward-compatible wrapper — delegates to V4 orchestrator lesson pipeline.
 */
import type {
  AICourseArchitectInterview,
  ArchitectBlueprint,
  ArchitectLessonBlueprint,
  ArchitectModuleBlueprint,
  ArchitectQualityReport,
} from "../types.js";
import { runLessonPipeline } from "../orchestrator/lessonPipeline.js";

export type PipelineLessonResult = {
  lesson: ArchitectLessonBlueprint;
  qualityReport: ArchitectQualityReport;
};

/** Generate one lesson through the full multi-agent pipeline. */
export async function generateLessonThroughPipeline(
  skeleton: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  modIndex: number,
  lessonIndex: number,
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): Promise<PipelineLessonResult> {
  const result = await runLessonPipeline({
    interview,
    blueprint,
    mod,
    modIndex,
    lessonIndex,
    skeleton,
    moduleDesign: blueprint.moduleDesignerOutput?.modules.find((m) => m.moduleId === mod.id),
    coursePlan: blueprint.coursePlannerOutput,
  });
  return { lesson: result.lesson, qualityReport: result.qualityReport };
}
