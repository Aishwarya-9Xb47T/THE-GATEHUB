import { prisma } from "../utils/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";
import { getPlatformSettings } from "./platformSettingsService.js";

export async function getInstructorPayoutSummary(instructorId: string) {
  const payments = await prisma.payment.findMany({
    where: { instructorId, status: "completed" },
    select: { amount: true, instructorEarning: true, platformFee: true, createdAt: true },
  });

  const withdrawals = await prisma.payoutWithdrawal.findMany({
    where: { instructorId },
    orderBy: { createdAt: "desc" },
  });

  const lifetimeRevenue = payments.reduce((s, p) => s + p.amount, 0);
  const platformFees = payments.reduce((s, p) => s + (p.platformFee ?? 0), 0);
  const netEarnings = payments.reduce((s, p) => s + (p.instructorEarning ?? 0), 0);
  const withdrawn = withdrawals
    .filter((w) => w.status === "completed")
    .reduce((s, w) => s + w.amount, 0);
  const pendingWithdrawals = withdrawals
    .filter((w) => w.status === "pending")
    .reduce((s, w) => s + w.amount, 0);

  const availableBalance = Math.max(0, netEarnings - withdrawn - pendingWithdrawals);

  const settings = await getPlatformSettings();

  return {
    lifetimeRevenue,
    platformFees,
    netEarnings,
    withdrawn,
    pendingWithdrawals,
    availableBalance,
    platformFeePercent: settings.platformFeePercentage ?? 20,
    studentsPurchased: payments.length,
    withdrawals,
  };
}

export async function upsertPayoutProfile(
  instructorId: string,
  data: {
    bankName?: string;
    accountHolder?: string;
    accountNumber?: string;
    ifsc?: string;
    upiId?: string;
    panNumber?: string;
  }
) {
  return prisma.instructorPayoutProfile.upsert({
    where: { instructorId },
    create: { instructorId, ...data },
    update: data,
  });
}

export async function requestWithdrawal(instructorId: string, amount: number, method = "bank") {
  const summary = await getInstructorPayoutSummary(instructorId);
  if (amount <= 0) throw new AppError(400, "Invalid withdrawal amount");
  if (amount > summary.availableBalance) {
    throw new AppError(400, "Insufficient available balance");
  }

  const profile = await prisma.instructorPayoutProfile.findUnique({ where: { instructorId } });
  if (!profile) throw new AppError(400, "Add bank or UPI details before withdrawing");

  if (method === "upi" && !profile.upiId) throw new AppError(400, "UPI ID required");
  if (method === "bank" && (!profile.accountNumber || !profile.ifsc)) {
    throw new AppError(400, "Bank account details required");
  }

  return prisma.payoutWithdrawal.create({
    data: { instructorId, amount, method, status: "pending" },
  });
}

export async function processWithdrawal(
  withdrawalId: string,
  action: "approve" | "reject",
  adminNote?: string
) {
  const w = await prisma.payoutWithdrawal.findUnique({ where: { id: withdrawalId } });
  if (!w) throw new AppError(404, "Withdrawal not found");
  if (w.status !== "pending") throw new AppError(400, "Withdrawal already processed");

  return prisma.payoutWithdrawal.update({
    where: { id: withdrawalId },
    data: {
      status: action === "approve" ? "completed" : "rejected",
      adminNote,
      processedAt: new Date(),
    },
  });
}

export async function listPendingWithdrawals() {
  return prisma.payoutWithdrawal.findMany({
    where: { status: "pending" },
    include: {
      instructor: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
