import { prisma } from "../utils/prisma.js";
import fs from "fs";
import path from "path";

const DEFAULTS = {
  id: "platform",
  platformName: "THE GATEHUB",
  maintenanceMode: false,
  defaultCurrency: "INR",
  platformFeePercentage: 20,
  instructorSharePercentage: 80,
  commerceGstPercentage: 0,
  paymentGateway: "razorpay",
  aiAuthoringEnabled: true,
  aiProvider: process.env.AI_PROVIDER || "ollama",
  aiLuBuilderEnabled: true,
  aiTutorEnabled: false,
  aiQuizGeneratorEnabled: true,
  aiProjectEvaluatorEnabled: false,
  aiInterviewAssistantEnabled: false,
  studentRegistrationEnabled: true,
  instructorRegistrationEnabled: true,
  instructorAutoApprove: true,
  emailVerificationEnabled: false,
  adminCreationEnabled: process.env.NODE_ENV !== "production" || process.env.ALLOW_ADMIN_REGISTRATION === "true",
  luPublishingEnabled: true,
  luRequireReview: false,
  luAllowPublic: true,
  luRequireEnrollment: true,
  luRequirePayment: true,
  luAllowProjectSubmissions: true,
  luAllowResubmissions: true,
  luEnableAutoGrading: false,
  sessionTimeoutMinutes: 1440,
  jwtExpiryHours: 168,
  maxLoginAttempts: 5,
  passwordMinLength: 8,
  requirePasswordNumber: true,
  requirePasswordSpecial: true,
  rateLimitingEnabled: true,
  captchaEnabled: false,
};

export type PlatformSettingsUpdate = Partial<typeof DEFAULTS> & Record<string, unknown>;

export async function getPlatformSettings() {
  let settings = await prisma.platformSettings.findUnique({ where: { id: "platform" } });
  if (!settings) {
    settings = await prisma.platformSettings.create({ data: DEFAULTS });
  }
  return settings;
}

export async function updatePlatformSettings(data: Record<string, unknown>, updatedById: string) {
  if (data.platformFeePercentage != null && data.instructorSharePercentage != null) {
    const sum = Number(data.platformFeePercentage) + Number(data.instructorSharePercentage);
    if (Math.abs(sum - 100) > 0.01) {
      throw new Error("Platform fee and instructor share must total 100%");
    }
  }
  await getPlatformSettings();
  return prisma.platformSettings.update({
    where: { id: "platform" },
    data: { ...data, updatedById },
  });
}

/** Strip sensitive fields before sending to non-super-admin clients */
export function sanitizeSettingsForClient(settings: Awaited<ReturnType<typeof getPlatformSettings>>, includeSecrets = false) {
  const copy = { ...settings } as Record<string, unknown>;
  if (!includeSecrets) {
    copy.smtpPassword = settings.smtpPassword ? "••••••••" : null;
  }
  return copy;
}

export async function getSystemHealth() {
  const uploadDir = process.env.UPLOAD_DIR || "uploads";
  let storageBytes = 0;
  try {
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else storageBytes += fs.statSync(full).size;
      }
    };
    walk(path.join(process.cwd(), uploadDir));
  } catch {
    storageBytes = 0;
  }

  let dbStatus: "healthy" | "error" = "healthy";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "error";
  }

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [
    activeUsers,
    failedLogins24h,
    lastPayment,
    aiRequestsMonth,
    aiRequestsTotal,
    aiCostEstimate,
  ] = await Promise.all([
    prisma.user.count({ where: { lastLoginAt: { gte: oneHourAgo }, deletedAt: null } }),
    prisma.loginHistory.count({ where: { success: false, createdAt: { gte: oneDayAgo } } }),
    prisma.payment.findFirst({ where: { status: "completed" }, orderBy: { createdAt: "desc" }, select: { createdAt: true, amount: true } }),
    prisma.aiUsageLog.count({ where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } } }),
    prisma.aiUsageLog.count(),
    prisma.aiUsageLog.aggregate({ _sum: { cost: true } }),
  ]);

  const settings = await getPlatformSettings();

  let aiHealth: { healthy: boolean; activeProvider: string; model?: string; message: string; ollamaModels?: number } = {
    healthy: false,
    activeProvider: settings.aiProvider,
    message: "Not checked",
  };
  try {
    const { AiRouter } = await import("./ai/AiRouter.js");
    const status = await AiRouter.healthCheck();
    aiHealth = {
      healthy: status.health.healthy,
      activeProvider: status.activeProvider,
      model: status.health.model || settings.aiModelName,
      message: status.health.message,
      ollamaModels: status.ollama?.models?.length,
    };
  } catch {
    aiHealth.message = "AI health check failed";
  }

  return {
    backend: { status: "healthy" as const, uptime: process.uptime() },
    database: { status: dbStatus },
    ai: {
      status: aiHealth.healthy ? "healthy" : settings.aiProvider === "mock" ? "mock" : "degraded",
      enabled: settings.aiAuthoringEnabled,
      provider: settings.aiProvider,
      activeProvider: aiHealth.activeProvider,
      model: aiHealth.model,
      message: aiHealth.message,
      ollama: settings.aiProvider === "ollama",
      ollamaModels: aiHealth.ollamaModels ?? 0,
    },
    payments: {
      status: process.env.RAZORPAY_KEY_ID ? "configured" : "not_configured",
      gateway: settings.paymentGateway,
      webhookConfigured: !!process.env.RAZORPAY_WEBHOOK_SECRET,
      lastPayment,
    },
    storage: {
      bytes: storageBytes,
      mb: Math.round((storageBytes / (1024 * 1024)) * 100) / 100,
    },
    activeUsers,
    failedLogins24h,
    aiUsage: {
      totalRequests: aiRequestsTotal,
      monthlyRequests: aiRequestsMonth,
      estimatedCost: aiCostEstimate._sum.cost ?? 0,
    },
    services: [
      { name: "API Server", status: "running" },
      { name: "PostgreSQL", status: dbStatus === "healthy" ? "running" : "error" },
      { name: "Razorpay", status: process.env.RAZORPAY_KEY_ID ? "connected" : "not_configured" },
      { name: "OpenAI", status: process.env.OPENAI_API_KEY ? "connected" : "not_configured" },
      { name: "WebSocket (Yjs)", status: "running" },
    ],
  };
}

export async function getPaymentStats() {
  const completed = await prisma.payment.findMany({
    where: { status: "completed" },
    select: { amount: true, platformFee: true, instructorEarning: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  const agg = await prisma.payment.aggregate({
    where: { status: "completed" },
    _sum: { amount: true, platformFee: true, instructorEarning: true },
    _count: true,
  });
  const refundAgg = await prisma.payment.aggregate({
    where: { status: "refunded" },
    _sum: { amount: true },
    _count: true,
  });
  return {
    lastPayment: completed[0] ?? null,
    totalRevenue: agg._sum.amount ?? 0,
    platformRevenue: agg._sum.platformFee ?? 0,
    instructorRevenue: agg._sum.instructorEarning ?? 0,
    transactionCount: agg._count,
    refundCount: refundAgg._count,
    refundAmount: refundAgg._sum.amount ?? 0,
  };
}
