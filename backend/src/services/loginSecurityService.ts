import { prisma } from "../utils/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";
import { getPlatformSettings } from "./platformSettingsService.js";
import { logSecurityEvent, SECURITY_ACTIONS } from "./securityAuditService.js";

const DEFAULT_MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

async function getMaxAttempts(): Promise<number> {
  try {
    const s = await getPlatformSettings();
    return Math.max(3, s.maxLoginAttempts || DEFAULT_MAX_ATTEMPTS);
  } catch {
    return DEFAULT_MAX_ATTEMPTS;
  }
}

export async function assertAccountNotLocked(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { lockedUntil: true },
  });
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new AppError(423, `Account locked. Try again in ${minutesLeft} minute(s).`);
  }
}

export async function recordFailedLogin(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  const maxAttempts = await getMaxAttempts();
  const attempts = user.loginAttempts + 1;
  const data: { loginAttempts: number; lockedUntil?: Date } = { loginAttempts: attempts };

  if (attempts >= maxAttempts) {
    data.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
    await logSecurityEvent({
      action: SECURITY_ACTIONS.ACCOUNT_LOCKED,
      userId: user.id,
      email: user.email,
      meta: { attempts },
    });
  }

  await prisma.user.update({ where: { id: user.id }, data });
}

export async function resetLoginAttempts(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { loginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
}
