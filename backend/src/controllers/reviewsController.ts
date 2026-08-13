import { Response } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";

const createSchema = z.object({ rating: z.number().int().min(1).max(5), reviewText: z.string().optional() });

export async function listByCourse(req: AuthRequest, res: Response) {
  const courseId = (req.params.courseId || req.query.courseId) as string;
  if (!courseId) throw new AppError(400, "courseId required");
  const reviews = await prisma.review.findMany({
    where: { courseId, hidden: false },
    include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true, profileImage: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ success: true, reviews });
}

export async function create(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const courseId = (req.params.courseId || req.body?.courseId) as string;
  if (!courseId) throw new AppError(400, "courseId required");
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: req.user.id, courseId } },
  });
  if (!enrollment) throw new AppError(400, "Must be enrolled to review");
  const data = createSchema.parse(req.body);
  const review = await prisma.review.upsert({
    where: { studentId_courseId: { studentId: req.user.id, courseId } },
    create: { studentId: req.user.id, courseId, ...data },
    update: data,
  });

  // Calculate new average rating and update course
  const allReviews = await prisma.review.findMany({ where: { courseId, hidden: false } });
  const reviewCount = allReviews.length;
  const averageRating = reviewCount > 0 
    ? allReviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount 
    : 0;

  await prisma.course.update({
    where: { id: courseId },
    data: { reviewCount, averageRating }
  });

  res.status(201).json({ success: true, review });
}

export async function remove(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const id = req.params.id;
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) throw new AppError(404, "Review not found");
  if (review.studentId !== req.user.id) throw new AppError(403, "Forbidden");
  await prisma.review.delete({ where: { id } });
  res.json({ success: true });
}

export async function getInstructorReviews(req: AuthRequest, res: Response) {
  if (!req.user || req.user.role !== "instructor") throw new AppError(403, "Forbidden");
  
  const reviews = await prisma.review.findMany({
    where: { 
      hidden: false,
      course: { instructorId: req.user.id } 
    },
    include: { 
      user: { select: { id: true, firstName: true, lastName: true, avatar: true, profileImage: true } },
      course: { select: { id: true, title: true, thumbnail: true, status: true, averageRating: true, reviewCount: true } }
    },
    orderBy: { createdAt: "desc" },
  });
  
  res.json({ success: true, reviews });
}

export async function getTopReviews(req: AuthRequest, res: Response) {
  // Fetch a limited number of 5-star reviews from across all courses, latest first.
  const reviews = await prisma.review.findMany({
    where: { 
      hidden: false,
      rating: 5,
      reviewText: { not: null }
    },
    take: 6,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { firstName: true, lastName: true, avatar: true, profileImage: true } },
      course: { select: { title: true } }
    }
  });

  res.json({ success: true, reviews });
}
