/**
 * V4 — AI Orchestrator entry point.
 * Coordinates planning → content → delivery agent pipelines.
 */
export {
  ORCHESTRATOR_VERSION,
  type AgentResult,
  type AgentStageId,
  type OrchestratorManifest,
  type PlanningPipelineInput,
  type PlanningPipelineOutput,
  type ContentPipelineInput,
  type ContentPipelineOutput,
  type DeliveryContext,
  type DeliveryPipelineOutput,
} from "./contracts.js";

export { runAgent } from "./agentRunner.js";
export { runPlanningPipeline } from "./planningPipeline.js";
export { runContentPipeline, runLessonPipeline } from "./lessonPipeline.js";
export { runDeliveryPipeline } from "./deliveryPipeline.js";
export { runSelfEvaluation } from "./selfEvaluator.js";
export { detectFailedComponents, regenerateFailedComponents } from "./componentRegenerator.js";
export { runImprovementLoop } from "./improvementLoop.js";
export {
  orchestratePlanning,
  orchestrateContent,
  orchestrateDelivery,
} from "./AIOrchestrator.js";
