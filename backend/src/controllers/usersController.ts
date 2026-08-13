import { Response } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import bcrypt from "bcryptjs";
import { getPasswordPolicy, validatePassword } from "../utils/passwordPolicy.js";
import { logSecurityEvent, SECURITY_ACTIONS, getReqMeta } from "../services/securityAuditService.js";

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  avatar: z.string().url().nullable().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(128).optional(),
});

export async function getProfile(req: AuthRequest, res: Response) {
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
      createdAt: true,
      emailVerified: true,
      pendingEmail: true,
    },
  });

  if (!user) throw new AppError(404, "User not found");
  res.json({ success: true, user });
}

export async function updateProfile(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const data = updateSchema.parse(req.body);

  if (data.newPassword && !data.currentPassword) {
    throw new AppError(400, "Current password required to set new password");
  }

  const update: Record<string, unknown> = {};
  if (data.firstName !== undefined) update.firstName = data.firstName;
  if (data.lastName !== undefined) update.lastName = data.lastName;
  if (data.avatar !== undefined) update.avatar = data.avatar;

  let passwordChanged = false;
  if (data.newPassword && data.currentPassword) {
    const policy = await getPasswordPolicy();
    const passwordError = validatePassword(data.newPassword, policy);
    if (passwordError) throw new AppError(400, passwordError);

    const existing = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!existing?.passwordHash || !(await bcrypt.compare(data.currentPassword, existing.passwordHash))) {
      throw new AppError(400, "Current password is incorrect");
    }
    update.passwordHash = await bcrypt.hash(data.newPassword, 12);
    update.tokenVersion = { increment: 1 };
    passwordChanged = true;
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
      emailVerified: true,
    },
  });

  if (passwordChanged) {
    await prisma.userSession.updateMany({
      where: { userId: req.user.id },
      data: { revoked: true },
    });
    await logSecurityEvent({
      action: SECURITY_ACTIONS.PASSWORD_CHANGED,
      userId: user.id,
      email: user.email,
      ...getReqMeta(req),
      meta: { via: "profile" },
    });
    try {
      const { sendPasswordChangedEmail } = await import("../services/emailService.js");
      await sendPasswordChangedEmail(user.email);
    } catch {
      /* optional */
    }
  }

  res.json({
    success: true,
    user,
    ...(passwordChanged ? { requireReauth: true, message: "Password updated. Please sign in again." } : {}),
  });
}
