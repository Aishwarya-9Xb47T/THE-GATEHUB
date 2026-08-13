import { Router, Request, Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { authenticate } from "../middlewares/auth.js";
import { isAdminRole } from "../utils/roles.js";
import {
  createRazorpayOrder,
  verifyAndFulfillRazorpayPayment,
  buildCheckoutPreview,
  getRevenueSplit,
  processAdminRefund,
} from "../services/paymentService.js";
import {
  verifyWebhookSignature,
  handleRazorpayWebhookEvent,
} from "../services/razorpayWebhookService.js";

let stripeInstance: any = null;
const getStripe = async () => {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!stripeInstance) {
    const Stripe = (await import("stripe")).default;
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-01-27.acacia" as any });
  }
  return stripeInstance;
};

export const paymentRouter = Router();

// Legacy Stripe checkout — kept for backward compatibility with in-flight sessions
paymentRouter.post("/create-checkout-session", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const stripe = await getStripe();
  if (!stripe) throw new AppError(503, "Stripe is deprecated. Use Razorpay checkout.");
  const { courseId } = req.body;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new AppError(404, "Course not found");
  if (course.price <= 0) throw new AppError(400, "Course is free");

  const existingPayment = await prisma.payment.findFirst({
    where: { userId: req.user.id, courseId, status: "completed" },
  });
  if (existingPayment) return res.json({ success: true, message: "Already paid" });

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "inr",
          product_data: { name: course.title, description: course.subtitle || undefined },
          unit_amount: Math.round(course.price * 100),
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${process.env.CLIENT_URL}/course/${courseId}?success=true`,
    cancel_url: `${process.env.CLIENT_URL}/course/${courseId}`,
    metadata: { userId: req.user.id, courseId: course.id, productType: "course" },
  });

  res.json({ success: true, url: session.url });
});

// Legacy Stripe webhook — kept for historical records
paymentRouter.post("/webhook", async (req: Request, res: Response) => {
  const stripe = await getStripe();
  if (!stripe) return res.status(503).send("Stripe disabled");
  const signatureHeader = req.headers["stripe-signature"];
  const sig = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!sig) return res.status(400).send("Missing stripe-signature header");

  try {
    const payload = (req as Request & { rawBody?: Buffer }).rawBody || req.body;
    const event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET!);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const courseId = session.metadata?.courseId;
      if (userId && courseId) {
        const { fulfillPayment } = await import("../services/paymentService.js");
        await fulfillPayment({
          userId,
          productType: "course",
          courseId,
          learningUniverseId: null,
          amount: session.amount_total ? session.amount_total / 100 : 0,
          transactionId: session.id,
          gateway: "stripe",
        });
      }
    }
    res.json({ received: true });
  } catch (err: any) {
    console.error(`Stripe Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

paymentRouter.get("/razorpay/key", authenticate, (_req, res) => {
  res.json({ success: true, keyId: process.env.RAZORPAY_KEY_ID });
});

paymentRouter.post("/checkout/preview", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { courseId, learningUniverseId, couponCode } = req.body;
  if (!courseId && !learningUniverseId) {
    throw new AppError(400, "courseId or learningUniverseId is required");
  }
  const productType = courseId ? "course" : "learning_universe";
  const preview = await buildCheckoutPreview(
    req.user.id,
    { productType, courseId, learningUniverseId },
    couponCode
  );
  res.json({ success: true, data: preview });
});

paymentRouter.post("/coupons/validate", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { code, courseId, learningUniverseId } = req.body;
  const productType = courseId ? "course" : "learning_universe";
  const preview = await buildCheckoutPreview(
    req.user.id,
    { productType, courseId, learningUniverseId },
    code
  );
  res.json({ success: true, data: preview });
});

paymentRouter.post("/razorpay/create-order", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { courseId, learningUniverseId, couponCode } = req.body;

  if (!courseId && !learningUniverseId) {
    throw new AppError(400, "courseId or learningUniverseId is required");
  }

  const productType = courseId ? "course" : "learning_universe";
  const result = await createRazorpayOrder(
    req.user.id,
    { productType, courseId, learningUniverseId },
    couponCode
  );

  if (result.alreadyPaid) {
    return res.json({ success: true, message: "Already paid", alreadyPaid: true });
  }

  res.json({
    success: true,
    orderId: result.orderId,
    orderNumber: result.orderNumber,
    amount: result.amount,
    currency: result.currency,
    title: result.title,
    totalAmount: result.totalAmount,
  });
});

paymentRouter.post("/razorpay/verify", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, courseId, learningUniverseId } =
    req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new AppError(400, "Missing required verification parameters");
  }

  const order = await prisma.order.findUnique({ where: { razorpayOrderId: razorpay_order_id } });
  if (!order && !courseId && !learningUniverseId) {
    throw new AppError(400, "courseId or learningUniverseId is required");
  }

  const result = await verifyAndFulfillRazorpayPayment({
    userId: req.user.id,
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
    courseId,
    learningUniverseId,
  });

  res.json({
    success: true,
    message: "Payment verified successfully",
    created: result.created,
    paymentId: result.payment.id,
  });
});

paymentRouter.post("/razorpay/webhook", async (req: Request, res: Response) => {
  const signature = req.headers["x-razorpay-signature"] as string;
  const rawBody =
    (req as Request & { rawBody?: Buffer }).rawBody?.toString("utf8") ||
    (typeof req.body === "string" ? req.body : JSON.stringify(req.body));

  if (!verifyWebhookSignature(rawBody, signature)) {
    return res.status(400).json({ success: false, error: "Invalid webhook signature" });
  }

  const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const event = payload.event as string;

  try {
    await handleRazorpayWebhookEvent(event, payload.payload);
    res.json({ success: true, received: true });
  } catch (err: any) {
    console.error("[RAZORPAY WEBHOOK]", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

paymentRouter.get("/my-payments", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const payments = await prisma.payment.findMany({
    where: { userId: req.user.id },
    include: {
      course: { select: { id: true, title: true, thumbnail: true } },
      learningUniverse: { select: { id: true, title: true, thumbnail: true } },
      order: { select: { orderNumber: true, status: true } },
      invoice: { select: { id: true, invoiceNumber: true, pdfPath: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ success: true, payments });
});

paymentRouter.get("/my-orders", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const orders = await prisma.order.findMany({
    where: { userId: req.user.id },
    include: {
      payment: true,
      invoice: { select: { id: true, invoiceNumber: true, pdfPath: true } },
      course: { select: { id: true, title: true, thumbnail: true } },
      learningUniverse: { select: { id: true, title: true, thumbnail: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ success: true, orders });
});

paymentRouter.get("/invoices/:id", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: { order: true, payment: true },
  });
  if (!invoice) throw new AppError(404, "Invoice not found");
  if (invoice.userId !== req.user.id && !isAdminRole(req.user.role)) {
    throw new AppError(403, "Forbidden");
  }
  res.json({ success: true, invoice });
});

paymentRouter.get("/instructor/earnings", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "instructor" && !isAdminRole(req.user.role)) {
    throw new AppError(403, "Forbidden");
  }

  const instructorId = req.user.id;
  const payments = await prisma.payment.findMany({
    where: { instructorId, status: "completed" },
    include: {
      course: { select: { id: true, title: true, thumbnail: true } },
      learningUniverse: { select: { id: true, title: true, thumbnail: true } },
      user: { select: { firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const platformFee = payments.reduce((sum, p) => sum + (p.platformFee ?? 0), 0);
  const netEarnings = payments.reduce((sum, p) => sum + (p.instructorEarning ?? 0), 0);

  const courseMap = new Map<string, { id: string; title: string; revenue: number; count: number }>();
  const luMap = new Map<string, { id: string; title: string; revenue: number; count: number }>();

  for (const p of payments) {
    if (p.course) {
      const cur = courseMap.get(p.course.id) || {
        id: p.course.id,
        title: p.course.title,
        revenue: 0,
        count: 0,
      };
      cur.revenue += p.instructorEarning ?? 0;
      cur.count += 1;
      courseMap.set(p.course.id, cur);
    }
    if (p.learningUniverse) {
      const cur = luMap.get(p.learningUniverse.id) || {
        id: p.learningUniverse.id,
        title: p.learningUniverse.title,
        revenue: 0,
        count: 0,
      };
      cur.revenue += p.instructorEarning ?? 0;
      cur.count += 1;
      luMap.set(p.learningUniverse.id, cur);
    }
  }

  const split = await getRevenueSplit(totalRevenue);

  res.json({
    success: true,
    summary: {
      totalRevenue,
      platformFee,
      netEarnings,
      purchaseCount: payments.length,
      platformFeePercent: split.platformPct,
      instructorSharePercent: split.instructorPct,
    },
    payments,
    topCourses: [...courseMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    topLearningUniverses: [...luMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
  });
});

paymentRouter.get("/admin/summary", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user || !isAdminRole(req.user.role)) throw new AppError(403, "Forbidden");

  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const productType = typeof req.query.productType === "string" ? req.query.productType : undefined;
  const search = typeof req.query.search === "string" ? req.query.search : undefined;

  const where: any = {};
  if (status) where.status = status;
  if (productType) where.productType = productType;

  const payments = await prisma.payment.findMany({
    where,
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
      course: { select: { id: true, title: true } },
      learningUniverse: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const filtered = search
    ? payments.filter(
        (p) =>
          p.user.email.toLowerCase().includes(search.toLowerCase()) ||
          p.transactionId?.toLowerCase().includes(search.toLowerCase()) ||
          p.course?.title.toLowerCase().includes(search.toLowerCase()) ||
          p.learningUniverse?.title.toLowerCase().includes(search.toLowerCase())
      )
    : payments;

  const completed = filtered.filter((p) => p.status === "completed");
  const refunded = filtered.filter((p) => p.status === "refunded");

  const globalCompleted = await prisma.payment.findMany({
    where: { status: "completed" },
    select: { amount: true, platformFee: true, instructorEarning: true },
  });
  const globalRefunded = await prisma.payment.findMany({
    where: { status: "refunded" },
    select: { amount: true },
  });

  res.json({
    success: true,
    summary: {
      totalRevenue: globalCompleted.reduce((s, p) => s + p.amount, 0),
      platformRevenue: globalCompleted.reduce((s, p) => s + (p.platformFee ?? 0), 0),
      instructorRevenue: globalCompleted.reduce((s, p) => s + (p.instructorEarning ?? 0), 0),
      transactionCount: globalCompleted.length,
      refundCount: globalRefunded.length,
      refundAmount: globalRefunded.reduce((s, p) => s + p.amount, 0),
      filteredRevenue: completed.reduce((s, p) => s + p.amount, 0),
      filteredCount: filtered.length,
    },
    payments: filtered,
  });
});

paymentRouter.post("/admin/refund/:paymentId", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user || !isAdminRole(req.user.role)) throw new AppError(403, "Forbidden");
  const amount = typeof req.body?.amount === "number" ? req.body.amount : undefined;
  const result = await processAdminRefund(req.params.paymentId, amount);
  res.json({ success: true, ...result });
});

paymentRouter.get("/admin/coupons", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user || !isAdminRole(req.user.role)) throw new AppError(403, "Forbidden");
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ success: true, coupons });
});

paymentRouter.post("/admin/coupons", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user || !isAdminRole(req.user.role)) throw new AppError(403, "Forbidden");
  const {
    code,
    description,
    discountType,
    discountValue,
    maxUses,
    minOrderAmount,
    expiresAt,
    courseId,
    learningUniverseId,
    productType,
    firstPurchaseOnly,
    maxDiscount,
    categoryId,
    globalScope,
  } = req.body;
  if (!code || !discountType || discountValue == null) {
    throw new AppError(400, "code, discountType, and discountValue are required");
  }
  const coupon = await prisma.coupon.create({
    data: {
      code: String(code).trim().toUpperCase(),
      description,
      discountType,
      discountValue: Number(discountValue),
      maxUses: maxUses != null ? Number(maxUses) : null,
      minOrderAmount: minOrderAmount != null ? Number(minOrderAmount) : 0,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      courseId: courseId || null,
      learningUniverseId: learningUniverseId || null,
      productType: productType || null,
      firstPurchaseOnly: !!firstPurchaseOnly,
      maxDiscount: maxDiscount != null ? Number(maxDiscount) : null,
      categoryId: categoryId || null,
      globalScope: !!globalScope,
    },
  });
  res.status(201).json({ success: true, coupon });
});
