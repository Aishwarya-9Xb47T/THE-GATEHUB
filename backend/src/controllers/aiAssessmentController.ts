import { Response } from "express";
import { z } from "zod";
import multer from "multer";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import * as aiService from "../services/assessmentStudio/aiAssessment/aiAssessmentService.js";
import { validateQuizGenerationConfiguration } from "../services/assessmentGeneration/assessmentGenerationService.js";
import type { AiAssessmentConfig, AiSourceType } from "../services/assessmentStudio/aiAssessment/types.js";

const MAX_FILE_SIZE = 100 * 1024 * 1024;

export const aiUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

const configSchema = z.object({
  quizName: z.string().min(1),
  subject: z.string().optional(),
  course: z.string().optional(),
  department: z.string().optional(),
  semester: z.string().optional(),
  module: z.string().optional(),
  chapter: z.string().optional(),
  learningOutcome: z.string().optional(),
  language: z.string().optional(),
  targetAudience: z.string().optional(),
  examType: z.string().optional(),
  difficulty: z.string().optional(),
  questionCount: z.number().int().min(1).max(100),
  questionTypes: z.array(z.string()).default(["mixed"]),
  questionTypeDistribution: z.record(z.string(), z.number().int().min(0)).optional(),
  bloomDistribution: z.record(z.string(), z.number().min(0).max(100)).optional(),
  bloomLevel: z.string().optional(),
  tone: z.string().optional(),
  topic: z.string().optional(),
  generateExplanations: z.boolean().optional(),
  generateHints: z.boolean().optional(),
  generateTags: z.boolean().optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  negativeMarking: z.boolean().optional(),
  estimatedMinutes: z.number().optional(),
  difficultyMix: z
    .object({ easy: z.number(), medium: z.number(), hard: z.number(), expert: z.number() })
    .optional(),
});

const SOURCES = [
  "topic",
  "text",
  "pdf",
  "docx",
  "pptx",
  "website",
  "youtube",
  "markdown",
  "google_docs",
  "syllabus",
  "notes",
  "image",
] as const;

export async function generateAssessment(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const source = z.enum(SOURCES).parse(req.body?.source) as AiSourceType;
  const rawConfig = req.body?.config;
  const config = configSchema.parse(
    typeof rawConfig === "string" ? JSON.parse(rawConfig) : rawConfig
  ) as AiAssessmentConfig;

  const validation = validateQuizGenerationConfiguration(config);
  if (!validation.valid) {
    throw new AppError(400, validation.error || "Invalid generation configuration");
  }

  const url = (req.body?.url as string | undefined)?.trim();
  const text = (req.body?.text as string | undefined)?.trim();
  const file = req.file;

  if (source === "topic" && !config.topic?.trim() && !text) {
    throw new AppError(400, "Topic or description required");
  }

  const { jobId } = await aiService.startAiGenerationJob({
    authorId: req.user.id,
    source,
    config,
    buffer: file?.buffer,
    mimeType: file?.mimetype,
    text,
    url,
    fileName: file?.originalname,
  });

  res.status(202).json({ success: true, data: { jobId } });
}

export async function getAiJobStatus(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = await aiService.getAiJobStatus(req.params.jobId, req.user.id, req.user.role);

  if (data.status === "processing") {
    res.status(202).json({ success: true, data });
    return;
  }
  if (data.status === "failed") {
    res.status(422).json({
      success: false,
      data,
      error: data.errorDetails || { type: "UNKNOWN", title: "Generation failed", message: data.error || "Generation failed", retryable: true },
    });
    return;
  }
  res.json({ success: true, data });
}

export async function commitAiToQuiz(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = z
    .object({
      title: z.string().optional(),
      questionIds: z.array(z.string()).optional(),
      questions: z.array(z.record(z.unknown())).optional(),
    })
    .parse(req.body ?? {});

  const data = await aiService.commitAiToQuiz(req.params.jobId, req.user.id, req.user.role, {
    ...body,
    questions: body.questions as never,
  });
  res.json({ success: true, data });
}

export async function fillRemaining(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const preview = await aiService.fillRemainingForJob(req.params.jobId, req.user.id, req.user.role);
  res.json({ success: true, data: { preview } });
}
