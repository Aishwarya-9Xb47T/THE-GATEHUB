import crypto from "crypto";
import { prisma } from "../utils/prisma.js";
import { razorpay } from "./razorpayService.js";
import {
  grantCourseEnrollment,
  grantLearningUniverseEnrollment,
  revokeCourseEnrollment,
  revokeLearningUniverseEnrollment,
} from "./enrollmentService.js";
import { inferProductType, PRODUCT_TYPES, readStructuredRecord } from "./productRoutingService.js";
import { AppError } from "../middlewares/errorHandler.js";
import { getPlatformSettings } from "./platformSettingsService.js";
import { createCommerceOrder, buildCheckoutPreview } from "./commerceService.js";
import { incrementCouponUsage } from "./couponService.js";
import { createInvoiceForOrder } from "./invoiceService.js";
import { clearCartAfterPurchase } from "./cartService.js";
import {
  sendPurchaseSuccessEmail,
  sendInvoiceEmail,
  sendEnrollmentEmail,
  sendCouponAppliedEmail,
} from "./commerceEmailService.js";

async function resolveLearningUniverseIdForCourse(courseId: string): Promise<string | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { aiContent: true },
  });
  if (course?.aiContent) {
    try {
      const parsed = JSON.parse(course.aiContent) as {
        academicStudio?: { learningUniverseId?: string };
      };
      const luId = parsed.academicStudio?.learningUniverseId;
      if (typeof luId === "string" && luId) return luId;
    } catch {
      /* ignore */
    }
  }

  const universes = await prisma.learningUniverse.findMany({
    where: { status: "published" },
    select: { id: true, structuredData: true },
  });
  for (const u of universes) {
    const sd = readStructuredRecord(u.structuredData);
    if (sd.linkedCourseId === courseId && inferProductType(u.structuredData) === PRODUCT_TYPES.PREMIUM_COURSE) {
      return u.id;
    }
  }
  return null;
}

export type ProductType = "course" | "learning_universe";

export interface ProductRef {
  productType: ProductType;
  courseId?: string;
  learningUniverseId?: string;
}

export async function getRevenueSplit(amount: number) {
  const settings = await getPlatformSettings();
  const platformPct = settings.platformFeePercentage ?? 20;
  const instructorPct = settings.instructorSharePercentage ?? 80;
  const platformFee = Math.round(amount * (platformPct / 100) * 100) / 100;
  const instructorEarning = Math.round(amount * (instructorPct / 100) * 100) / 100;
  return { platformFee, instructorEarning, platformPct, instructorPct };
}

/** @deprecated Use getRevenueSplit — kept for API compatibility */
export const PLATFORM_FEE_PERCENT = 0.2;
export const INSTRUCTOR_SHARE_PERCENT = 0.8;

export async function resolveProduct(ref: ProductRef) {
  if (ref.productType === "course") {
    if (!ref.courseId) throw new AppError(400, "courseId is required");
    const course = await prisma.course.findUnique({ where: { id: ref.courseId } });
    if (!course) throw new AppError(404, "Course not found");
    if (course.status !== "published") throw new AppError(400, "Course is not available for purchase");
    if (course.price <= 0) throw new AppError(400, "Course is free");
    return {
      productType: "course" as const,
      title: course.title,
      price: course.price,
      instructorId: course.instructorId,
      courseId: course.id,
      learningUniverseId: null as string | null,
    };
  }

  if (!ref.learningUniverseId) throw new AppError(400, "learningUniverseId is required");
  const lu = await prisma.learningUniverse.findUnique({ where: { id: ref.learningUniverseId } });
  if (!lu) throw new AppError(404, "Learning Universe not found");
  if (lu.status !== "published") throw new AppError(400, "Learning Universe is not available for purchase");
  if (lu.price <= 0) throw new AppError(400, "Learning Universe is free");

  return {
    productType: "learning_universe" as const,
    title: lu.title,
    price: lu.price,
    instructorId: lu.instructorId,
    courseId: null as string | null,
    learningUniverseId: lu.id,
  };
}

export async function createRazorpayOrder(userId: string, ref: ProductRef, couponCode?: string) {
  return createCommerceOrder(userId, ref, couponCode);
}

export { buildCheckoutPreview };

export function verifyRazorpaySignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string
) {
  const sign = razorpayOrderId + "|" + razorpayPaymentId;
  const expectedSign = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(sign)
    .digest("hex");
  return expectedSign === razorpaySignature;
}

async function verifyOrderAmount(razorpayOrderId: string, expectedAmount: number) {
  if (!razorpay) {
    // Skip verification if Razorpay not configured (development mode)
    console.warn("[Razorpay] Not configured, skipping amount verification");
    return;
  }
  const order = await razorpay.orders.fetch(razorpayOrderId);
  const orderAmount = typeof order.amount === "number" ? order.amount / 100 : 0;
  if (Math.abs(orderAmount - expectedAmount) > 0.01) {
    throw new AppError(400, "Payment amount mismatch — order total does not match gateway");
  }
}

export async function fulfillPayment(params: {
  userId: string;
  productType: ProductType;
  courseId?: string | null;
  learningUniverseId?: string | null;
  amount: number;
  transactionId: string;
  razorpayOrderId?: string | null;
  gateway?: string;
  orderId?: string | null;
}) {
  const existingByTxn = params.transactionId
    ? await prisma.payment.findUnique({ where: { transactionId: params.transactionId } })
    : null;
  if (existingByTxn?.status === "completed") {
    return { payment: existingByTxn, created: false };
  }

  let order =
    params.orderId
      ? await prisma.order.findUnique({
          where: { id: params.orderId },
          include: { payment: true, items: true, user: { select: { email: true, firstName: true, lastName: true } } },
        })
      : null;

  if (!order && params.razorpayOrderId) {
    order = await prisma.order.findUnique({
      where: { razorpayOrderId: params.razorpayOrderId },
      include: { payment: true, items: true, user: { select: { email: true, firstName: true, lastName: true } } },
    });
  }

  if (order) {
    if (order.userId !== params.userId) throw new AppError(403, "Order does not belong to user");
    if (order.status === "paid") {
      const paid = order.payment;
      if (paid) return { payment: paid, created: false };
    }
    await verifyOrderAmount(params.razorpayOrderId!, order.totalAmount);
    params.amount = order.totalAmount;
    params.productType = order.productType as ProductType;
    params.courseId = order.courseId;
    params.learningUniverseId = order.learningUniverseId;
  }

  if (params.razorpayOrderId && !order) {
    await verifyOrderAmount(params.razorpayOrderId, params.amount);
  }

  const { platformFee, instructorEarning } = await getRevenueSplit(params.amount);

  let instructorId: string | null = null;
  if (params.productType === "course" && params.courseId) {
    const course = await prisma.course.findUnique({
      where: { id: params.courseId },
      select: { instructorId: true },
    });
    instructorId = course?.instructorId ?? null;
  } else if (params.productType === "learning_universe" && params.learningUniverseId) {
    const lu = await prisma.learningUniverse.findUnique({
      where: { id: params.learningUniverseId },
      select: { instructorId: true },
    });
    instructorId = lu?.instructorId ?? null;
  }

  let payment = order?.payment ?? null;

  if (payment) {
    payment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "completed",
        transactionId: params.transactionId,
        amount: params.amount,
        instructorId,
        platformFee,
        instructorEarning,
        gateway: params.gateway ?? "razorpay",
      },
    });
  } else if (params.razorpayOrderId) {
    const existingByOrder = await prisma.payment.findUnique({
      where: { razorpayOrderId: params.razorpayOrderId },
    });
    if (existingByOrder?.status === "completed") {
      return { payment: existingByOrder, created: false };
    }
    payment = await prisma.payment.create({
      data: {
        userId: params.userId,
        courseId: params.courseId ?? null,
        learningUniverseId: params.learningUniverseId ?? null,
        productType: params.productType,
        amount: params.amount,
        currency: "INR",
        status: "completed",
        transactionId: params.transactionId,
        razorpayOrderId: params.razorpayOrderId ?? null,
        gateway: params.gateway ?? "razorpay",
        instructorId,
        platformFee,
        instructorEarning,
      },
    });
  } else {
    throw new AppError(400, "Missing order reference for fulfillment");
  }

  if (order) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "paid" },
    });
    if (order.couponCode) {
      await incrementCouponUsage(order.couponCode);
    }
    await createInvoiceForOrder({
      orderId: order.id,
      paymentId: payment.id,
      userId: params.userId,
    }).catch((err) => console.error("[INVOICE]", err));

    const userName = `${order.user.firstName} ${order.user.lastName}`.trim();
    void sendPurchaseSuccessEmail({
      email: order.user.email,
      name: userName,
      productTitle: order.productTitle,
      amount: order.totalAmount,
      currency: order.currency,
      orderNumber: order.orderNumber,
    }).catch(() => {});

    if (order.couponCode) {
      void sendCouponAppliedEmail({
        email: order.user.email,
        name: userName,
        couponCode: order.couponCode,
        discountAmount: order.discountAmount,
      }).catch(() => {});
    }

    const invoice = await prisma.invoice.findUnique({ where: { orderId: order.id } });
    if (invoice?.pdfPath) {
      void sendInvoiceEmail({
        email: order.user.email,
        name: userName,
        invoiceNumber: invoice.invoiceNumber,
        invoiceUrl: invoice.pdfPath,
      }).catch(() => {});
    }

    await clearCartAfterPurchase(params.userId, order.id).catch(() => {});
  }

  if (order?.orderKind === "cart" && order.items.length > 0) {
    for (const item of order.items) {
      if (item.courseId) {
        await grantCourseEnrollment(params.userId, item.courseId);
        const luId = await resolveLearningUniverseIdForCourse(item.courseId);
        if (luId) await grantLearningUniverseEnrollment(params.userId, luId);
        void sendEnrollmentEmail({
          email: order.user.email,
          name: `${order.user.firstName} ${order.user.lastName}`.trim(),
          productTitle: item.productTitle,
          accessUrl: `/course/${item.courseId}`,
        }).catch(() => {});
      } else if (item.learningUniverseId) {
        await grantLearningUniverseEnrollment(params.userId, item.learningUniverseId);
        void sendEnrollmentEmail({
          email: order.user.email,
          name: `${order.user.firstName} ${order.user.lastName}`.trim(),
          productTitle: item.productTitle,
          accessUrl: `/learning-universe/${item.learningUniverseId}/learn`,
        }).catch(() => {});
      }
    }
  } else if (params.productType === "course" && params.courseId) {
    await grantCourseEnrollment(params.userId, params.courseId);
    const luId = await resolveLearningUniverseIdForCourse(params.courseId);
    if (luId) {
      await grantLearningUniverseEnrollment(params.userId, luId);
    }
    if (order) {
      void sendEnrollmentEmail({
        email: order.user.email,
        name: `${order.user.firstName} ${order.user.lastName}`.trim(),
        productTitle: order.productTitle,
        accessUrl: `/course/${params.courseId}`,
      }).catch(() => {});
    }
  } else if (params.productType === "learning_universe" && params.learningUniverseId) {
    await grantLearningUniverseEnrollment(params.userId, params.learningUniverseId);
    if (order) {
      void sendEnrollmentEmail({
        email: order.user.email,
        name: `${order.user.firstName} ${order.user.lastName}`.trim(),
        productTitle: order.productTitle,
        accessUrl: `/learning-universe/${params.learningUniverseId}/learn`,
      }).catch(() => {});
    }
  }

  return { payment, created: true };
}

export async function verifyAndFulfillRazorpayPayment(params: {
  userId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  courseId?: string;
  learningUniverseId?: string;
}) {
  if (
    !verifyRazorpaySignature(
      params.razorpayOrderId,
      params.razorpayPaymentId,
      params.razorpaySignature
    )
  ) {
    throw new AppError(400, "Invalid payment signature");
  }

  const order = await prisma.order.findUnique({
    where: { razorpayOrderId: params.razorpayOrderId },
  });

  if (order) {
    if (params.courseId && order.courseId && order.courseId !== params.courseId) {
      throw new AppError(400, "Course does not match order");
    }
    if (
      params.learningUniverseId &&
      order.learningUniverseId &&
      order.learningUniverseId !== params.learningUniverseId
    ) {
      throw new AppError(400, "Learning Universe does not match order");
    }
    return fulfillPayment({
      userId: params.userId,
      productType: order.productType as ProductType,
      courseId: order.courseId,
      learningUniverseId: order.learningUniverseId,
      amount: order.totalAmount,
      transactionId: params.razorpayPaymentId,
      razorpayOrderId: params.razorpayOrderId,
      gateway: "razorpay",
      orderId: order.id,
    });
  }

  let productType: ProductType = "course";
  let courseId: string | null = params.courseId ?? null;
  let learningUniverseId: string | null = params.learningUniverseId ?? null;
  let amount = 0;

  if (courseId) {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new AppError(404, "Course not found");
    amount = course.price;
    productType = "course";
  } else if (learningUniverseId) {
    const lu = await prisma.learningUniverse.findUnique({ where: { id: learningUniverseId } });
    if (!lu) throw new AppError(404, "Learning Universe not found");
    amount = lu.price;
    productType = "learning_universe";
  } else {
    throw new AppError(400, "courseId or learningUniverseId required");
  }

  await verifyOrderAmount(params.razorpayOrderId, amount);

  return fulfillPayment({
    userId: params.userId,
    productType,
    courseId,
    learningUniverseId,
    amount,
    transactionId: params.razorpayPaymentId,
    razorpayOrderId: params.razorpayOrderId,
    gateway: "razorpay",
  });
}

export async function markPaymentFailed(razorpayOrderId: string) {
  const payment = await prisma.payment.findFirst({
    where: { razorpayOrderId, status: "pending" },
    include: {
      user: { select: { email: true, firstName: true, lastName: true } },
      order: { select: { productTitle: true } },
    },
  });
  await prisma.payment.updateMany({
    where: { razorpayOrderId, status: "pending" },
    data: { status: "failed" },
  });
  await prisma.order.updateMany({
    where: { razorpayOrderId, status: "pending" },
    data: { status: "failed" },
  });
  if (payment?.user) {
    const { sendPaymentFailedEmail } = await import("./commerceEmailService.js");
    void sendPaymentFailedEmail({
      email: payment.user.email,
      name: `${payment.user.firstName} ${payment.user.lastName}`.trim(),
      productTitle: payment.order?.productTitle || "Your order",
    }).catch(() => {});
  }
}

export async function markPaymentRefunded(transactionId: string, refundAmount?: number) {
  const payment = await prisma.payment.findUnique({ where: { transactionId } });
  if (!payment) return;

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "refunded",
      refundAmount: refundAmount ?? payment.amount,
      refundedAt: new Date(),
    },
  });

  if (payment.orderId) {
    await prisma.order.update({
      where: { id: payment.orderId },
      data: { status: "refunded" },
    });
  }

  if (payment.productType === "course" && payment.courseId) {
    await revokeCourseEnrollment(payment.userId, payment.courseId);
    const luId = await resolveLearningUniverseIdForCourse(payment.courseId);
    if (luId) await revokeLearningUniverseEnrollment(payment.userId, luId);
  } else if (payment.productType === "learning_universe" && payment.learningUniverseId) {
    await revokeLearningUniverseEnrollment(payment.userId, payment.learningUniverseId);
  }
}

export async function processAdminRefund(paymentId: string, amount?: number) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, status: "completed" },
  });
  if (!payment?.transactionId) throw new AppError(404, "Completed payment not found");

  if (!razorpay) {
    throw new AppError(503, "Razorpay not configured, cannot process refunds");
  }
  const refundPaise = Math.round((amount ?? payment.amount) * 100);
  await razorpay.payments.refund(payment.transactionId, { amount: refundPaise });
  await markPaymentRefunded(payment.transactionId, amount ?? payment.amount);
  return { success: true };
}
