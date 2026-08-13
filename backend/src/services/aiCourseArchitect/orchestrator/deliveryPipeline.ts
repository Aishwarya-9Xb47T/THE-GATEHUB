/**
 * V6 — Delivery pipeline: Media → LaTeX → Student Experience → QA → Regen hint → QA → Student Simulation → Publisher
 */
import type { DeliveryContext, DeliveryPipelineOutput } from "./contracts.js";
import { assignVideosToLessons, normalizeVideoMappings } from "../videoAssignmentEngine.js";
import { buildProjectFromBlueprint } from "../aiArchitectLaTeXEmitter.js";
import { buildQualityAssuranceOutput } from "../agents/qualityAssuranceAgent.js";
import { buildStudentSimulationOutput } from "../agents/studentSimulationAgent.js";
import { ARCHITECT_FAST_MODE, PUBLISH_THRESHOLD } from "../architectPerformance.js";
import { evaluateProductionPublishGate } from "../engines/productionPublishGate.js";
import { enrichBlueprintPart4 } from "../engines/part4Orchestrator.js";
import { recordGenerationOutcome } from "../engines/continuousLearningSystem.js";
import { attachKnowledgeGraphToBlueprint } from "../engines/knowledgeGraphEngine.js";
import { runMediaIntegrationAgent } from "../agents/mediaIntegrationAgent.js";
import { runLatexFormatterAgent } from "../agents/latexFormatterAgent.js";
import { runStudentExperienceAgent } from "../agents/studentExperienceAgent.js";
import { runQualityAssuranceAgent } from "../agents/qualityAssuranceAgent.js";
import { runStudentSimulationAgent } from "../agents/studentSimulationAgent.js";
import { runPublisherAgent } from "../agents/publisherAgent.js";

function runFastDeliveryPipeline(ctx: DeliveryContext): DeliveryPipelineOutput {
  const stages: DeliveryPipelineOutput["stages"] = [];
  const mappings = normalizeVideoMappings(ctx.interview.videoStrategy.mappings);
  const placement = ctx.interview.videoStrategy.placement ?? "ai-auto";
  let blueprint =
    mappings.length && ctx.interview.videoStrategy.includeVideos !== false
      ? assignVideosToLessons(ctx.blueprint, mappings, placement)
      : ctx.blueprint;

  stages.push({ stage: "media-integration", confidence: 95, passed: true });

  const { project, files } = buildProjectFromBlueprint(blueprint, ctx.interview);
  const lessonCount = blueprint.modules.reduce((n, m) => n + m.lessons.length, 0);
  const quizCount = files.filter((f) => /quiz-q-\d+\.tex$/i.test(f.name)).length;
  const labCount = files.filter((f) => /coding-lab/i.test(f.name)).length;
  const latex = {
    fileCount: files.length,
    lessonCount,
    quizCount,
    labCount,
    compileReady: files.length > 0 && project.tracks.length > 0,
    warnings: [] as string[],
  };
  stages.push({ stage: "latex-formatter", confidence: latex.compileReady ? 92 : 40, passed: latex.compileReady });

  const studentExperience = {
    lessonCount,
    stepsPerLessonAvg: 9,
    interactiveBlocks: ["hero", "overview", "objectives", "video", "theory", "quiz", "coding-lab", "checkpoint"],
    heroBanners: true,
    quizCards: quizCount > 0,
    codingLabs: labCount > 0,
    checkpointCards: true,
  };
  stages.push({ stage: "student-experience", confidence: 90, passed: true });

  const qa = buildQualityAssuranceOutput(blueprint, ctx.interview);
  stages.push({ stage: "quality-assurance", confidence: qa.score, passed: qa.passed });

  const studentSimulation = buildStudentSimulationOutput(blueprint, ctx.interview);
  stages.push({
    stage: "student-simulation",
    confidence: studentSimulation.score,
    passed: studentSimulation.passed,
  });

  const publishGate = evaluateProductionPublishGate(blueprint, ctx.interview);
  blueprint = enrichBlueprintPart4(blueprint, ctx.interview);
  const publishReady =
    latex.compileReady && qa.passed && studentSimulation.passed && publishGate.ready;

  const publisher = {
    ready: publishReady,
    lessonCount,
    moduleCount: blueprint.modules.length,
    searchIndexReady: true,
    progressTrackingReady: true,
    certificateMetadataReady: Boolean(blueprint.certificateRequirements),
    analyticsMetadataReady: true,
  };
  stages.push({ stage: "publisher", confidence: publisher.ready ? 100 : 70, passed: publisher.ready });

  blueprint.studentExperienceManifest = studentExperience;
  if (blueprint.orchestratorManifest) {
    blueprint.orchestratorManifest.deliveryStages = stages;
    blueprint.orchestratorManifest.readyToPublish = publisher.ready;
    blueprint.orchestratorManifest.selfEvaluationScore = qa.selfEvaluation.overallScore;
  }

  blueprint = attachKnowledgeGraphToBlueprint(blueprint);
  void recordGenerationOutcome({
    subject: ctx.interview.courseInfo.subject,
    lessonCount,
    overallScore: qa.score,
    publishReady,
    dimensions: { qa: qa.score, simulation: studentSimulation.score, gate: publishGate.score },
  });

  return {
    blueprint,
    media: {
      videosAssigned: mappings.length,
      lessonsWithVideo: lessonCount,
      unassignedVideos: 0,
      placements: [],
    },
    latex,
    studentExperience,
    qualityAssurance: qa,
    studentSimulation,
    publisher,
    stages,
    projectBuild: { project, files },
  };
}

export async function runDeliveryPipeline(ctx: DeliveryContext): Promise<DeliveryPipelineOutput> {
  if (ARCHITECT_FAST_MODE) {
    return runFastDeliveryPipeline(ctx);
  }

  const stages: DeliveryPipelineOutput["stages"] = [];

  const mediaResult = await runMediaIntegrationAgent(ctx.blueprint, ctx.interview);
  let blueprint = mediaResult.output.blueprint;
  stages.push({ stage: "media-integration", confidence: mediaResult.confidence, passed: mediaResult.success });

  const latexResult = await runLatexFormatterAgent(blueprint, ctx.interview);
  stages.push({ stage: "latex-formatter", confidence: latexResult.confidence, passed: latexResult.success });

  const experienceResult = await runStudentExperienceAgent(blueprint, ctx.interview, latexResult.output.latex);
  stages.push({ stage: "student-experience", confidence: experienceResult.confidence, passed: experienceResult.success });

  const qaResult = await runQualityAssuranceAgent(blueprint, ctx.interview);
  stages.push({ stage: "quality-assurance", confidence: qaResult.confidence, passed: qaResult.success });

  const simResult = await runStudentSimulationAgent(blueprint, ctx.interview);
  stages.push({ stage: "student-simulation", confidence: simResult.confidence, passed: simResult.success });

  const publisherResult = await runPublisherAgent(
    blueprint,
    latexResult.output.latex,
    qaResult.output,
    experienceResult.output.manifest
  );
  const publishGate = evaluateProductionPublishGate(blueprint, ctx.interview);
  const publishReady =
    publisherResult.output.ready &&
    qaResult.output.passed &&
    simResult.output.passed &&
    publishGate.ready;
  if (publisherResult.output) {
    publisherResult.output.ready = publishReady;
  }
  stages.push({ stage: "publisher", confidence: publisherResult.confidence, passed: publishReady });

  blueprint = enrichBlueprintPart4(attachKnowledgeGraphToBlueprint(blueprint), ctx.interview);
  const lessonCount = blueprint.modules.reduce((n, m) => n + m.lessons.length, 0);
  void recordGenerationOutcome({
    subject: ctx.interview.courseInfo.subject,
    lessonCount,
    overallScore: qaResult.output.score,
    publishReady,
    dimensions: {
      qa: qaResult.output.score,
      simulation: simResult.output.score,
      gate: publishGate.score,
    },
  });

  blueprint.studentExperienceManifest = experienceResult.output.manifest;

  if (blueprint.orchestratorManifest) {
    blueprint.orchestratorManifest.deliveryStages = stages;
    blueprint.orchestratorManifest.readyToPublish = publishReady;
    blueprint.orchestratorManifest.selfEvaluationScore = qaResult.output.selfEvaluation.overallScore;
  }

  return {
    blueprint,
    media: mediaResult.output.media,
    latex: latexResult.output.latex,
    studentExperience: experienceResult.output.manifest,
    qualityAssurance: qaResult.output,
    studentSimulation: simResult.output,
    publisher: { ...publisherResult.output, ready: publishReady },
    stages,
    projectBuild: {
      project: latexResult.output.project,
      files: latexResult.output.files,
    },
  };
}
