import { prisma } from "../utils/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";
import { getPlatformSettings } from "./platformSettingsService.js";
import { validateCoupon } from "./couponService.js";
import { resolveProduct, type ProductRef } from "./paymentService.js";
import { razorpay } from "./razorpayService.js";

export interface CheckoutPreview {
  productType: string;
  productId: string;
  title: string;
  thumbnail?: string | null;
  instructorName?: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  couponCode?: string | null;
  gstPercent: number;
  alreadyPaid: boolean;
}

function orderNumber(): string {
  return `GH-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function buildCheckoutPreview(
  userId: string,
  ref: ProductRef,
  couponCode?: string
): Promise<CheckoutPreview> {
  const product = await resolveProduct(ref);
  const settings = await getPlatformSettings();

  const existingWhere =
    product.productType === "course"
      ? { userId, courseId: product.courseId!, status: "completed" }
      : { userId, learningUniverseId: product.learningUniverseId!, status: "completed" };

  const existingPayment = await prisma.payment.findFirst({ where: existingWhere });
  if (existingPayment) {
    return {
      productType: product.productType,
      productId: product.courseId || product.learningUniverseId!,
      title: product.title,
      subtotal: product.price,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: product.price,
      currency: settings.defaultCurrency || "INR",
      gstPercent: settings.commerceGstPercentage ?? 0,
      alreadyPaid: true,
    };
  }

  const subtotal = product.price;
  let discountAmount = 0;
  let appliedCoupon: string | null = null;

  if (couponCode?.trim()) {
    const coupon = await validateCoupon(couponCode, userId, ref, subtotal);
    discountAmount = coupon.discountAmount;
    appliedCoupon = coupon.code;
  }

  const taxable = Math.max(0, subtotal - discountAmount);
  const gstPercent = settings.commerceGstPercentage ?? 0;
  const taxAmount = Math.round(taxable * (gstPercent / 100) * 100) / 100;
  const totalAmount = Math.round((taxable + taxAmount) * 100) / 100;

  let thumbnail: string | null = null;
  let instructorName: string | undefined;
  if (product.courseId) {
    const course = await prisma.course.findUnique({
      where: { id: product.courseId },
      include: { instructor: { select: { firstName: true, lastName: true } } },
    });
    thumbnail = course?.thumbnail ?? course?.bannerUrl ?? null;
    instructorName = course?.instructor
      ? `${course.instructor.firstName} ${course.instructor.lastName}`.trim()
      : undefined;
  } else if (product.learningUniverseId) {
    const lu = await prisma.learningUniverse.findUnique({
      where: { id: product.learningUniverseId },
      include: { instructor: { select: { firstName: true, lastName: true } } },
    });
    thumbnail = lu?.thumbnail ?? lu?.bannerUrl ?? null;
    instructorName = lu?.instructor
      ? `${lu.instructor.firstName} ${lu.instructor.lastName}`.trim()
      : undefined;
  }

  return {
    productType: product.productType,
    productId: product.courseId || product.learningUniverseId!,
    title: product.title,
    thumbnail,
    instructorName,
    subtotal,
    discountAmount,
    taxAmount,
    totalAmount,
    currency: settings.defaultCurrency || "INR",
    couponCode: appliedCoupon,
    gstPercent,
    alreadyPaid: false,
  };
}

export async function createCommerceOrder(userId: string, ref: ProductRef, couponCode?: string) {
  const preview = await buildCheckoutPreview(userId, ref, couponCode);
  if (preview.alreadyPaid) {
    return { alreadyPaid: true as const, orderId: null, amount: null, currency: null, orderNumber: null };
  }

  const product = await resolveProduct(ref);
  const amountPaise = Math.round(preview.totalAmount * 100);
  if (amountPaise < 100) {
    throw new AppError(400, "Order total must be at least ₹1");
  }

  const notes: Record<string, string> = {
    userId,
    productType: product.productType,
  };
  if (product.courseId) notes.courseId = product.courseId;
  if (product.learningUniverseId) notes.learningUniverseId = product.learningUniverseId;
  if (preview.couponCode) notes.couponCode = preview.couponCode;

  const razorpayOrder = await razorpay.orders.create({
    amount: amountPaise,
    currency: preview.currency,
    receipt: `rcpt_${Date.now()}`,
    notes,
  });

  const order = await prisma.order.create({
    data: {
      orderNumber: orderNumber(),
      userId,
      courseId: product.courseId,
      learningUniverseId: product.learningUniverseId,
      productType: product.productType,
      productTitle: product.title,
      instructorId: product.instructorId,
      subtotal: preview.subtotal,
      discountAmount: preview.discountAmount,
      taxAmount: preview.taxAmount,
      totalAmount: preview.totalAmount,
      currency: preview.currency,
      couponCode: preview.couponCode,
      status: "pending",
      razorpayOrderId: razorpayOrder.id,
    },
  });

  await prisma.payment.create({
    data: {
      orderId: order.id,
      userId,
      courseId: product.courseId,
      learningUniverseId: product.learningUniverseId,
      productType: product.productType,
      amount: preview.totalAmount,
      subtotal: preview.subtotal,
      discountAmount: preview.discountAmount,
      taxAmount: preview.taxAmount,
      couponCode: preview.couponCode,
      currency: preview.currency,
      status: "pending",
      razorpayOrderId: razorpayOrder.id,
      instructorId: product.instructorId,
      gateway: "razorpay",
    },
  });

  return {
    alreadyPaid: false as const,
    orderId: razorpayOrder.id,
    internalOrderId: order.id,
    orderNumber: order.orderNumber,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    title: product.title,
    totalAmount: preview.totalAmount,
  };
}
