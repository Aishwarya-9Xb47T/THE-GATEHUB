import { isAdminRole } from "../utils/roles.js";
import { Response } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";

const createSchema = z.object({ title: z.string().min(1), order: z.number().int().min(0).optional() });
const updateSchema = z.object({ title: z.string().min(1).optional(), order: z.number().int().min(0).optional() });
const reorderSchema = z.object({ sectionIds: z.array(z.string()) });

export async function listByCourse(req: AuthRequest, res: Response) {
  const courseId = req.params.courseId;
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new AppError(404, "Course not found");
  if (course.instructorId !== req.user?.id && !isAdminRole(req.user?.role)) {
    throw new AppError(403, "Forbidden");
  }
  const sections = await prisma.section.findMany({
    where: { courseId },
    orderBy: { order: "asc" },
    include: { lectures: { orderBy: { order: "asc" }, include: { attachments: true } } },
  });
  res.json({ success: true, sections });
}

export async function create(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const courseId = req.params.courseId;
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new AppError(404, "Course not found");
  if (course.instructorId !== req.user.id) throw new AppError(403, "Forbidden");
  const data = createSchema.parse(req.body);
  const maxOrder = await prisma.section.findFirst({ where: { courseId }, orderBy: { order: "desc" }, select: { order: true } });
  const section = await prisma.section.create({
    data: { courseId, title: data.title, order: data.order ?? (maxOrder?.order ?? 0) + 1 },
  });
  res.status(201).json({ success: true, section });
}

export async function update(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const id = req.params.id;
  const section = await prisma.section.findUnique({ where: { id }, include: { course: true } });
  if (!section) throw new AppError(404, "Section not found");
  if (section.course.instructorId !== req.user.id) throw new AppError(403, "Forbidden");
  const data = updateSchema.parse(req.body);
  const updated = await prisma.section.update({ where: { id }, data });
  res.json({ success: true, section: updated });
}

export async function remove(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const id = req.params.id;
  const section = await prisma.section.findUnique({ where: { id }, include: { course: true } });
  if (!section) throw new AppError(404, "Section not found");
  if (section.course.instructorId !== req.user.id) throw new AppError(403, "Forbidden");
  await prisma.section.delete({ where: { id } });
  res.json({ success: true });
}

export async function reorder(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const courseId = req.params.courseId;
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || course.instructorId !== req.user.id) throw new AppError(403, "Forbidden");
  const { sectionIds } = reorderSchema.parse(req.body);
  await prisma.$transaction(
    sectionIds.map((id, index) => prisma.section.update({ where: { id }, data: { order: index } }))
  );
  const sections = await prisma.section.findMany({ where: { courseId }, orderBy: { order: "asc" } });
  res.json({ success: true, sections });
}
