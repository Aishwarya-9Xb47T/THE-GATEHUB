import { Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import * as builder from "../services/quizBuilder/quizBuilderService.js";

const questionOptionSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
  isCorrect: z.boolean(),
  order: z.number().optional(),
});

const questionSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
  type: z.string().min(1),
  difficulty: z.string().optional(),
  marks: z.number().optional(),
  order: z.number().optional(),
  explanation: z.string().optional(),
  hints: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  bloomLevel: z.string().optional(),
  estimatedSeconds: z.number().optional(),
  sectionId: z.string().nullable().optional(),
  media: z.unknown().optional(),
  metadata: z.record(z.unknown()).optional(),
  options: z.array(questionOptionSchema).optional(),
});

const saveSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  subject: z.string().optional(),
  visibility: z.string().optional(),
  pinned: z.boolean().optional(),
  favorited: z.boolean().optional(),
  settings: z.record(z.unknown()).optional(),
  sections: z.array(z.unknown()).optional(),
  questions: z.array(questionSchema).optional(),
});

const createSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  subject: z.string().optional(),
  visibility: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  withPlaceholder: z.boolean().optional(),
});

const identitySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  subject: z.string().optional(),
  visibility: z.string().optional(),
}).passthrough();

const duplicateSchema = z.object({
  keepOriginalBranding: z.boolean().optional(),
  identity: z.record(z.unknown()).optional(),
  title: z.string().optional(),
});

export async function createQuiz(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = createSchema.parse(req.body ?? {});
  const data = await builder.createEmptyQuiz(req.user.id, body);
  res.status(201).json({ success: true, data });
}

export async function applyIdentity(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = identitySchema.parse(req.body ?? {});
  const { title, description, subject, visibility, ...metadata } = body;
  const data = await builder.applyQuizIdentity(req.params.quizId, req.user.id, req.user.role, metadata as Record<string, unknown>, { title, description, subject, visibility });
  res.json({ success: true, data });
}

export async function listMyQuizzes(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = await builder.listInstructorQuizzes(req.user.id, {
    q: req.query.q as string,
    sort: req.query.sort as string,
    visibility: req.query.visibility as string,
    archived: req.query.archived === "true",
  });
  res.json({ success: true, data });
}

export async function getQuiz(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = await builder.getQuizEditor(req.params.quizId, req.user.id, req.user.role);
  res.json({ success: true, data });
}

export async function saveQuiz(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = saveSchema.parse(req.body);
  const data = await builder.saveQuizEditor(req.params.quizId, req.user.id, req.user.role, body as any);
  res.json({ success: true, data });
}

export async function validateQuiz(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = await builder.validateQuiz(req.params.quizId, req.user.id, req.user.role);
  res.json({ success: true, data });
}

export async function duplicateQuiz(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = duplicateSchema.parse(req.body ?? {});
  const data = await builder.duplicateQuiz(req.params.quizId, req.user.id, req.user.role, body);
  res.status(201).json({ success: true, data });
}

export async function archiveQuiz(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { archived } = z.object({ archived: z.boolean() }).parse(req.body);
  const data = await builder.archiveQuiz(req.params.quizId, req.user.id, req.user.role, archived);
  res.json({ success: true, data });
}

export async function deleteQuiz(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = await builder.deleteQuiz(req.params.quizId, req.user.id, req.user.role);
  res.json({ success: true, data });
}

export async function listVersions(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = await builder.listQuizVersions(req.params.quizId, req.user.id, req.user.role);
  res.json({ success: true, data });
}

export async function restoreVersion(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = await builder.restoreQuizVersion(req.params.quizId, Number(req.params.version), req.user.id, req.user.role);
  res.json({ success: true, data });
}
