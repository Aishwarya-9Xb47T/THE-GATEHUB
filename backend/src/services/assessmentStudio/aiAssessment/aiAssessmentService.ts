import { randomUUID } from "crypto";
import { prisma } from "../../../utils/prisma.js";
import { AppError } from "../../../middlewares/errorHandler.js";
import type { ImportSourceType } from "../import/types.js";
import { extractRawContent } from "./aiContentBridge.js";
import { buildTopicContent } from "./aiAssessmentGenerator.js";
import { materializeQuizFromImportDrafts } from "../import/importQuizMaterializer.js";
import { buildQuizEditorSnapshot } from "../../quizBuilder/quizBuilderService.js";
import {
  generateAssessment,
  generateRemainingQuestions,
  validateQuizGenerationConfiguration,
  buildGenerationCoverage,
  resolveTypeDistribution,
} from "../../assessmentGeneration/assessmentGenerationService.js";
import { AiServiceError, type AiErrorPayload } from "./ApiError.js";
import { mapOpenAiError, logAiError } from "./ErrorMapper.js";
import type {
  AiAssessmentConfig,
  AiGeneratedQuestion,
  AiGenerationPreview,
  AiGenerationSummary,
  AiJobStatusResponse,
  AiSourceType,
} from "./types.js";

const STAGES = [
  { stage: "reading", percent: 10, message: "Reading uploaded material…" },
  { stage: "understanding", percent: 25, message: "Understanding concepts…" },
  { stage: "outcomes", percent: 35, message: "Identifying learning outcomes…" },
  { stage: "topics", percent: 45, message: "Extracting important topics…" },
  { stage: "balancing", percent: 55, message: "Balancing difficulty…" },
  { stage: "writing", percent: 70, message: "Writing questions…" },
  { stage: "distractors", percent: 80, message: "Generating distractors…" },
  { stage: "validation", percent: 90, message: "Validating answers…" },
  { stage: "qa", percent: 95, message: "Quality assurance…" },
  { stage: "completed", percent: 100, message: "Generation complete" },
];

function buildSummary(questions: AiGeneratedQuestion[], config: AiAssessmentConfig): AiGenerationSummary {
  const byType: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};
  const byBloom: Record<string, number> = {};
  const topics = new Set<string>();
  let withAnswers = 0;
  let confidenceSum = 0;

  for (const q of questions) {
    byType[q.type] = (byType[q.type] || 0) + 1;
    const d = q.difficulty || "medium";
    byDifficulty[d] = (byDifficulty[d] || 0) + 1;
    const b = q.bloomLevel || "L2";
    byBloom[b] = (byBloom[b] || 0) + 1;
    if (q.topic) topics.add(q.topic);
    if (q.options?.some((o) => o.isCorrect) || ["essay", "fill_blank", "coding"].includes(q.type)) withAnswers++;
    confidenceSum += q.confidence ?? 0.8;
  }

  const avgConf = questions.length ? confidenceSum / questions.length : 0;
  const estSec = questions.reduce((s, q) => s + (q.estimatedSeconds || 60), 0);
  const coverage = buildGenerationCoverage(config, questions);

  const warnings: string[] = [];
  if (!coverage.isComplete) {
    warnings.push(`AI generated ${coverage.generated} of ${coverage.requested} requested questions`);
  }
  if (questions.some((q) => q.warnings?.length)) {
    warnings.push("Some questions need review before publishing");
  }

  return {
    totalQuestions: questions.length,
    requestedQuestions: config.questionCount,
    generatedQuestions: questions.length,
    coveragePercent: coverage.coveragePercent,
    isComplete: coverage.isComplete,
    byType,
    byTypeRequested: coverage.byTypeRequested,
    byDifficulty,
    byDifficultyRequested: coverage.byDifficultyRequested,
    byBloom,
    byBloomRequested: coverage.byBloomRequested,
    withAnswers,
    averageConfidence: Math.round(avgConf * 100),
    qualityScore: Math.min(99, Math.round(avgConf * 90 + (withAnswers / Math.max(questions.length, 1)) * 10)),
    estimatedMinutes: Math.max(1, Math.ceil(estSec / 60)),
    warnings,
    topicCoverage: [...topics].slice(0, 12),
  };
}

async function updateProgress(jobId: string, stageIndex: number) {
  const s = STAGES[Math.min(stageIndex, STAGES.length - 1)]!;
  await prisma.bankQuestionImportJob.update({
    where: { id: jobId },
    data: { preview: { _aiProgress: { stage: s.stage, percent: s.percent, message: s.message } } as object },
  });
}

function mapSourceToImport(source: AiSourceType): ImportSourceType | null {
  const map: Partial<Record<AiSourceType, ImportSourceType>> = {
    pdf: "pdf",
    docx: "docx",
    pptx: "pptx",
    website: "website",
    youtube: "youtube",
    markdown: "markdown",
    google_docs: "google_docs",
    text: "txt",
    image: "image",
  };
  return map[source] ?? null;
}

export async function startAiGenerationJob(params: {
  authorId: string;
  source: AiSourceType;
  config: AiAssessmentConfig;
  buffer?: Buffer;
  mimeType?: string;
  text?: string;
  url?: string;
  fileName?: string;
}): Promise<{ jobId: string }> {
  const validation = validateQuizGenerationConfiguration(params.config);
  if (!validation.valid) {
    throw new AppError(400, validation.error || "Invalid generation configuration");
  }

  const job = await prisma.bankQuestionImportJob.create({
    data: {
      authorId: params.authorId,
      source: "ai_studio",
      status: "processing",
      fileName: params.fileName,
      sourceUrl: params.url,
      preview: { _aiProgress: STAGES[0], _aiConfig: params.config, _aiSource: params.source } as object,
    },
  });

  setImmediate(() => {
    void runPipeline(job.id, params).catch((err) => {
      console.error(`[ai-studio] job ${job.id} failed:`, err);
    });
  });

  return { jobId: job.id };
}

async function runPipeline(
  jobId: string,
  params: {
    authorId: string;
    source: AiSourceType;
    config: AiAssessmentConfig;
    buffer?: Buffer;
    mimeType?: string;
    text?: string;
    url?: string;
    fileName?: string;
  }
) {
  const requestId = randomUUID();
  const pipelineStart = Date.now();

  try {
    for (let i = 0; i < STAGES.length - 1; i++) {
      await updateProgress(jobId, i);
      await new Promise((r) => setTimeout(r, i < 2 ? 400 : 600));
    }

    let content: string = "";
    const importSource = mapSourceToImport(params.source);
    let extractedQuestions: AiGeneratedQuestion[] | null = null;

    if (params.buffer && (params.source === "docx" || params.source === "pdf" || params.source === "pptx" || params.source === "image")) {
      try {
        const { UnifiedExtractionEngine } = await import("../../extraction/UnifiedExtractionEngine.js");
        console.log(`[aiAssessmentService] Running UnifiedExtractionEngine on uploaded ${params.source} file: ${params.fileName}`);
        const unifiedRes = await UnifiedExtractionEngine.process({
          buffer: params.buffer,
          fileName: params.fileName || `file.${params.source}`,
          mimeType: params.mimeType,
          url: params.url,
        });

        if (unifiedRes.questions && unifiedRes.questions.length > 0) {
          extractedQuestions = unifiedRes.questions.map((q) => {
            const meta = {
              ...(q.metadata || {}),
              mediaUrl: q.media?.[0]?.dataUrl || q.media?.[0]?.url || (q.metadata as any)?.mediaUrl,
              images: q.media || (q.metadata as any)?.images,
              code: q.codeBlock || (q.metadata as any)?.code,
              table: q.table || (q.metadata as any)?.table,
              formulas: q.mathNode ? [q.mathNode.latex] : (q.metadata as any)?.formulas,
              hyperlinks: q.hyperlinks || (q.metadata as any)?.hyperlinks,
              lists: q.lists || (q.metadata as any)?.lists,
            };

            return {
              id: q.id || randomUUID(),
              stem: q.stem,
              type: q.type || "multiple_choice",
              difficulty: q.difficulty || "medium",
              bloomLevel: q.bloomLevel || "L2",
              explanation: q.explanation,
              hints: q.hint ? [q.hint] : undefined,
              options: q.options?.map((opt) => ({ text: opt.text, isCorrect: opt.isCorrect })),
              mediaUrl: meta.mediaUrl,
              images: meta.images,
              table: meta.table,
              codeBlock: meta.code,
              code: meta.code,
              starterCode: meta.code?.content || meta.code,
              formulas: meta.formulas,
              hyperlinks: meta.hyperlinks,
              lists: meta.lists,
              selected: true,
              confidence: q.confidence || 0.98,
              metadata: meta,
            };
          });
          console.log(`[aiAssessmentService] UnifiedExtractionEngine extracted ${extractedQuestions.length} exact document question(s).`);
        }
      } catch (uErr) {
        console.warn("[aiAssessmentService] UnifiedExtractionEngine error, falling back to AI extraction:", uErr);
      }
    }

    if (!extractedQuestions) {
      if (params.source === "topic" || params.source === "syllabus" || params.source === "notes") {
        content = buildTopicContent(params.config, params.text);
      } else if (importSource) {
        content = await extractRawContent({
          source: importSource,
          userId: params.authorId,
          buffer: params.buffer,
          mimeType: params.mimeType,
          text: params.text,
          url: params.url,
          fileName: params.fileName,
        });
      } else {
        content = buildTopicContent(params.config, params.text || params.config.topic);
      }
    }

    await updateProgress(jobId, 6);

    const normalizedConfig: AiAssessmentConfig = {
      ...params.config,
      questionTypeDistribution: resolveTypeDistribution(params.config),
    };

    let questions: AiGeneratedQuestion[];
    let demoMode = false;
    let aiNotice: AiErrorPayload | undefined;
    let modelNotice: AiGenerationPreview["modelNotice"];

    if (extractedQuestions && extractedQuestions.length > 0) {
      questions = extractedQuestions;
    } else {
      const gen = await generateAssessment(content, normalizedConfig, { jobId, requestId });
      questions = gen.questions;
      demoMode = Boolean(gen.demoMode);
      if (demoMode) {
        aiNotice = {
          type: "UNKNOWN",
          title: "Development Mode",
          message: "Running in Development Mode — sample questions generated locally.",
          retryable: false,
          offlineFallback: true,
        };
      }
      if (gen.partial) {
        aiNotice = {
          type: "PARTIAL_GENERATION",
          title: "Incomplete generation",
          message: `AI generated ${gen.coverage.generated} of ${gen.coverage.requested} requested questions.`,
          retryable: true,
          offlineFallback: demoMode,
        };
      }
    }

    if (!questions.length) throw new AppError(422, "AI could not generate questions. Try a clearer topic or source.");

    const preview: AiGenerationPreview = {
      jobId,
      config: normalizedConfig,
      source: params.source,
      questions,
      summary: buildSummary(questions, normalizedConfig),
      ...(modelNotice ? { modelNotice } : {}),
      ...(demoMode || gen.partial ? { demoMode: demoMode || undefined, aiNotice } : {}),
    };

    await prisma.bankQuestionImportJob.update({
      where: { id: jobId },
      data: {
        status: "ready",
        preview: { ...preview, _sourceContent: content } as object,
        error: null,
      },
    });
  } catch (err) {
    const aiErr = err instanceof AiServiceError ? err : mapOpenAiError(err, { jobId, requestId });
    logAiError({
      requestId,
      jobId,
      statusCode: aiErr.statusCode,
      errorType: aiErr.payload.type,
      durationMs: Date.now() - pipelineStart,
      retryCount: aiErr.retryCount ?? 0,
      rawMessage: err instanceof Error ? err.message : String(err),
    });

    await prisma.bankQuestionImportJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: JSON.stringify(aiErr.payload),
      },
    });
  }
}

export async function getAiJobStatus(jobId: string, userId: string, role: string): Promise<AiJobStatusResponse> {
  const job = await prisma.bankQuestionImportJob.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError(404, "Generation job not found");
  if (job.authorId !== userId && role !== "admin" && role !== "super_admin") {
    throw new AppError(403, "Forbidden");
  }
  if (job.source !== "ai_studio") throw new AppError(400, "Not an AI generation job");

  const raw = job.preview as Record<string, unknown> | null;

  if (job.status === "processing") {
    return {
      jobId,
      status: "processing",
      progress: raw?._aiProgress as AiJobStatusResponse["progress"],
    };
  }

  if (job.status === "failed") {
    let errorDetails: AiErrorPayload | undefined;
    try {
      if (job.error?.startsWith("{")) errorDetails = JSON.parse(job.error) as AiErrorPayload;
    } catch {
      /* legacy string error */
    }
    return {
      jobId,
      status: "failed",
      error: errorDetails?.message || job.error || "Generation failed",
      errorDetails,
    };
  }

  if (!raw || !("questions" in raw)) throw new AppError(404, "Preview not available");
  return { jobId, status: "ready", preview: raw as unknown as AiGenerationPreview };
}

export async function updateAiJobPreview(
  jobId: string,
  userId: string,
  preview: AiGenerationPreview
): Promise<void> {
  const job = await prisma.bankQuestionImportJob.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError(404, "Generation job not found");
  if (job.authorId !== userId) throw new AppError(403, "Forbidden");
  if (job.source !== "ai_studio") throw new AppError(400, "Not an AI generation job");

  const next: AiGenerationPreview = {
    ...preview,
    summary: buildSummary(preview.questions, preview.config),
  };

  await prisma.bankQuestionImportJob.update({
    where: { id: jobId },
    data: { preview: next as object },
  });
}

export async function commitAiToQuiz(
  jobId: string,
  userId: string,
  role: string,
  options?: { questionIds?: string[]; title?: string; questions?: AiGeneratedQuestion[] }
) {
  const job = await prisma.bankQuestionImportJob.findUnique({
    where: { id: jobId },
    select: { id: true, authorId: true, source: true, status: true, preview: true },
  });
  if (!job) throw new AppError(404, "Generation job not found");
  if (job.authorId !== userId && role !== "admin" && role !== "super_admin") {
    throw new AppError(403, "Forbidden");
  }
  if (job.source !== "ai_studio") throw new AppError(400, "Not an AI generation job");
  if (job.status !== "ready" && job.status !== "committed") throw new AppError(400, "Job not ready");

  const storedPreview = job.preview as AiGenerationPreview | null;
  const preview = options?.questions?.length
    ? {
        ...(storedPreview || {}),
        questions: options.questions,
        config: storedPreview?.config || ({} as AiAssessmentConfig),
        summary: storedPreview?.summary || buildSummary(options.questions, storedPreview?.config || ({} as AiAssessmentConfig)),
      }
    : storedPreview;

  if (!preview?.questions?.length) throw new AppError(400, "Preview not available");

  let questions = preview.questions.filter((q) => q.selected);
  if (options?.questionIds?.length) {
    const set = new Set(options.questionIds);
    questions = questions.filter((q) => set.has(q.id));
  }
  if (!questions.length) throw new AppError(400, "No questions selected");
  if (preview.config?.questionCount && questions.length !== preview.config.questionCount) {
    throw new AppError(
      400,
      `Generated quiz has ${questions.length} questions but ${preview.config.questionCount} were requested. Use Generate Remaining or edit configuration.`
    );
  }

  const title = options?.title?.trim() || preview.config?.quizName || "AI Generated Quiz";
  const importPreview = {
    jobId,
    source: "ai_studio" as ImportSourceType,
    sourceLabel: "AI Studio",
    questions,
    summary: preview.summary,
  };

  const quiz = await materializeQuizFromImportDrafts(userId, title, questions, importPreview as never);

  await prisma.bankQuestionImportJob.update({
    where: { id: jobId },
    data: { status: "committed", preview: preview as object },
  });

  const editor = buildQuizEditorSnapshot(quiz);

  return { quizId: quiz.id, quizTitle: quiz.title, imported: questions.length, editor };
}

export async function fillRemainingForJob(jobId: string, userId: string, role: string) {
  const job = await prisma.bankQuestionImportJob.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError(404, "Generation job not found");
  if (job.authorId !== userId && role !== "admin" && role !== "super_admin") {
    throw new AppError(403, "Forbidden");
  }
  if (job.source !== "ai_studio") throw new AppError(400, "Not an AI generation job");
  if (job.status !== "ready") throw new AppError(400, "Job not ready");

  const raw = job.preview as (AiGenerationPreview & { _sourceContent?: string }) | null;
  if (!raw?.config) throw new AppError(400, "Preview not available");

  const content =
    raw._sourceContent ||
    buildTopicContent(raw.config, raw.config.topic);

  const questions = await generateRemainingQuestions(content, raw.config, raw.questions, {
    jobId,
    requestId: randomUUID(),
  });

  const preview: AiGenerationPreview = {
    ...raw,
    questions,
    summary: buildSummary(questions, raw.config),
    aiNotice: questions.length < raw.config.questionCount
      ? {
          type: "PARTIAL_GENERATION",
          title: "Incomplete generation",
          message: `AI generated ${questions.length} of ${raw.config.questionCount} requested questions.`,
          retryable: true,
        }
      : undefined,
  };

  await prisma.bankQuestionImportJob.update({
    where: { id: jobId },
    data: { preview: { ...preview, _sourceContent: content } as object },
  });

  return preview;
}
