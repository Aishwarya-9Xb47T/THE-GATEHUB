/**
 * V4 — Planning pipeline (Agents 1 → 2 → 3)
 */
import type { PlanningPipelineInput, PlanningPipelineOutput, OrchestratorManifest } from "./contracts.js";
import { ORCHESTRATOR_VERSION } from "./contracts.js";
import { runCoursePlannerAgent } from "../agents/coursePlannerAgent.js";
import { runCurriculumArchitectAgent } from "../agents/curriculumArchitectAgent.js";
import { runModuleDesignerAgent } from "../agents/moduleDesignerAgent.js";
import { validateCurriculumBlueprint } from "../curriculumValidator.js";
import { enforceBlueprintStructure } from "../curriculumPlanner.js";
import { normalizeInterview, hasLearningComponent } from "../types.js";

export async function runPlanningPipeline(input: PlanningPipelineInput): Promise<PlanningPipelineOutput> {
  const interview = normalizeInterview(input.interview);
  const startedAt = new Date().toISOString();
  const manifest: OrchestratorManifest = {
    version: ORCHESTRATOR_VERSION,
    startedAt,
    planningStages: [],
    contentStages: [],
    deliveryStages: [],
    selfEvaluationScore: 0,
    readyToPublish: false,
  };

  const coursePlanner = await runCoursePlannerAgent(interview);
  if (!coursePlanner.output) {
    throw new Error(
      coursePlanner.errors.filter(Boolean).join("; ") || "course-planner produced no output"
    );
  }
  manifest.planningStages.push({
    stage: "course-planner",
    confidence: coursePlanner.confidence,
    passed: coursePlanner.success,
  });

  const curriculum = await runCurriculumArchitectAgent(interview);
  if (!curriculum.output?.blueprint) {
    throw new Error("curriculum-architect produced no blueprint");
  }
  manifest.planningStages.push({
    stage: "curriculum-architect",
    confidence: curriculum.confidence,
    passed: curriculum.success,
  });

  let blueprint = curriculum.output.blueprint;
  blueprint.orchestratorManifest = manifest;
  blueprint.coursePlannerOutput = coursePlanner.output;
  blueprint.researchReport = curriculum.output.research;
  blueprint.learningOutcomes =
    blueprint.learningOutcomes?.length >= 3
      ? blueprint.learningOutcomes
      : coursePlanner.output.learningOutcomes;
  blueprint.prerequisites =
    blueprint.prerequisites?.length ? blueprint.prerequisites : coursePlanner.output.prerequisites;
  blueprint.estimatedHours = blueprint.estimatedHours || coursePlanner.output.estimatedHours;

  const moduleDesigner = await runModuleDesignerAgent(blueprint, interview, coursePlanner.output);
  manifest.planningStages.push({
    stage: "module-designer",
    confidence: moduleDesigner.confidence,
    passed: moduleDesigner.success,
  });

  blueprint.moduleDesignerOutput = moduleDesigner.output;
  for (const spec of moduleDesigner.output.modules) {
    const mod = blueprint.modules.find((m) => m.id === spec.moduleId);
    if (mod) {
      mod.description = spec.summary || mod.description;
      mod.learningOutcomes = spec.expectedOutcomes.length ? spec.expectedOutcomes : mod.learningOutcomes;
    }
  }

  // Module designer may only enrich narratives — never change structural scale
  blueprint = enforceBlueprintStructure(blueprint, interview, blueprint.researchReport);

  blueprint.certificateRequirements =
    blueprint.certificateRequirements ??
    (interview.courseInfo.certificationEligible || hasLearningComponent(interview, "Certificate")
      ? coursePlanner.output.certificationGoals.join("; ")
      : undefined);

  const curriculumValidation = validateCurriculumBlueprint(blueprint, interview);
  manifest.selfEvaluationScore = Math.round(
    (coursePlanner.confidence + curriculum.confidence + moduleDesigner.confidence) / 3
  );

  blueprint.orchestratorManifest = { ...manifest, completedAt: new Date().toISOString() };

  return {
    coursePlan: coursePlanner.output,
    curriculum: curriculum.output,
    moduleDesign: moduleDesigner.output,
    blueprint,
    curriculumValidation,
    manifest: blueprint.orchestratorManifest,
  };
}
