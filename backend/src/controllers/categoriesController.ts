import { Response } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";

const createSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  image: z.string().optional(),
});

export async function list(_req: AuthRequest, res: Response) {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { courses: true } } },
  });
  res.json({ success: true, categories });
}

export async function getOne(req: AuthRequest, res: Response) {
  const idOrSlug = req.params.id;
  // Try to find by id first, then by slug
  let category = await prisma.category.findUnique({ where: { id: idOrSlug } });
  if (!category) {
    category = await prisma.category.findUnique({ where: { slug: idOrSlug } });
  }
  if (!category) throw new AppError(404, "Category not found");
  res.json({ success: true, category });
}

export async function create(req: AuthRequest, res: Response) {
  const data = createSchema.parse(req.body);
  const category = await prisma.category.create({ data });
  res.status(201).json({ success: true, category });
}

export async function update(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const data = createSchema.partial().parse(req.body);
  const category = await prisma.category.update({ where: { id }, data });
  res.json({ success: true, category });
}
