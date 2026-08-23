/**
 * V6 — Delivery pipeline: Media → LaTeX → Student Experience → QA → Regen hint → QA → Student Simulation → Publisher
 *
 * SAFETY: Every agent `.output` access is null-guarded.
 * If the full async pipeline fails for any reason, we fall through to runFastDeliveryPipeline
 * which is synchronous, has no AI dependencies, and always produces a valid result.
 */
import type { DeliveryContext, DeliveryPipelineOutput, LatexFormatterOutput, StudentExperienceManifest } from "./contracts.js";
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
import type { ArchitectBlueprint, AICourseArchitectInterview } from "../types.js";

/** Build a safe LaTeX output when the agent fails or returns undefined. */
function safeFallbackLatex(blueprint: ArchitectBlueprint, interview: AICourseArchitectInterview): { project: ReturnType<typeof buildProjectFromBlueprint>["project"]; files: ReturnType<typeof buildProjectFromBlueprint>["files"]; latex: LatexFormatterOutput } {
  const { project, files } = buildProjectFromBlueprint(blueprint, interview);
  const lessonCount = blueprint.modules.reduce((n, m) => n + m.lessons.length, 0);
  const quizCount = files.filter((f) => /quiz-q-\d+\.tex$/i.test(f.name)).length;
  const labCount = files.filter((f) => /coding-lab/i.test(f.name)).length;
  return {
    project,
    files,
    latex: {
      fileCount: files.length,
      lessonCount,
      quizCount,
      labCount,
      compileReady: files.length > 0 && project.tracks.length > 0,
      warnings: [],
    },
  };
}

/** Build a safe student experience manifest when the agent fails. */
function safeFallbackExperience(blueprint: ArchitectBlueprint, latex: LatexFormatterOutput): StudentExperienceManifest {
  const blocks = ["hero", "progress", "objectives", "video", "theory", "expandable-concepts", "checkpoint"];
  if (latex.quizCount > 0) blocks.push("quiz-cards");
  if (latex.labCount > 0) blocks.push("coding-lab");
  blocks.push("discussion", "revision-notes", "completion-badge", "next-lesson");
  return {
    lessonCount: latex.lessonCount,
    stepsPerLessonAvg: blocks.length,
    interactiveBlocks: blocks,
    heroBanners: true,
    quizCards: latex.quizCount > 0,
    codingLabs: latex.labCount > 0,
    checkpointCards: true,
  };
}

export function runFastDeliveryPipeline(ctx: DeliveryContext): DeliveryPipelineOutput {
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
    console.info("[DELIVERY] Using fast delivery pipeline (AI_ARCHITECT_FAST_MODE=true)");
    return runFastDeliveryPipeline(ctx);
  }

  const stages: DeliveryPipelineOutput["stages"] = [];

  try {
    // ── Stage 1: Media Integration ──────────────────────────────────────────
    console.info("[DELIVERY] stage=media-integration starting");
    const mediaResult = await runMediaIntegrationAgent(ctx.blueprint, ctx.interview);
    // SAFETY: guard .output — if agent failed, fall back to the original blueprint
    let blueprint = mediaResult.output?.blueprint ?? ctx.blueprint;
    stages.push({ stage: "media-integration", confidence: mediaResult.confidence, passed: mediaResult.success });
    console.info("[DELIVERY] stage=media-integration done", { success: mediaResult.success, confidence: mediaResult.confidence });

    // ── Stage 2: LaTeX Formatter ─────────────────────────────────────────────
    console.info("[DELIVERY] stage=latex-formatter starting");
    const latexResult = await runLatexFormatterAgent(blueprint, ctx.interview);
    // SAFETY: guard .output — build the LaTeX project ourselves if agent returned undefined
    const latexOutput = latexResult.output ?? safeFallbackLatex(blueprint, ctx.interview);
    stages.push({ stage: "latex-formatter", confidence: latexResult.confidence, passed: latexResult.success });
    console.info("[DELIVERY] stage=latex-formatter done", {
      success: latexResult.success,
      fileCount: latexOutput.latex?.fileCount,
      compileReady: latexOutput.latex?.compileReady,
    });

    // ── Stage 3: Student Experience ──────────────────────────────────────────
    console.info("[DELIVERY] stage=student-experience starting");
    // SAFETY: pass latexOutput.latex (guaranteed non-undefined from above fallback)
    const experienceResult = await runStudentExperienceAgent(blueprint, ctx.interview, latexOutput.latex);
    // SAFETY: guard .output
    const experienceOutput = experienceResult.output ?? {
      manifest: safeFallbackExperience(blueprint, latexOutput.latex),
      hasVideo: false,
      hasQuiz: false,
    };
    stages.push({ stage: "student-experience", confidence: experienceResult.confidence, passed: experienceResult.success });
    console.info("[DELIVERY] stage=student-experience done", { success: experienceResult.success });

    // ── Stage 4: Quality Assurance ───────────────────────────────────────────
    console.info("[DELIVERY] stage=quality-assurance starting");
    const qaResult = await runQualityAssuranceAgent(blueprint, ctx.interview);
    // SAFETY: guard .output
    const qaOutput = qaResult.output ?? buildQualityAssuranceOutput(blueprint, ctx.interview);
    stages.push({ stage: "quality-assurance", confidence: qaResult.confidence, passed: qaResult.success });
    console.info("[DELIVERY] stage=quality-assurance done", { success: qaResult.success, score: qaOutput.score });

    // ── Stage 5: Student Simulation ──────────────────────────────────────────
    console.info("[DELIVERY] stage=student-simulation starting");
    const simResult = await runStudentSimulationAgent(blueprint, ctx.interview);
    // SAFETY: guard .output
    const simOutput = simResult.output ?? buildStudentSimulationOutput(blueprint, ctx.interview);
    stages.push({ stage: "student-simulation", confidence: simResult.confidence, passed: simResult.success });
    console.info("[DELIVERY] stage=student-simulation done", { success: simResult.success });

    // ── Stage 6: Publisher ───────────────────────────────────────────────────
    console.info("[DELIVERY] stage=publisher starting");
    const publisherResult = await runPublisherAgent(
      blueprint,
      latexOutput.latex,
      qaOutput,
      experienceOutput.manifest
    );
    const publishGate = evaluateProductionPublishGate(blueprint, ctx.interview);
    // SAFETY: guard .output
    const publisherOutput = publisherResult.output ?? {
      ready: false,
      lessonCount: blueprint.modules.reduce((n, m) => n + m.lessons.length, 0),
      moduleCount: blueprint.modules.length,
      searchIndexReady: true,
      progressTrackingReady: true,
      certificateMetadataReady: Boolean(blueprint.certificateRequirements),
      analyticsMetadataReady: true,
    };
    const publishReady =
      publisherOutput.ready &&
      qaOutput.passed &&
      simOutput.passed &&
      publishGate.ready;
    publisherOutput.ready = publishReady;
    stages.push({ stage: "publisher", confidence: publisherResult.confidence, passed: publishReady });
    console.info("[DELIVERY] stage=publisher done", { publishReady, publishGate: publishGate.ready });

    blueprint = enrichBlueprintPart4(attachKnowledgeGraphToBlueprint(blueprint), ctx.interview);
    const lessonCount = blueprint.modules.reduce((n, m) => n + m.lessons.length, 0);
    void recordGenerationOutcome({
      subject: ctx.interview.courseInfo.subject,
      lessonCount,
      overallScore: qaOutput.score,
      publishReady,
      dimensions: {
        qa: qaOutput.score,
        simulation: simOutput.score,
        gate: publishGate.score,
      },
    });

    blueprint.studentExperienceManifest = experienceOutput.manifest;

    if (blueprint.orchestratorManifest) {
      blueprint.orchestratorManifest.deliveryStages = stages;
      blueprint.orchestratorManifest.readyToPublish = publishReady;
      blueprint.orchestratorManifest.selfEvaluationScore = qaOutput.selfEvaluation.overallScore;
    }

    return {
      blueprint,
      media: mediaResult.output?.media ?? { videosAssigned: 0, lessonsWithVideo: 0, unassignedVideos: 0, placements: [] },
      latex: latexOutput.latex,
      studentExperience: experienceOutput.manifest,
      qualityAssurance: qaOutput,
      studentSimulation: simOutput,
      publisher: { ...publisherOutput, ready: publishReady },
      stages,
      projectBuild: {
        project: latexOutput.project,
        files: latexOutput.files,
      },
    };
  } catch (err) {
    // ── Safety Net: Full async pipeline failed — fall back to synchronous fast path ──
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DELIVERY] Full async pipeline failed — falling back to fast delivery pipeline:", {
      error: msg,
      stagesCompleted: stages.map((s) => s.stage),
    });
    return runFastDeliveryPipeline(ctx);
  }
}

