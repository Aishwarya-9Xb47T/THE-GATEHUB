/**
 * V6 — Per-lesson multi-agent pipeline with RAG, adaptive profile, and field ownership.
 */
import type {
  ContentPipelineInput,
  ContentPipelineOutput,
  LessonPipelineContext,
  LessonPipelineResult,
  OrchestratorManifest,
} from "./contracts.js";
import { ORCHESTRATOR_VERSION } from "./contracts.js";
import { runLessonPlannerAgent } from "../agents/lessonPlannerAgent.js";
import { runInstructionalDesignerAgent } from "../agents/instructionalDesignerAgent.js";
import { runLessonWriterAgent } from "../agents/lessonWriterAgent.js";
import { runCodeGeneratorAgent, applyCodeToLesson } from "../agents/codeGeneratorAgent.js";
import { runCodeValidationAgent } from "../agents/codeValidationAgent.js";
import { runAssessmentAgent } from "../agents/assessmentAgent.js";
import { runCodingLabAgent } from "../agents/codingLabAgent.js";
import { runAssignmentAgent } from "../agents/assignmentAgent.js";
import { runProjectAgent, applyProjectToLesson } from "../agents/projectAgent.js";
import { runYoutubeRecommendationAgent } from "../agents/youtubeRecommendationAgent.js";
import { runResearchPaperAgent } from "../agents/researchPaperAgent.js";
import { runRevisionNotesAgent } from "../agents/revisionNotesAgent.js";
import { runReferenceAgent } from "../agents/referenceAgent.js";
import { runInterviewQuestionAgent } from "../agents/interviewQuestionAgent.js";
import { runGlossaryAgent } from "../agents/glossaryAgent.js";
import { runDiagramAgent, applyDiagramsToLesson } from "../agents/diagramAgent.js";
import { runVisualContentAgent } from "../agents/visualContentAgent.js";
import { buildAdaptiveProfile } from "../adaptiveProfile.js";
import { retrieveForLesson, attachRetrievalToPlan } from "../retrieval/retrievalService.js";
import { verifyLessonFactualSurface } from "../retrieval/factualVerifier.js";
import { auditLessonFacts } from "../retrieval/hallucinationGuard.js";
import { buildCourseMemory, formatMemoryForAgent } from "../engines/courseMemory.js";
import { validateAndFilterDiagrams, buildFallbackMermaid, convertFlowchartBlockToMermaid } from "../engines/diagramValidator.js";
import { enrichVisualContent } from "../engines/visualQuality.js";
import { rankYouTubeCandidates } from "../engines/youtubeRanking.js";
import { attachTestsToLab } from "../engines/testGenerator.js";
import { computeLessonAnalytics } from "../engines/learningAnalytics.js";
import { computeLessonQualityDimensions } from "../engines/lessonQualityScore.js";
import { generateLessonAccessibility } from "../engines/accessibilityEngine.js";
import { enrichLessonPart4, enrichBlueprintPart4 } from "../engines/part4Orchestrator.js";
import { analyzeCurriculumGaps } from "../engines/knowledgeGapAnalyzer.js";
import { reviewLessonContent, reviewFullBlueprint } from "../pipeline/qualityReviewer.js";
import { attachKnowledgeGraphToBlueprint } from "../engines/knowledgeGraphEngine.js";
import { attachCourseAnalytics } from "../engines/learningAnalytics.js";
import { runSelfEvaluation } from "./selfEvaluator.js";
import { detectFailedComponents, regenerateFailedComponents } from "./componentRegenerator.js";
import { hasLearningComponent } from "../types.js";
import type { ArchitectLessonBlueprint, ArchitectQualityReport } from "../types.js";
import {
  LESSON_CONCURRENCY,
  MAX_COMPONENT_RETRIES,
  PARALLEL_QUIZ_AND_LAB,
  PUBLISH_THRESHOLD,
  SELF_HEALING_THRESHOLD,
  ARCHITECT_FAST_MODE,
  shouldRunLessonProjectAgent,
} from "../architectPerformance.js";

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const pool = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: pool }, async () => {
      while (true) {
        const idx = next++;
        if (idx >= items.length) break;
        await worker(items[idx]);
      }
    })
  );
}

function pushStage(
  stages: LessonPipelineResult["stages"],
  stage: LessonPipelineResult["stages"][number]["stage"],
  confidence: number,
  passed: boolean
) {
  stages.push({ stage, confidence, passed });
}

export async function runLessonPipeline(ctx: LessonPipelineContext): Promise<LessonPipelineResult> {
  const stages: LessonPipelineResult["stages"] = [];
  const adaptiveProfile = ctx.adaptiveProfile ?? buildAdaptiveProfile(ctx.interview);
  let pipelineCtx: LessonPipelineContext = { ...ctx, adaptiveProfile };

  // Lesson Planner → Instructional Designer (shared Lesson Blueprint bus)
  const plannerResult = await runLessonPlannerAgent(pipelineCtx);
  pushStage(stages, "lesson-planner", plannerResult.confidence, plannerResult.success);
  pipelineCtx = { ...pipelineCtx, baseLessonPlan: plannerResult.output };

  const planResult = await runInstructionalDesignerAgent(pipelineCtx);
  pushStage(stages, "instructional-designer", planResult.confidence, planResult.success);
  let plan = planResult.output;

  // V6 RAG — retrieve before knowledge-producing agents
  const retrievalBundle = await retrieveForLesson(pipelineCtx, plan);
  pipelineCtx = { ...pipelineCtx, retrievalBundle };
  plan = attachRetrievalToPlan({ ...plan, adaptiveProfile }, retrievalBundle);

  const courseMemory = buildCourseMemory(pipelineCtx.blueprint);
  pipelineCtx = {
    ...pipelineCtx,
    memoryContext: formatMemoryForAgent(courseMemory, pipelineCtx.skeleton),
  };

  // Agent 3 — Lesson Writer (prose only; grounded in retrieval)
  const writerResult = await runLessonWriterAgent(pipelineCtx, plan);
  let lesson = writerResult.output;
  pushStage(stages, "lesson-writer", writerResult.confidence, writerResult.success);

  const factChecks = auditLessonFacts(lesson, retrievalBundle);
  if (factChecks.some((c) => c.verdict === "unsupported")) {
    pushStage(stages, "lesson-writer", Math.min(writerResult.confidence, 65), false);
  }

  // Agent 4 — Code Generator + Agent 5 — Code Validation
  if (plan.requiredCode || hasLearningComponent(pipelineCtx.interview, "Coding")) {
    const codeResult = await runCodeGeneratorAgent(pipelineCtx, plan, lesson);
    lesson = applyCodeToLesson(lesson, codeResult.output);
    pushStage(stages, "code-generator", codeResult.confidence, codeResult.success);

    const validationResult = await runCodeValidationAgent(pipelineCtx, plan, lesson);
    lesson = validationResult.output.lesson;
    pushStage(stages, "code-validation", validationResult.confidence, validationResult.success);
  }

  // Parallel: Diagram + Visual + Video (independent fields)
  const [diagramSettled, visualSettled, videoSettled] = await Promise.all([
    plan.requiredDiagrams || plan.useDiagrams
      ? runDiagramAgent(pipelineCtx, plan, lesson)
      : Promise.resolve(null),
    plan.useVisuals || plan.requiredTables
      ? runVisualContentAgent(pipelineCtx, plan, lesson)
      : Promise.resolve(null),
    runYoutubeRecommendationAgent(pipelineCtx, plan, lesson),
  ]);
  if (diagramSettled) {
    const rawDiagrams = [
      ...(diagramSettled.output.diagrams ?? []),
      ...(diagramSettled.output.flowchart
        ? [{ type: "flowchart", mermaid: convertFlowchartBlockToMermaid(diagramSettled.output.flowchart), caption: "Lesson flow" }]
        : []),
    ];
    const { valid, invalid } = validateAndFilterDiagrams(rawDiagrams);
    const diagrams =
      valid.length > 0
        ? valid
        : [{ type: "flowchart", mermaid: buildFallbackMermaid(lesson.title), caption: `Learning path for ${lesson.title}` }];
    lesson = applyDiagramsToLesson(lesson, { ...diagramSettled.output, diagrams });
    pushStage(stages, "diagram", invalid.length ? 75 : diagramSettled.confidence, valid.length > 0);
  }
  if (visualSettled) {
    const visuals = Array.isArray(visualSettled.output)
      ? visualSettled.output
      : (visualSettled.output as { visuals?: ArchitectLessonBlueprint["visualContent"] }).visuals ?? visualSettled.output;
    lesson = { ...lesson, visualContent: enrichVisualContent(lesson, visuals as ArchitectLessonBlueprint["visualContent"]) };
    pushStage(stages, "visual-content", visualSettled.confidence, visualSettled.success);
  }
  lesson = {
    ...lesson,
    videos: rankYouTubeCandidates(videoSettled.output, lesson.title, lesson.objectives),
  };
  pushStage(stages, "video-recommendation", videoSettled.confidence, videoSettled.success);

  // Parallel: Research + Reference + Glossary
  const [researchSettled, glossarySettled, refSettled] = await Promise.all([
    runResearchPaperAgent(pipelineCtx, plan, lesson),
    runGlossaryAgent(pipelineCtx, plan, lesson),
    plan.requiredReferences || hasLessonStructureReferences(pipelineCtx)
      ? runReferenceAgent(pipelineCtx, plan, lesson)
      : Promise.resolve(null),
  ]);
  lesson = { ...lesson, researchPapers: researchSettled.output };
  pushStage(stages, "research-paper", researchSettled.confidence, researchSettled.success);
  lesson = {
    ...lesson,
    glossary: glossarySettled.output.map((t) => ({
      term: t.term,
      definition: t.definition,
      category: t.category,
      relatedTerms: t.relatedTerms,
      difficulty: t.difficulty,
    })),
  };
  pushStage(stages, "glossary", glossarySettled.confidence, glossarySettled.success);
  if (refSettled) {
    lesson = { ...lesson, lessonReferences: refSettled.output };
    pushStage(stages, "reference", refSettled.confidence, refSettled.success);
  }

  // Agent 15 — Revision (sequential before quiz — uses lesson content)
  const revisionResult = await runRevisionNotesAgent(pipelineCtx, plan, lesson);
  lesson.revisionNotes = revisionResult.output;
  pushStage(stages, "revision-notes", revisionResult.confidence, revisionResult.success);

  const wantsQuiz = plan.requiredQuiz || hasLearningComponent(pipelineCtx.interview, "Quiz");
  const wantsLab = plan.requiredLab || hasLearningComponent(pipelineCtx.interview, "Coding");

  // Agents 6 + 5 — Quiz + Coding Lab (parallel when both needed)
  if (wantsQuiz && wantsLab && PARALLEL_QUIZ_AND_LAB) {
    const [quizResult, labResult] = await Promise.all([
      runAssessmentAgent(pipelineCtx, plan, lesson),
      runCodingLabAgent(pipelineCtx, plan, lesson),
    ]);
    lesson.quizQuestions = quizResult.output;
    pushStage(stages, "assessment", quizResult.confidence, quizResult.success);
    if (labResult.output) {
      lesson.codingLab = attachTestsToLab(labResult.output);
      pushStage(stages, "coding-lab", labResult.confidence, labResult.success);
    }
  } else {
    if (wantsQuiz) {
      const quizResult = await runAssessmentAgent(pipelineCtx, plan, lesson);
      lesson.quizQuestions = quizResult.output;
      pushStage(stages, "assessment", quizResult.confidence, quizResult.success);
    }
    if (wantsLab) {
      const labResult = await runCodingLabAgent(pipelineCtx, plan, lesson);
      if (labResult.output) {
        lesson.codingLab = attachTestsToLab(labResult.output);
        pushStage(stages, "coding-lab", labResult.confidence, labResult.success);
      }
    }
  }

  // Parallel: Assignment + Interview (independent fields)
  const [assignmentSettled, interviewSettled] = await Promise.all([
    plan.requiredAssignment ||
    hasLearningComponent(pipelineCtx.interview, "Assignment") ||
    hasLearningComponent(pipelineCtx.interview, "Project")
      ? runAssignmentAgent(pipelineCtx, plan, lesson)
      : Promise.resolve(null),
    plan.requiredInterviewPrep || hasLearningComponent(pipelineCtx.interview, "Interview Questions")
      ? runInterviewQuestionAgent(pipelineCtx, plan, lesson)
      : Promise.resolve(null),
  ]);
  if (assignmentSettled) {
    lesson = { ...lesson, assignment: assignmentSettled.output };
    pushStage(stages, "assignment", assignmentSettled.confidence, assignmentSettled.success);
  }
  if (interviewSettled) {
    lesson = {
      ...lesson,
      interviewQuestions: interviewSettled.output.map((q) => ({
        question: q.question,
        answer: q.answer,
        difficulty: q.difficulty,
        category: q.category,
        hints: q.hints,
        keyPoints: q.keyPoints,
      })),
    };
    pushStage(stages, "interview-prep", interviewSettled.confidence, interviewSettled.success);
  }
  const runProject = shouldRunLessonProjectAgent(
    pipelineCtx.mod,
    pipelineCtx.lessonIndex,
    hasLearningComponent(pipelineCtx.interview, "Project")
  );
  if (runProject) {
    const projectResult = await runProjectAgent(pipelineCtx.mod, lesson, pipelineCtx.interview, plan);
    pushStage(stages, "project", projectResult.confidence, projectResult.success);
    if (projectResult.output) {
      lesson = applyProjectToLesson(lesson, projectResult.output);
    }
  }

  let qualityReport = reviewLessonContent(lesson, pipelineCtx.interview);
  const factual = verifyLessonFactualSurface(lesson);
  if (!factual.passed) {
    qualityReport = {
      ...qualityReport,
      passed: false,
      score: Math.min(qualityReport.score, Math.round(factual.confidence * 100)),
      checks: [
        ...qualityReport.checks,
        { id: "factual-surface", label: "Factual verification", status: "fail", detail: factual.failures.slice(0, 2).join("; ") },
      ],
      suggestions: [...qualityReport.suggestions, ...factual.failures],
    };
  }

  let attempt = 0;

  while (
    !qualityReport.passed &&
    qualityReport.score < SELF_HEALING_THRESHOLD &&
    attempt < MAX_COMPONENT_RETRIES
  ) {
    attempt++;
    const failed = detectFailedComponents(qualityReport, pipelineCtx.interview);
    const retryHint = qualityReport.suggestions.join("; ") || "Improve depth and remove placeholders";
    lesson = await regenerateFailedComponents(pipelineCtx, plan, lesson, failed.length ? failed : ["theory"], retryHint);
    qualityReport = reviewLessonContent(lesson, pipelineCtx.interview);
  }

  lesson.contentStatus = qualityReport.passed ? "validated" : "generated";
  lesson.learningAnalytics = computeLessonAnalytics(lesson, pipelineCtx.interview);
  lesson.qualityDimensions = computeLessonQualityDimensions(lesson, pipelineCtx.interview);
  generateLessonAccessibility(lesson);

  const totalLessons = pipelineCtx.blueprint.modules.reduce((n, m) => n + m.lessons.length, 0);
  lesson = enrichLessonPart4(
    lesson,
    plan,
    pipelineCtx,
    pipelineCtx.lessonIndex,
    totalLessons,
    retrievalBundle.overallConfidence
  );

  return {
    lesson,
    plan,
    quiz: lesson.quizQuestions,
    lab: lesson.codingLab,
    stages,
    qualityReport,
  };
}

function hasLessonStructureReferences(ctx: LessonPipelineContext): boolean {
  return (ctx.interview.lessonStructure ?? []).includes("references");
}

export async function runContentPipeline(input: ContentPipelineInput): Promise<ContentPipelineOutput> {
  let blueprint = structuredClone(input.blueprint);
  blueprint.phase = "generated";

  const manifest: OrchestratorManifest = blueprint.orchestratorManifest ?? {
    version: ORCHESTRATOR_VERSION,
    startedAt: new Date().toISOString(),
    planningStages: [],
    contentStages: [],
    deliveryStages: [],
    selfEvaluationScore: 0,
    readyToPublish: false,
  };

  const tasks: Array<{ modIndex: number; lessonIndex: number }> = [];
  blueprint.modules.forEach((mod, mi) => {
    mod.lessons.forEach((_, li) => tasks.push({ modIndex: mi, lessonIndex: li }));
  });

  const total = tasks.length;
  let done = 0;
  const lessonChecks: ArchitectQualityReport["checks"] = [];

  await runWithConcurrency(tasks, LESSON_CONCURRENCY, async ({ modIndex, lessonIndex }) => {
    const mod = blueprint.modules[modIndex];
    const skeleton = mod.lessons[lessonIndex];
    input.onProgress?.(
      `Module ${modIndex + 1}/${blueprint.modules.length}: ${skeleton.title} (${done}/${total})`,
      Math.round((done / total) * 85)
    );

    const ctx: LessonPipelineContext = {
      interview: input.interview,
      blueprint,
      mod,
      modIndex,
      lessonIndex,
      skeleton,
      moduleDesign: input.moduleDesign?.modules.find((m) => m.moduleId === mod.id),
      coursePlan: input.coursePlan ?? blueprint.coursePlannerOutput,
    };

    const result = await runLessonPipeline(ctx);
    blueprint.modules[modIndex].lessons[lessonIndex] = result.lesson;

    for (const s of result.stages) {
      manifest.contentStages.push({ ...s, lessonId: skeleton.id });
    }

    lessonChecks.push({
      id: `lesson-${skeleton.id}`,
      label: skeleton.title,
      status: result.qualityReport.passed ? "pass" : result.qualityReport.score >= 80 ? "warn" : "fail",
      detail: `Score ${result.qualityReport.score}/100`,
    });

    done++;
    const moduleDone = blueprint.modules[modIndex].lessons.filter(
      (l) => l.contentStatus === "generated" || l.contentStatus === "validated"
    ).length;
    const moduleTotal = blueprint.modules[modIndex].lessons.length;
    input.onProgress?.(
      `Module ${modIndex + 1}/${blueprint.modules.length}: ${moduleDone}/${moduleTotal} lessons · overall ${done}/${total}`,
      Math.round((done / total) * 85)
    );
  });

  const fullReview = reviewFullBlueprint(blueprint, input.interview);
  const selfEval = runSelfEvaluation(blueprint, input.interview, fullReview.score);

  const withGraph = attachKnowledgeGraphToBlueprint(blueprint);
  const { blueprint: withAnalytics } = attachCourseAnalytics(withGraph, input.interview);
  blueprint = enrichBlueprintPart4(withAnalytics, input.interview);

  const gapAnalysis = analyzeCurriculumGaps(blueprint, input.interview);
  if (gapAnalysis.regenTargets.length && !ARCHITECT_FAST_MODE) {
    manifest.contentStages.push({
      stage: "quality-assurance",
      confidence: gapAnalysis.score,
      passed: gapAnalysis.score >= 70,
      lessonId: "curriculum-gap-analysis",
    });
  }

  manifest.selfEvaluationScore = selfEval.overallScore;
  manifest.readyToPublish = selfEval.overallScore >= PUBLISH_THRESHOLD && fullReview.passed;
  manifest.completedAt = new Date().toISOString();
  blueprint.orchestratorManifest = manifest;

  const qualityReport: ArchitectQualityReport = {
    score: Math.round((fullReview.score + selfEval.overallScore) / 2),
    passed: manifest.readyToPublish,
    checks: [...lessonChecks, ...fullReview.checks.slice(0, 15)],
    suggestions: [...fullReview.suggestions, ...selfEval.improvements],
  };

  return { blueprint, qualityReport, manifest };
}
