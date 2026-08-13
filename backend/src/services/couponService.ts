import { prisma } from "../utils/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";
import type { ProductRef } from "./paymentService.js";

export interface CouponValidationResult {
  code: string;
  discountType: "percentage" | "flat";
  discountValue: number;
  discountAmount: number;
}

export async function validateCoupon(
  code: string,
  userId: string,
  ref: ProductRef,
  subtotal: number
): Promise<CouponValidationResult> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) throw new AppError(400, "Coupon code is required");

  const coupon = await prisma.coupon.findUnique({ where: { code: normalized } });
  if (!coupon || !coupon.active) throw new AppError(400, "Invalid or inactive coupon");
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    throw new AppError(400, "Coupon has expired");
  }
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    throw new AppError(400, "Coupon usage limit reached");
  }
  if (subtotal < coupon.minOrderAmount) {
    throw new AppError(400, `Minimum order amount is ₹${coupon.minOrderAmount}`);
  }

  if (coupon.firstPurchaseOnly) {
    const prior = await prisma.payment.count({ where: { userId, status: "completed" } });
    if (prior > 0) throw new AppError(400, "Coupon valid for first purchase only");
  }

  const categoryId = await resolveCategoryId(ref);
  applyCouponProductRules(coupon, ref, categoryId);

  let discountAmount = 0;
  if (coupon.discountType === "percentage") {
    discountAmount = Math.round(subtotal * (coupon.discountValue / 100) * 100) / 100;
    if (coupon.maxDiscount != null) {
      discountAmount = Math.min(discountAmount, coupon.maxDiscount);
    }
  } else {
    discountAmount = Math.min(subtotal, coupon.discountValue);
  }

  return {
    code: coupon.code,
    discountType: coupon.discountType as "percentage" | "flat",
    discountValue: coupon.discountValue,
    discountAmount,
  };
}

async function resolveCategoryId(ref: ProductRef): Promise<string | null> {
  if (ref.courseId) {
    const c = await prisma.course.findUnique({ where: { id: ref.courseId }, select: { categoryId: true } });
    return c?.categoryId ?? null;
  }
  if (ref.learningUniverseId) {
    const lu = await prisma.learningUniverse.findUnique({
      where: { id: ref.learningUniverseId },
      select: { categoryId: true },
    });
    return lu?.categoryId ?? null;
  }
  return null;
}

function applyCouponProductRules(
  coupon: {
    courseId: string | null;
    learningUniverseId: string | null;
    productType: string | null;
    categoryId: string | null;
    globalScope: boolean;
  },
  ref: ProductRef,
  categoryId: string | null
) {
  if (coupon.globalScope) return;

  if (coupon.courseId && ref.courseId && coupon.courseId !== ref.courseId) {
    throw new AppError(400, "Coupon not valid for this course");
  }
  if (
    coupon.learningUniverseId &&
    ref.learningUniverseId &&
    coupon.learningUniverseId !== ref.learningUniverseId
  ) {
    throw new AppError(400, "Coupon not valid for this learning universe");
  }
  if (coupon.categoryId && categoryId && coupon.categoryId !== categoryId) {
    throw new AppError(400, "Coupon not valid for this category");
  }
  if (coupon.productType) {
    const expected =
      ref.productType === "course" ? "premium-course" : "learning-universe";
    if (coupon.productType !== expected && coupon.productType !== ref.productType) {
      throw new AppError(400, "Coupon not valid for this product type");
    }
  }
}

export async function validateCouponForCart(
  code: string,
  userId: string,
  items: Array<{ product: { courseId?: string | null; learningUniverseId?: string | null; productType: string } }>,
  subtotal: number
): Promise<CouponValidationResult> {
  const normalized = code.trim().toUpperCase();
  const coupon = await prisma.coupon.findUnique({ where: { code: normalized } });
  if (!coupon || !coupon.active) throw new AppError(400, "Invalid or inactive coupon");
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    throw new AppError(400, "Coupon has expired");
  }
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    throw new AppError(400, "Coupon usage limit reached");
  }
  if (subtotal < coupon.minOrderAmount) {
    throw new AppError(400, `Minimum order amount is ₹${coupon.minOrderAmount}`);
  }

  if (coupon.firstPurchaseOnly) {
    const prior = await prisma.payment.count({ where: { userId, status: "completed" } });
    if (prior > 0) throw new AppError(400, "Coupon valid for first purchase only");
  }

  if (!coupon.globalScope) {
    for (const item of items) {
      const ref: ProductRef = {
        productType: item.product.productType === "learning_universe" ? "learning_universe" : "course",
        courseId: item.product.courseId ?? undefined,
        learningUniverseId: item.product.learningUniverseId ?? undefined,
      };
      const categoryId = await resolveCategoryId(ref);
      applyCouponProductRules(coupon, ref, categoryId);
    }
  }

  let discountAmount = 0;
  if (coupon.discountType === "percentage") {
    discountAmount = Math.round(subtotal * (coupon.discountValue / 100) * 100) / 100;
    if (coupon.maxDiscount != null) discountAmount = Math.min(discountAmount, coupon.maxDiscount);
  } else {
    discountAmount = Math.min(subtotal, coupon.discountValue);
  }

  return {
    code: coupon.code,
    discountType: coupon.discountType as "percentage" | "flat",
    discountValue: coupon.discountValue,
    discountAmount,
  };
}

export async function incrementCouponUsage(code: string) {
  await prisma.coupon.updateMany({
    where: { code: code.toUpperCase() },
    data: { usedCount: { increment: 1 } },
  });
}
