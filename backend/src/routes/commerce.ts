import { Router, Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AuthRequest, authenticate } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { isAdminRole } from "../utils/roles.js";
import {
  listProducts,
  getProductById,
  syncProductFromCourse,
  syncProductFromLearningUniverse,
} from "../services/productCatalogService.js";
import {
  getCart,
  addToCart,
  removeFromCart,
  updateCartQuantity,
  moveCartItemToWishlist,
  buildCartCheckoutPreview,
  createCartOrder,
} from "../services/cartService.js";
import { getCommerceAnalytics, analyticsToCsv } from "../services/commerceAnalyticsService.js";
import {
  getInstructorPayoutSummary,
  upsertPayoutProfile,
  requestWithdrawal,
  processWithdrawal,
  listPendingWithdrawals,
} from "../services/payoutService.js";
import {
  createRefundRequest,
  listRefundRequests,
  processRefundRequest,
} from "../services/refundRequestService.js";
import { verifyAndFulfillRazorpayPayment } from "../services/paymentService.js";

export const commerceRouter = Router();

// ——— Products ———
commerceRouter.get("/products", async (req, res) => {
  const products = await listProducts({
    productType: typeof req.query.productType === "string" ? req.query.productType : undefined,
    categoryId: typeof req.query.categoryId === "string" ? req.query.categoryId : undefined,
    featured: req.query.featured === "true",
    search: typeof req.query.search === "string" ? req.query.search : undefined,
    limit: req.query.limit ? Number(req.query.limit) : 100,
  });
  res.json({ success: true, products });
});

commerceRouter.get("/products/:id", async (req, res) => {
  const product = await getProductById(req.params.id);
  if (!product) throw new AppError(404, "Product not found");
  res.json({ success: true, product });
});

commerceRouter.post("/admin/products/sync", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user || !isAdminRole(req.user.role)) throw new AppError(403, "Forbidden");
  const courses = await prisma.course.findMany({ where: { status: "published", price: { gt: 0 } }, select: { id: true } });
  const lus = await prisma.learningUniverse.findMany({ where: { status: "published", price: { gt: 0 } }, select: { id: true } });
  for (const c of courses) await syncProductFromCourse(c.id);
  for (const lu of lus) await syncProductFromLearningUniverse(lu.id);
  res.json({ success: true, synced: courses.length + lus.length });
});

// ——— Cart ———
commerceRouter.get("/cart", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const cart = await getCart(req.user.id);
  res.json({ success: true, data: cart });
});

commerceRouter.post("/cart/items", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { productId, courseId, learningUniverseId, quantity } = req.body;
  let pid = productId;
  if (!pid && courseId) {
    const p = await prisma.product.findUnique({ where: { courseId } });
    pid = p?.id;
  }
  if (!pid && learningUniverseId) {
    const p = await prisma.product.findUnique({ where: { learningUniverseId } });
    pid = p?.id;
  }
  if (!pid) throw new AppError(400, "productId, courseId, or learningUniverseId required");
  const cart = await addToCart(req.user.id, pid, quantity);
  res.json({ success: true, data: cart });
});

commerceRouter.delete("/cart/items/:productId", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const cart = await removeFromCart(req.user.id, req.params.productId);
  res.json({ success: true, data: cart });
});

commerceRouter.patch("/cart/items/:productId", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const cart = await updateCartQuantity(req.user.id, req.params.productId, Number(req.body.quantity));
  res.json({ success: true, data: cart });
});

commerceRouter.post("/cart/items/:productId/wishlist", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const cart = await moveCartItemToWishlist(req.user.id, req.params.productId);
  res.json({ success: true, data: cart });
});

commerceRouter.post("/cart/preview", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const preview = await buildCartCheckoutPreview(req.user.id, req.body.couponCode);
  res.json({ success: true, data: preview });
});

commerceRouter.post("/cart/checkout", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const result = await createCartOrder(req.user.id, req.body.couponCode);
  res.json({ success: true, ...result });
});

commerceRouter.post("/cart/verify", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new AppError(400, "Missing verification parameters");
  }
  const result = await verifyAndFulfillRazorpayPayment({
    userId: req.user.id,
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
  });
  res.json({ success: true, paymentId: result.payment.id, created: result.created });
});

// ——— Refunds (student) ———
commerceRouter.post("/refunds", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const req_ = await createRefundRequest(req.user.id, req.body.paymentId, req.body.reason, req.body.amount);
  res.status(201).json({ success: true, refundRequest: req_ });
});

commerceRouter.get("/refunds/mine", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const requests = await prisma.refundRequest.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
  });
  res.json({ success: true, requests });
});

// ——— Instructor payouts ———
commerceRouter.get("/instructor/payouts", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "instructor" && !isAdminRole(req.user.role)) throw new AppError(403, "Forbidden");
  const summary = await getInstructorPayoutSummary(req.user.id);
  const profile = await prisma.instructorPayoutProfile.findUnique({ where: { instructorId: req.user.id } });
  res.json({ success: true, summary, profile });
});

commerceRouter.put("/instructor/payout-profile", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "instructor") throw new AppError(403, "Forbidden");
  const profile = await upsertPayoutProfile(req.user.id, req.body);
  res.json({ success: true, profile });
});

commerceRouter.post("/instructor/withdraw", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  if (req.user.role !== "instructor") throw new AppError(403, "Forbidden");
  const w = await requestWithdrawal(req.user.id, Number(req.body.amount), req.body.method);
  res.status(201).json({ success: true, withdrawal: w });
});

// ——— Admin commerce ———
commerceRouter.get("/admin/analytics", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user || !isAdminRole(req.user.role)) throw new AppError(403, "Forbidden");
  const analytics = await getCommerceAnalytics();
  res.json({ success: true, analytics });
});

commerceRouter.get("/admin/analytics/export", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user || !isAdminRole(req.user.role)) throw new AppError(403, "Forbidden");
  const analytics = await getCommerceAnalytics();
  const format = req.query.format === "xlsx" ? "csv" : "csv";
  const csv = analyticsToCsv(analytics);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=commerce-report.${format}`);
  res.send(csv);
});

commerceRouter.get("/admin/refunds", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user || !isAdminRole(req.user.role)) throw new AppError(403, "Forbidden");
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const requests = await listRefundRequests({ status });
  res.json({ success: true, requests });
});

commerceRouter.post("/admin/refunds/:id/process", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user || !isAdminRole(req.user.role)) throw new AppError(403, "Forbidden");
  const updated = await processRefundRequest(
    req.params.id,
    req.body.action,
    req.user.id,
    { amount: req.body.amount, adminNote: req.body.adminNote }
  );
  res.json({ success: true, refundRequest: updated });
});

commerceRouter.get("/admin/payouts", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user || !isAdminRole(req.user.role)) throw new AppError(403, "Forbidden");
  const withdrawals = await listPendingWithdrawals();
  res.json({ success: true, withdrawals });
});

commerceRouter.post("/admin/payouts/:id/process", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user || !isAdminRole(req.user.role)) throw new AppError(403, "Forbidden");
  const w = await processWithdrawal(req.params.id, req.body.action, req.body.adminNote);
  res.json({ success: true, withdrawal: w });
});

// ——— Admin coupons (extended CRUD) ———
commerceRouter.patch("/admin/coupons/:id", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user || !isAdminRole(req.user.role)) throw new AppError(403, "Forbidden");
  const data = { ...req.body };
  if (data.code) data.code = String(data.code).trim().toUpperCase();
  if (data.expiresAt) data.expiresAt = new Date(data.expiresAt);
  const coupon = await prisma.coupon.update({ where: { id: req.params.id }, data });
  res.json({ success: true, coupon });
});

commerceRouter.delete("/admin/coupons/:id", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user || !isAdminRole(req.user.role)) throw new AppError(403, "Forbidden");
  await prisma.coupon.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

commerceRouter.post("/admin/coupons/:id/duplicate", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user || !isAdminRole(req.user.role)) throw new AppError(403, "Forbidden");
  const src = await prisma.coupon.findUnique({ where: { id: req.params.id } });
  if (!src) throw new AppError(404, "Coupon not found");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const coupon = await prisma.coupon.create({
    data: {
      code: `${src.code}-${suffix}`,
      description: src.description,
      discountType: src.discountType,
      discountValue: src.discountValue,
      maxUses: src.maxUses,
      minOrderAmount: src.minOrderAmount,
      expiresAt: src.expiresAt,
      courseId: src.courseId,
      learningUniverseId: src.learningUniverseId,
      productType: src.productType,
      firstPurchaseOnly: src.firstPurchaseOnly,
      maxDiscount: src.maxDiscount,
      categoryId: src.categoryId,
      globalScope: src.globalScope,
      active: false,
    },
  });
  res.status(201).json({ success: true, coupon });
});

// ——— Bundles (admin) ———
commerceRouter.get("/bundles", async (_req, res) => {
  const bundles = await prisma.productBundle.findMany({
    where: { published: true },
    include: { items: true, product: true },
  });
  res.json({ success: true, bundles });
});

commerceRouter.post("/admin/bundles", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user || !isAdminRole(req.user.role)) throw new AppError(403, "Forbidden");
  const { title, description, thumbnail, price, items } = req.body;
  const bundle = await prisma.productBundle.create({
    data: {
      title,
      description,
      thumbnail,
      price: Number(price) || 0,
      published: false,
      instructorId: req.user.id,
      items: {
        create: (items || []).map((it: { courseId?: string; learningUniverseId?: string }, i: number) => ({
          courseId: it.courseId || null,
          learningUniverseId: it.learningUniverseId || null,
          order: i,
        })),
      },
    },
    include: { items: true },
  });
  res.status(201).json({ success: true, bundle });
});

// ——— Membership plans (future-ready) ———
commerceRouter.get("/memberships", async (_req, res) => {
  const plans = await prisma.membershipPlan.findMany({ where: { active: true } });
  res.json({ success: true, plans });
});

// ——— Referrals ———
commerceRouter.get("/referrals/mine", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  let code = await prisma.referralCode.findUnique({ where: { userId: req.user.id } });
  if (!code) {
    const c = `GH${req.user.id.slice(-6).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    code = await prisma.referralCode.create({ data: { userId: req.user.id, code: c } });
  }
  const referrals = await prisma.referral.findMany({
    where: { referrerId: req.user.id },
    include: { referredUser: { select: { firstName: true, lastName: true, createdAt: true } } },
  });
  res.json({
    success: true,
    code: code.code,
    link: `${process.env.CLIENT_URL || "http://localhost:5173"}/register?ref=${code.code}`,
    rewardPoints: code.rewardPoints,
    referrals,
    totalRevenue: referrals.reduce((s, r) => s + r.revenue, 0),
  });
});

// ——— Gifts ———
commerceRouter.post("/gifts", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const gift = await prisma.giftPurchase.create({
    data: {
      senderId: req.user.id,
      recipientEmail: req.body.recipientEmail,
      message: req.body.message,
      courseId: req.body.courseId || null,
      learningUniverseId: req.body.learningUniverseId || null,
      productId: req.body.productId || null,
      scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : null,
      status: "pending",
    },
  });
  res.status(201).json({ success: true, gift });
});

// ——— Multi-currency display ———
commerceRouter.get("/currencies", (_req, res) => {
  res.json({
    success: true,
    currencies: ["INR", "USD", "EUR", "GBP", "AED"],
    default: "INR",
    gateways: { razorpay: true, stripe: false, paypal: false },
  });
});
