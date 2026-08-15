import { Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { formatRoleLabel, isAdminRole, isSuperAdminRole } from "../utils/roles.js";
import { prisma } from "../utils/prisma.js";
import {
  getPlatformSettings,
  updatePlatformSettings,
  sanitizeSettingsForClient,
  getSystemHealth,
  getPaymentStats,
} from "../services/platformSettingsService.js";
import {
  getActiveSessions,
  getLoginHistory,
  logoutAllDevices,
} from "../services/sessionService.js";
import { logAuditEvent, AUDIT_ACTIONS, getClientIp } from "../services/auditLogService.js";
import { buildCertificateHtml, wrapCertificateHtmlForPreview, PremiumCertificateService, CERTIFICATE_PREVIEW_SAMPLE } from "../services/premiumCertificateService.js";

const profileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  designation: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  avatar: z.string().nullable().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

const settingsSchema = z.object({
  platformName: z.string().min(1).optional(),
  platformLogo: z.string().nullable().optional(),
  faviconUrl: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  supportEmail: z.string().email().nullable().optional(),
  supportPhone: z.string().nullable().optional(),
  websiteUrl: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  footerText: z.string().nullable().optional(),
  maintenanceMode: z.boolean().optional(),
  defaultCurrency: z.string().min(3).max(3).optional(),
  platformFeePercentage: z.number().min(0).max(100).optional(),
  instructorSharePercentage: z.number().min(0).max(100).optional(),
  certificateIssuerName: z.string().nullable().optional(),
  certificateDesignation: z.string().nullable().optional(),
  certificatePrefix: z.string().nullable().optional(),
  certificateSignatureUrl: z.string().nullable().optional(),
  certificateSealUrl: z.string().nullable().optional(),
  certificateBackgroundUrl: z.string().nullable().optional(),
  paymentGateway: z.string().optional(),
  aiAuthoringEnabled: z.boolean().optional(),
  aiModelName: z.string().nullable().optional(),
  aiProvider: z.enum(["openai", "gemini", "hybrid"]).optional(),
  aiLuBuilderEnabled: z.boolean().optional(),
  aiTutorEnabled: z.boolean().optional(),
  aiQuizGeneratorEnabled: z.boolean().optional(),
  aiProjectEvaluatorEnabled: z.boolean().optional(),
  aiInterviewAssistantEnabled: z.boolean().optional(),
  studentRegistrationEnabled: z.boolean().optional(),
  instructorRegistrationEnabled: z.boolean().optional(),
  instructorAutoApprove: z.boolean().optional(),
  emailVerificationEnabled: z.boolean().optional(),
  adminCreationEnabled: z.boolean().optional(),
  luPublishingEnabled: z.boolean().optional(),
  luRequireReview: z.boolean().optional(),
  luAllowPublic: z.boolean().optional(),
  luRequireEnrollment: z.boolean().optional(),
  luRequirePayment: z.boolean().optional(),
  luAllowProjectSubmissions: z.boolean().optional(),
  luAllowResubmissions: z.boolean().optional(),
  luEnableAutoGrading: z.boolean().optional(),
  sessionTimeoutMinutes: z.number().min(5).max(10080).optional(),
  jwtExpiryHours: z.number().min(1).max(8760).optional(),
  maxLoginAttempts: z.number().min(1).max(20).optional(),
  passwordMinLength: z.number().min(6).max(32).optional(),
  requirePasswordNumber: z.boolean().optional(),
  requirePasswordSpecial: z.boolean().optional(),
  rateLimitingEnabled: z.boolean().optional(),
  captchaEnabled: z.boolean().optional(),
  smtpHost: z.string().nullable().optional(),
  smtpPort: z.number().nullable().optional(),
  smtpUsername: z.string().nullable().optional(),
  smtpPassword: z.string().nullable().optional(),
  emailTemplates: z.record(z.string()).nullable().optional(),
});

export async function getAdminProfile(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatar: true,
      role: true,
      phone: true,
      designation: true,
      bio: true,
      contactEmail: true,
      lastLoginAt: true,
      createdAt: true,
      emailNotifications: true,
    },
  });
  if (!user) throw new AppError(404, "User not found");

  const [sessions, loginHistory] = await Promise.all([
    getActiveSessions(req.user.id, req.user.sessionId),
    getLoginHistory(req.user.id, 20),
  ]);

  const fullUser = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { suspended: true },
  });

  res.json({
    success: true,
    profile: {
      ...user,
      roleLabel: formatRoleLabel(user.role),
      accountStatus: fullUser?.suspended ? "Suspended" : "Active",
    },
    sessions,
    loginHistory,
    currentSessionId: req.user.sessionId ?? null,
  });
}

export async function updateAdminProfile(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = profileSchema.parse(req.body);

  if (data.newPassword && !data.currentPassword) {
    throw new AppError(400, "Current password required");
  }

  const update: Record<string, unknown> = {};
  if (data.firstName !== undefined) update.firstName = data.firstName;
  if (data.lastName !== undefined) update.lastName = data.lastName;
  if (data.phone !== undefined) update.phone = data.phone;
  if (data.designation !== undefined) update.designation = data.designation;
  if (data.bio !== undefined) update.bio = data.bio;
  if (data.contactEmail !== undefined) update.contactEmail = data.contactEmail;
  if (data.avatar !== undefined) update.avatar = data.avatar;

  if (data.newPassword && data.currentPassword) {
    const existing = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!existing || !(await bcrypt.compare(data.currentPassword, existing.passwordHash))) {
      throw new AppError(400, "Current password is incorrect");
    }
    update.passwordHash = await bcrypt.hash(data.newPassword, 12);
  }

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: update,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatar: true,
      role: true,
      phone: true,
      designation: true,
      bio: true,
      contactEmail: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  res.json({ success: true, user });
}

export async function logoutAllSessions(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  await logoutAllDevices(req.user.id);
  if (isSuperAdminRole(req.user.role)) {
    await logAuditEvent({
      adminId: req.user.id,
      action: AUDIT_ACTIONS.ADMIN_LOGOUT,
      details: { type: "logout_all_devices" },
      ipAddress: getClientIp(req),
    });
  }
  res.json({
    success: true,
    requiresReauth: true,
    message: "All sessions revoked. Please log in again.",
  });
}

export async function getSettings(req: AuthRequest, res: Response) {
  const settings = await getPlatformSettings();
  const includeSecrets = isSuperAdminRole(req.user?.role);
  const paymentStats = await getPaymentStats();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const [aiMonthly, aiTotal, aiCost] = await Promise.all([
    prisma.aiUsageLog.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.aiUsageLog.count(),
    prisma.aiUsageLog.aggregate({ _sum: { cost: true } }),
  ]);

  res.json({
    success: true,
    settings: sanitizeSettingsForClient(settings, includeSecrets),
    paymentStats,
    aiUsage: {
      monthlyRequests: aiMonthly,
      totalRequests: aiTotal,
      estimatedCost: aiCost._sum.cost ?? 0,
    },
    integrations: {
      openai: !!process.env.OPENAI_API_KEY,
      gemini: !!process.env.GOOGLE_AI_API_KEY,
      razorpay: !!process.env.RAZORPAY_KEY_ID,
      razorpayWebhook: !!process.env.RAZORPAY_WEBHOOK_SECRET,
    },
  });
}

export async function updateSettings(req: AuthRequest, res: Response) {
  const body = settingsSchema.parse(req.body);

  if (body.platformFeePercentage != null || body.instructorSharePercentage != null) {
    const current = await getPlatformSettings();
    const platform = body.platformFeePercentage ?? current.platformFeePercentage;
    const instructor = body.instructorSharePercentage ?? current.instructorSharePercentage;
    if (Math.abs(platform + instructor - 100) > 0.01) {
      throw new AppError(400, "Platform fee and instructor share must total 100%");
    }
  }

  if (body.smtpPassword === "••••••••") {
    delete (body as Record<string, unknown>).smtpPassword;
  }

  const settings = await updatePlatformSettings(body, req.user!.id);

  await logAuditEvent({
    adminId: req.user!.id,
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    targetType: "platform_settings",
    details: body as Record<string, unknown>,
    ipAddress: getClientIp(req),
  });

  res.json({ success: true, settings: sanitizeSettingsForClient(settings, true) });
}

export async function getHealth(_req: AuthRequest, res: Response) {
  const health = await getSystemHealth();
  res.json({ success: true, health });
}

export async function testEmail(req: AuthRequest, res: Response) {
  const { to } = z.object({ to: z.string().email() }).parse(req.body);
  const settings = await getPlatformSettings();

  const host = settings.smtpHost || process.env.SMTP_HOST;
  const port = settings.smtpPort || Number(process.env.SMTP_PORT || 587);
  const user = settings.smtpUsername || process.env.EMAIL_USER;
  const pass = settings.smtpPassword || process.env.EMAIL_PASS;

  if (!user || !pass) {
    throw new AppError(400, "SMTP not configured. Set SMTP credentials in Email settings or environment variables.");
  }

  const transporter = nodemailer.createTransport({
    host: host || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: user,
    to,
    subject: `[${settings.platformName}] Test Email`,
    html: `<p>This is a test email from ${settings.platformName} admin settings.</p>`,
  });

  res.json({ success: true, message: `Test email sent to ${to}` });
}

function previewCertificateData() {
  return {
    ...CERTIFICATE_PREVIEW_SAMPLE,
    completionDate: new Date(),
  };
}

export async function getCertificatePreview(req: AuthRequest, res: Response) {
  const settings = await getPlatformSettings();
  const { html, certificateId } = await buildCertificateHtml(previewCertificateData(), {
    settings,
    previewMode: true,
  });
  res.json({ success: true, preview: { html, certificateId } });
}

export async function getCertificatePreviewHtml(req: AuthRequest, res: Response) {
  const settings = await getPlatformSettings();
  const { html } = await buildCertificateHtml(previewCertificateData(), { settings, previewMode: true });
  res.type("html").send(html);
}

const certPreviewOverrideSchema = z.object({
  platformName: z.string().optional(),
  platformLogo: z.string().nullable().optional(),
  certificateIssuerName: z.string().nullable().optional(),
  certificateDesignation: z.string().nullable().optional(),
  certificatePrefix: z.string().nullable().optional(),
  certificateSignatureUrl: z.string().nullable().optional(),
  certificateSealUrl: z.string().nullable().optional(),
  certificateBackgroundUrl: z.string().nullable().optional(),
  zoom: z.number().min(25).max(100).optional(),
});

export async function postCertificatePreview(req: AuthRequest, res: Response) {
  const body = certPreviewOverrideSchema.parse(req.body ?? {});
  const { zoom, ...overrides } = body;
  const base = await getPlatformSettings();
  const settings = { ...base, ...overrides };
  const { html, certificateId } = await buildCertificateHtml(previewCertificateData(), {
    settings,
    previewMode: true,
  });
  const previewHtml = wrapCertificateHtmlForPreview(html, zoom ?? 50);
  res.json({ success: true, preview: { html: previewHtml, rawHtml: html, certificateId } });
}

/** Returns the actual PDF bytes — pixel-perfect match to student downloads */
export async function postCertificatePreviewPdf(req: AuthRequest, res: Response) {
  const body = certPreviewOverrideSchema.parse(req.body ?? {});
  const { zoom: _zoom, ...overrides } = body;
  const base = await getPlatformSettings();
  const settings = { ...base, ...overrides };
  const svc = new PremiumCertificateService();
  const pdfBuffer = await svc.generateCertificate(previewCertificateData(), {
    settings,
    previewMode: true,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="certificate-preview.pdf"');
  res.setHeader("Content-Length", pdfBuffer.length);
  res.send(pdfBuffer);
}

export async function uploadPlatformAsset(req: AuthRequest & { file?: Express.Multer.File }, res: Response) {
  const type = req.params.type;
  const allowed = ["logo", "favicon", "signature", "seal", "background"];
  if (!allowed.includes(type)) throw new AppError(400, "Invalid asset type");

  if (!req.file) throw new AppError(400, "No file uploaded");

  const { persistMulterFile } = await import("../middlewares/persistUpload.js");
  const prefix =
    type === "logo" || type === "favicon" ? "images" : type === "background" ? "banners" : "images";
  const url = await persistMulterFile(req.file, prefix as "images" | "banners");

  const fieldMap: Record<string, string> = {
    logo: "platformLogo",
    favicon: "faviconUrl",
    signature: "certificateSignatureUrl",
    seal: "certificateSealUrl",
    background: "certificateBackgroundUrl",
  };

  if (!isAdminRole(req.user?.role)) throw new AppError(403, "Admin access required");

  const settings = await updatePlatformSettings({ [fieldMap[type]]: url }, req.user!.id);
  res.json({ success: true, url, settings: sanitizeSettingsForClient(settings, true) });
}

const certAssetFields: Record<string, string> = {
  signature: "certificateSignatureUrl",
  seal: "certificateSealUrl",
  background: "certificateBackgroundUrl",
};

export async function deleteCertificateAsset(req: AuthRequest, res: Response) {
  const type = req.params.type;
  if (!certAssetFields[type]) throw new AppError(400, "Invalid asset type");
  if (!isAdminRole(req.user?.role)) throw new AppError(403, "Admin access required");

  const settings = await updatePlatformSettings({ [certAssetFields[type]]: null }, req.user!.id);
  res.json({ success: true, settings: sanitizeSettingsForClient(settings, true) });
}
