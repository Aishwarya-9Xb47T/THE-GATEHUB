import { isAdminRole } from "../utils/roles.js";
import { Response } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";

const uploadSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  type: z.enum(["image", "video", "pdf", "document", "other"]),
  size: z.number().int().positive(),
  mimeType: z.string(),
});

export async function uploadMedia(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const lectureId = req.params.lectureId;
  
  const lecture = await prisma.lecture.findUnique({
    where: { id: lectureId },
    include: { section: { include: { course: true } } },
  });
  
  if (!lecture) throw new AppError(404, "Lecture not found");
  if (lecture.section.course.instructorId !== req.user.id && !isAdminRole(req.user.role)) {
    throw new AppError(403, "Forbidden");
  }
  
  const data = uploadSchema.parse(req.body);
  
  const media = await prisma.lectureMedia.create({
    data: {
      lectureId,
      name: data.name,
      url: data.url,
      type: data.type,
      size: data.size,
      mimeType: data.mimeType,
    },
  });
  
  res.status(201).json({ success: true, media });
}

export async function listMedia(req: AuthRequest, res: Response) {
  const lectureId = req.params.lectureId;
  
  const lecture = await prisma.lecture.findUnique({
    where: { id: lectureId },
    include: { section: { include: { course: true } } },
  });
  
  if (!lecture) throw new AppError(404, "Lecture not found");
  
  // Check access permissions
  const canAccess = 
    lecture.section.course.instructorId === req.user?.id ||
    isAdminRole(req.user?.role) ||
    lecture.section.course.status === "published";
    
  if (!canAccess) throw new AppError(403, "Forbidden");
  
  const mediaAssets = await prisma.lectureMedia.findMany({
    where: { lectureId },
    orderBy: { createdAt: "desc" },
  });
  
  res.json({ success: true, mediaAssets });
}

export async function deleteMedia(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const mediaId = req.params.mediaId;
  
  const media = await prisma.lectureMedia.findUnique({
    where: { id: mediaId },
    include: { lecture: { include: { section: { include: { course: true } } } } },
  });
  
  if (!media) throw new AppError(404, "Media not found");
  if (media.lecture.section.course.instructorId !== req.user.id && !isAdminRole(req.user.role)) {
    throw new AppError(403, "Forbidden");
  }
  
  await prisma.lectureMedia.delete({ where: { id: mediaId } });
  
  res.json({ success: true });
}
