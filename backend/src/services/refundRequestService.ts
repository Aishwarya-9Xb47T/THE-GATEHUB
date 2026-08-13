import { prisma } from "../utils/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";
import { processAdminRefund } from "./paymentService.js";
import { sendRefundEmail } from "./commerceEmailService.js";

export async function createRefundRequest(
  userId: string,
  paymentId: string,
  reason: string,
  amount?: number
) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, userId, status: "completed" },
    include: {
      user: { select: { email: true, firstName: true, lastName: true } },
      course: { select: { title: true } },
      learningUniverse: { select: { title: true } },
    },
  });
  if (!payment) throw new AppError(404, "Eligible payment not found");

  const existing = await prisma.refundRequest.findFirst({
    where: { paymentId, status: { in: ["pending", "approved"] } },
  });
  if (existing) throw new AppError(400, "Refund request already pending");

  const req = await prisma.refundRequest.create({
    data: {
      paymentId,
      orderId: payment.orderId,
      userId,
      amount: amount ?? payment.amount,
      reason,
      status: "pending",
    },
  });

  const title = payment.course?.title || payment.learningUniverse?.title || "Purchase";
  void sendRefundEmail({
    email: payment.user.email,
    name: `${payment.user.firstName} ${payment.user.lastName}`.trim(),
    productTitle: title,
    amount: req.amount,
    status: "requested",
  });

  return req;
}

export async function listRefundRequests(filters?: { status?: string }) {
  return prisma.refundRequest.findMany({
    where: filters?.status ? { status: filters.status } : undefined,
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
      order: { select: { orderNumber: true, productTitle: true, totalAmount: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function processRefundRequest(
  requestId: string,
  action: "approve" | "reject" | "partial",
  adminId: string,
  options?: { amount?: number; adminNote?: string }
) {
  const req = await prisma.refundRequest.findUnique({
    where: { id: requestId },
    include: {
      user: { select: { email: true, firstName: true, lastName: true } },
      order: { select: { productTitle: true } },
    },
  });
  if (!req) throw new AppError(404, "Refund request not found");
  if (req.status !== "pending") throw new AppError(400, "Request already processed");

  if (action === "reject") {
    const updated = await prisma.refundRequest.update({
      where: { id: requestId },
      data: {
        status: "rejected",
        adminNote: options?.adminNote,
        processedBy: adminId,
        processedAt: new Date(),
      },
    });
    void sendRefundEmail({
      email: req.user.email,
      name: `${req.user.firstName} ${req.user.lastName}`.trim(),
      productTitle: req.order?.productTitle || "Purchase",
      amount: req.amount,
      status: "rejected",
    });
    return updated;
  }

  const refundAmount = action === "partial" ? options?.amount : req.amount;
  if (!refundAmount || refundAmount <= 0) throw new AppError(400, "Refund amount required");

  await processAdminRefund(req.paymentId, refundAmount);

  const updated = await prisma.refundRequest.update({
    where: { id: requestId },
    data: {
      status: action === "partial" ? "partial" : "approved",
      amount: refundAmount,
      adminNote: options?.adminNote,
      processedBy: adminId,
      processedAt: new Date(),
      gatewayRef: "razorpay",
    },
  });

  void sendRefundEmail({
    email: req.user.email,
    name: `${req.user.firstName} ${req.user.lastName}`.trim(),
    productTitle: req.order?.productTitle || "Purchase",
    amount: refundAmount,
    status: "completed",
  });

  return updated;
}
