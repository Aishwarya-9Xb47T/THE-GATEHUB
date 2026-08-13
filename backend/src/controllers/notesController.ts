import { Response } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";

const noteSchema = z.object({
  content: z.string()
});

export async function getNote(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  
  const { lectureId } = req.params;
  
  const note = await prisma.studentNote.findUnique({
    where: {
      userId_lectureId: {
        userId: req.user.id,
        lectureId: lectureId
      }
    }
  });
  
  res.json({ success: true, note });
}

export async function saveNote(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  
  const { lectureId } = req.params;
  const { content } = noteSchema.parse(req.body);
  
  const note = await prisma.studentNote.upsert({
    where: {
      userId_lectureId: {
        userId: req.user.id,
        lectureId: lectureId
      }
    },
    update: {
      content
    },
    create: {
      content,
      userId: req.user.id,
      lectureId: lectureId
    }
  });

  res.json({ success: true, note });
}
