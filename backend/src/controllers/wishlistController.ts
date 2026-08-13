import { Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";

export async function list(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const items = await prisma.wishlistItem.findMany({
    where: { userId: req.user.id },
    include: {
      course: {
        include: {
          categoryRel: { select: { name: true, slug: true } },
          instructor: { select: { firstName: true, lastName: true } },
          _count: { select: { enrollments: true } },
        },
      },
      learningUniverse: {
        include: {
          categoryRel: { select: { name: true, slug: true } },
          instructor: { select: { firstName: true, lastName: true } },
        },
      },
      product: true,
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ success: true, items });
}

export async function add(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const courseId = req.params.courseId;
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new AppError(404, "Course not found");

  const product = await prisma.product.findUnique({ where: { courseId } });
  const item = await prisma.wishlistItem.upsert({
    where: { userId_courseId: { userId: req.user.id, courseId } },
    create: { userId: req.user.id, courseId, productId: product?.id },
    update: { productId: product?.id },
  });
  res.status(201).json({ success: true, item });
}

export async function addLearningUniverse(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const learningUniverseId = req.params.learningUniverseId;
  const lu = await prisma.learningUniverse.findUnique({ where: { id: learningUniverseId } });
  if (!lu) throw new AppError(404, "Learning Universe not found");

  const product = await prisma.product.findUnique({ where: { learningUniverseId } });
  const item = await prisma.wishlistItem.upsert({
    where: { userId_learningUniverseId: { userId: req.user.id, learningUniverseId } },
    create: { userId: req.user.id, learningUniverseId, productId: product?.id },
    update: { productId: product?.id },
  });
  res.status(201).json({ success: true, item });
}

export async function remove(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const courseId = req.params.courseId;
  await prisma.wishlistItem.deleteMany({
    where: { userId: req.user.id, courseId },
  });
  res.json({ success: true });
}

export async function removeLearningUniverse(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const learningUniverseId = req.params.learningUniverseId;
  await prisma.wishlistItem.deleteMany({
    where: { userId: req.user.id, learningUniverseId },
  });
  res.json({ success: true });
}

export async function moveToCart(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { addToCart } = await import("../services/cartService.js");
  const itemId = req.params.itemId;
  const item = await prisma.wishlistItem.findFirst({
    where: { id: itemId, userId: req.user.id },
  });
  if (!item) throw new AppError(404, "Wishlist item not found");

  let productId = item.productId;
  if (!productId && item.courseId) {
    const p = await prisma.product.findUnique({ where: { courseId: item.courseId } });
    productId = p?.id ?? null;
  }
  if (!productId && item.learningUniverseId) {
    const p = await prisma.product.findUnique({ where: { learningUniverseId: item.learningUniverseId } });
    productId = p?.id ?? null;
  }
  if (!productId) throw new AppError(400, "Product not available for cart");

  await prisma.wishlistItem.delete({ where: { id: item.id } });
  const cart = await addToCart(req.user.id, productId);
  res.json({ success: true, cart });
}
