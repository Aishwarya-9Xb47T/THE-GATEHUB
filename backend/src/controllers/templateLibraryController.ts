import type { Response } from "express";
import { z } from "zod";
import type { AuthRequest } from "../middlewares/auth.js";
import {
  applyTemplate,
  deleteUserTemplate,
  duplicateTemplateToLibrary,
  getTemplateById,
  listTemplates,
  saveQuizAsTemplate,
  toggleTemplateFavorite,
  TEMPLATE_CATEGORIES,
} from "../services/templateLibrary/templateLibraryService.js";
import { generateAiTemplate, fillRemainingAiTemplate } from "../services/templateLibrary/aiTemplateService.js";

const listQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  subject: z.string().optional(),
  difficulty: z.string().optional(),
  source: z.string().optional(),
  section: z.string().optional(),
  sort: z.enum(["newest", "popular", "rating", "trending"]).optional(),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  supportsHomework: z.coerce.boolean().optional(),
  supportsLive: z.coerce.boolean().optional(),
  supportsAi: z.coerce.boolean().optional(),
  supportsMedia: z.coerce.boolean().optional(),
  language: z.string().optional(),
});

const saveSchema = z.object({
  quizId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().min(1),
  subject: z.string().optional(),
  gradeLevel: z.string().optional(),
  difficulty: z.string().optional(),
  tags: z.array(z.string()).optional(),
  visibility: z.enum(["private", "organization", "public", "draft"]).optional(),
});

export async function listLibraryTemplates(req: AuthRequest, res: Response) {
  const query = listQuerySchema.parse(req.query);
  const data = await listTemplates({ ...query, userId: req.user?.id });
  res.json({ success: true, data });
}

export async function getLibraryTemplate(req: AuthRequest, res: Response) {
  const data = await getTemplateById(req.params.id!, req.user?.id);
  res.json({ success: true, data });
}

const useTemplateSchema = z.object({
  mergeMode: z.enum(["merge", "replace"]).optional(),
  identity: z.record(z.unknown()).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  subject: z.string().optional(),
  visibility: z.string().optional(),
});

export async function useLibraryTemplate(req: AuthRequest, res: Response) {
  const body = useTemplateSchema.parse(req.body ?? {});
  const data = await applyTemplate(req.user!.id, req.params.id!, body);
  res.json({ success: true, data });
}

export async function favoriteLibraryTemplate(req: AuthRequest, res: Response) {
  const data = await toggleTemplateFavorite(req.user!.id, req.params.id!);
  res.json({ success: true, data });
}

export async function saveLibraryTemplate(req: AuthRequest, res: Response) {
  const body = saveSchema.parse(req.body);
  const data = await saveQuizAsTemplate(req.user!.id, body.quizId, body);
  res.json({ success: true, data });
}

export async function removeLibraryTemplate(req: AuthRequest, res: Response) {
  const data = await deleteUserTemplate(req.user!.id, req.params.id!);
  res.json({ success: true, data });
}

export async function duplicateLibraryTemplate(req: AuthRequest, res: Response) {
  const data = await duplicateTemplateToLibrary(req.user!.id, req.params.id!);
  res.json({ success: true, data });
}

export async function generateLibraryAiTemplate(req: AuthRequest, res: Response) {
  const data = await generateAiTemplate(req.user!.id, req.body);
  res.json({ success: true, data });
}

export async function fillRemainingLibraryAiTemplate(req: AuthRequest, res: Response) {
  const body = req.body as { input: Parameters<typeof fillRemainingAiTemplate>[0]; questions: Parameters<typeof fillRemainingAiTemplate>[1] };
  const data = await fillRemainingAiTemplate(body.input, body.questions);
  res.json({ success: true, data });
}

export async function getTemplateCategories(_req: AuthRequest, res: Response) {
  res.json({ success: true, data: TEMPLATE_CATEGORIES });
}
