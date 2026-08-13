import { Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { isAdminRole } from "../utils/roles.js";
import * as studio from "../services/assessmentStudio/assessmentStudioService.js";

const optionSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1),
  isCorrect: z.boolean(),
  order: z.number().int().optional(),
});

const questionSchema = z.object({
  stem: z.string().min(1),
  type: z.string().min(1),
  difficulty: z.string().optional(),
  bloomLevel: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  language: z.string().optional(),
  topic: z.string().optional(),
  subtopic: z.string().optional(),
  explanation: z.string().optional(),
  hints: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  courseId: z.string().optional(),
  options: z.array(optionSchema).optional(),
});

export async function dashboard(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = await studio.getDashboardStats(req.user.id);
  res.json({ success: true, data });
}

export async function listQuestions(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = await studio.listBankQuestions(req.user.id, {
    q: req.query.q as string,
    status: req.query.status as string,
    type: req.query.type as string,
    difficulty: req.query.difficulty as string,
    bloomLevel: req.query.bloomLevel as string,
    source: req.query.source as string,
    courseId: req.query.courseId as string,
    topic: req.query.topic as string,
    tag: req.query.tag as string,
    language: req.query.language as string,
    page: req.query.page ? Number(req.query.page) : 1,
    limit: req.query.limit ? Number(req.query.limit) : 24,
  });
  res.json({ success: true, data });
}

export async function getQuestion(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = await studio.getBankQuestion(req.params.id, req.user.id, req.user.role);
  res.json({ success: true, data });
}

export async function createQuestion(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = questionSchema.parse(req.body);
  const data = await studio.createBankQuestion(req.user.id, body);
  res.status(201).json({ success: true, data });
}

export async function updateQuestion(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = questionSchema.partial().parse(req.body);
  const data = await studio.updateBankQuestion(req.params.id, req.user.id, req.user.role, body);
  res.json({ success: true, data });
}

export async function removeQuestion(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = await studio.deleteBankQuestion(req.params.id, req.user.id, req.user.role);
  res.json({ success: true, data });
}

export async function bulkStatus(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { ids, status } = z.object({ ids: z.array(z.string()), status: z.string() }).parse(req.body);
  const data = await studio.bulkUpdateStatus(ids, status, req.user.id, req.user.role);
  res.json({ success: true, data });
}

export async function migrate(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (!isAdminRole(req.user.role)) {
    throw new AppError(403, "Course migration is restricted to administrators. Use external import for instructor content.");
  }
  const courseId = req.body?.courseId as string | undefined;
  const data = await studio.migrateCourseQuizzesToBank(req.user.id, courseId);
  res.json({ success: true, data });
}

export async function materializeQuiz(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { title, questionIds, courseId } = z
    .object({ title: z.string().min(1), questionIds: z.array(z.string()).min(1), courseId: z.string().optional() })
    .parse(req.body);
  const data = await studio.materializeQuizFromBank(req.user.id, title, questionIds, courseId);
  res.status(201).json({ success: true, data });
}

export async function listCollections(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = await studio.listCollections(req.user.id);
  res.json({ success: true, data });
}

export async function createCollection(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = z
    .object({
      name: z.string().min(1),
      description: z.string().optional(),
      kind: z.string().optional(),
      isTemplate: z.boolean().optional(),
      templateType: z.string().optional(),
    })
    .parse(req.body);
  const data = await studio.createCollection(req.user.id, body);
  res.status(201).json({ success: true, data });
}

export async function getCollection(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = await studio.getCollectionWithQuestions(req.params.id, req.user.id, req.user.role);
  res.json({ success: true, data });
}

export async function addToCollection(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { questionIds } = z.object({ questionIds: z.array(z.string()).min(1) }).parse(req.body);
  const data = await studio.addQuestionsToCollection(req.params.id, questionIds, req.user.id, req.user.role);
  res.json({ success: true, data });
}

export async function generateAI(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = z
    .object({
      topic: z.string().min(1),
      difficulty: z.string().optional(),
      bloomLevel: z.string().optional(),
      type: z.string().optional(),
      count: z.number().int().min(1).max(10).optional(),
      language: z.string().optional(),
    })
    .parse(req.body);
  const data = await studio.generateAIQuestions(req.user.id, body);
  res.status(201).json({ success: true, data });
}

export async function submitReview(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = await studio.submitForReview(req.params.id, req.user.id, req.user.role);
  res.json({ success: true, data });
}

export async function approve(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = await studio.approveQuestion(req.params.id, req.user.id, req.user.role);
  res.json({ success: true, data });
}
