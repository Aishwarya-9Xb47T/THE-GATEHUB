import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";
import { Role, getAllowedRegistrationRoles, isAdminRole } from "../utils/roles.js";
import {
  assertAccountNotLocked,
  recordFailedLogin,
  resetLoginAttempts,
} from "./loginSecurityService.js";
import { logAuditEvent, AUDIT_ACTIONS, getClientIp } from "./auditLogService.js";
import { JWT_SECRET, JWT_EXPIRES } from "../config/jwt.js";
import { createUserSession, recordLoginHistory } from "./sessionService.js";
import { getPlatformSettings } from "./platformSettingsService.js";
import { normalizeEmail } from "../utils/emailNormalize.js";
import { getPasswordPolicy, validatePassword } from "../utils/passwordPolicy.js";
import { issueAuthToken, consumeAuthToken } from "./authTokenService.js";
import {
  logSecurityEvent,
  SECURITY_ACTIONS,
  getReqMeta,
} from "./securityAuditService.js";
import { getFrontendUrl } from "../utils/frontendUrl.js";
import { GOOGLE_AUTH_ERROR, isUsableGoogleProfile } from "./googleOAuthErrors.js";

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: Role;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
}

type ReqLike = { headers: Record<string, unknown>; ip?: string; socket?: { remoteAddress?: string } };

function sanitizeUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  avatar: string | null;
  emailVerified?: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    avatar: user.avatar,
    emailVerified: !!user.emailVerified,
  };
}

async function resolveJwtExpires(): Promise<string | number> {
  try {
    const settings = await getPlatformSettings();
    if (settings.jwtExpiryHours && settings.jwtExpiryHours > 0) {
      return `${settings.jwtExpiryHours}h`;
    }
  } catch {
    /* use env default */
  }
  return JWT_EXPIRES;
}

async function signToken(user: {
  id: string;
  email: string;
  role: string;
  tokenVersion?: number;
  sessionId?: string;
}) {
  const expiresIn = await resolveJwtExpires();
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
      ...(user.sessionId ? { sessionId: user.sessionId } : {}),
    },
    JWT_SECRET,
    { expiresIn } as jwt.SignOptions
  );
}

async function sendVerificationForUser(user: {
  id: string;
  email: string;
  firstName: string;
}) {
  const { rawToken } = await issueAuthToken({ userId: user.id, type: "email_verify" });
  const { sendVerificationEmail } = await import("./emailService.js");
  await sendVerificationEmail(user.email, rawToken, user.firstName);
}

export async function register(data: RegisterInput, req?: ReqLike) {
  const requestedRole = data.role || "student";
  const settings = await getPlatformSettings();
  const meta = getReqMeta(req);

  const allowedRoles = getAllowedRegistrationRoles();
  if (!allowedRoles.includes(requestedRole)) {
    throw new AppError(403, "This account type cannot be created via public registration");
  }
  // Never allow self-serve admin in production unless explicitly enabled AND settings allow
  if (requestedRole === "admin") {
    const allowAdminReg =
      process.env.NODE_ENV !== "production" || process.env.ALLOW_ADMIN_REGISTRATION === "true";
    if (!allowAdminReg || !settings.adminCreationEnabled) {
      throw new AppError(403, "Admin registration is currently disabled");
    }
  }

  if (requestedRole === "student" && !settings.studentRegistrationEnabled) {
    throw new AppError(403, "Student registration is currently disabled");
  }
  if (requestedRole === "instructor" && !settings.instructorRegistrationEnabled) {
    throw new AppError(403, "Instructor registration is currently disabled");
  }

  const normalizedEmail = normalizeEmail(data.email);
  const policy = await getPasswordPolicy();
  const passwordError = validatePassword(data.password, policy);
  if (passwordError) throw new AppError(400, passwordError);

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  const requireVerify = !!settings.emailVerificationEnabled;

  // Anti-enumeration when verification is required: always return a verification-style response.
  if (existing) {
    if (requireVerify && !existing.emailVerified && !existing.deletedAt && !existing.suspended) {
      try {
        await sendVerificationForUser({
          id: existing.id,
          email: existing.email,
          firstName: existing.firstName,
        });
        await logSecurityEvent({
          action: SECURITY_ACTIONS.EMAIL_VERIFICATION_SENT,
          userId: existing.id,
          email: existing.email,
          ...meta,
        });
      } catch (err) {
        console.error(
          "Verification resend on register failed:",
          err instanceof Error ? err.message : "error"
        );
      }
      return {
        user: null,
        token: null,
        requiresEmailVerification: true,
        message: "Check your email to verify your account and complete registration.",
      };
    }
    if (requireVerify) {
      return {
        user: null,
        token: null,
        requiresEmailVerification: true,
        message: "Check your email to verify your account and complete registration.",
      };
    }
    throw new AppError(400, "An account with this email already exists. Please sign in instead.");
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const emailVerified = !requireVerify;

  let user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    avatar: string | null;
    tokenVersion: number;
    emailVerified: boolean;
  };

  try {
    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        role: requestedRole,
        emailVerified,
        emailVerifiedAt: emailVerified ? new Date() : null,
        authProvider: "local",
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        tokenVersion: true,
        emailVerified: true,
      },
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      if (requireVerify) {
        return {
          user: null,
          token: null,
          requiresEmailVerification: true,
          message: "Check your email to verify your account and complete registration.",
        };
      }
      throw new AppError(400, "An account with this email already exists. Please sign in instead.");
    }
    throw err;
  }

  await logSecurityEvent({
    action: SECURITY_ACTIONS.REGISTER,
    userId: user.id,
    email: user.email,
    ...meta,
    meta: { role: user.role },
  });

  if (requireVerify) {
    try {
      await sendVerificationForUser(user);
      await logSecurityEvent({
        action: SECURITY_ACTIONS.EMAIL_VERIFICATION_SENT,
        userId: user.id,
        email: user.email,
        ...meta,
      });
    } catch (err) {
      console.error("Verification email failed:", err instanceof Error ? err.message : "error");
    }
    return {
      user: null,
      token: null,
      requiresEmailVerification: true,
      message: "Account created. Check your email to verify your address before signing in.",
    };
  }

  await recordLoginHistory(user.id, req, true);
  const session = await createUserSession(user.id, user.tokenVersion, req);
  try {
    const { sendWelcomeEmail } = await import("./emailService.js");
    await sendWelcomeEmail(user.email, user.firstName);
  } catch {
    /* optional */
  }

  return {
    user: sanitizeUser(user),
    token: await signToken({ ...user, sessionId: session.id }),
    requiresEmailVerification: false,
    message: "Account created successfully.",
  };
}

export async function login(email: string, password: string, req?: ReqLike) {
  const normalized = normalizeEmail(email);
  const meta = getReqMeta(req);
  const INVALID = "Invalid email or password.";

  try {
    await assertAccountNotLocked(normalized);

    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user || user.deletedAt) {
      // Constant-ish work to reduce timing oracle (valid bcrypt of a dummy string)
      await bcrypt.compare(
        password,
        "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
      );
      await logSecurityEvent({
        action: SECURITY_ACTIONS.LOGIN_FAILURE,
        email: normalized,
        ...meta,
        meta: { reason: "not_found" },
      });
      throw new AppError(401, INVALID);
    }

    if (user.suspended) throw new AppError(403, "Account suspended");

    if (!user.passwordHash) {
      throw new AppError(400, "This account uses Google Sign-In. Please continue with Google.");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await recordFailedLogin(normalized);
      await recordLoginHistory(user.id, req, false);
      await logSecurityEvent({
        action: SECURITY_ACTIONS.LOGIN_FAILURE,
        userId: user.id,
        email: normalized,
        ...meta,
        meta: { reason: "bad_password" },
      });
      throw new AppError(401, INVALID);
    }

    const settings = await getPlatformSettings();
    if (settings.emailVerificationEnabled && !user.emailVerified) {
      throw new AppError(403, "Please verify your email before signing in. Check your inbox for a verification link.");
    }

    await resetLoginAttempts(user.id);
    await recordLoginHistory(user.id, req, true);
    const session = await createUserSession(user.id, user.tokenVersion, req);

    const sanitized = sanitizeUser(user);

    await logSecurityEvent({
      action: SECURITY_ACTIONS.LOGIN_SUCCESS,
      userId: user.id,
      email: user.email,
      ...meta,
    });

    if (isAdminRole(user.role) && req) {
      await logAuditEvent({
        adminId: user.id,
        action: AUDIT_ACTIONS.ADMIN_LOGIN,
        ipAddress: getClientIp(req),
      });
    }

    return { user: sanitized, token: await signToken({ ...user, sessionId: session.id }) };
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;
    throw new AppError(500, "Login failed. Please try again later.");
  }
}

const GOOGLE_LOGIN_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  avatar: true,
  tokenVersion: true,
  googleId: true,
  suspended: true,
  deletedAt: true,
  authProvider: true,
  emailVerified: true,
} as const;

function googleAuthError(status: number, code: string, message: string, retryable = false) {
  return new AppError(status, message, true, { code, stage: "google-oauth", retryable });
}

export async function googleOAuthLogin(profile: GoogleProfile, req?: ReqLike) {
  if (!isUsableGoogleProfile(profile)) {
    throw googleAuthError(
      400,
      GOOGLE_AUTH_ERROR.INVALID_GOOGLE_PROFILE,
      "Google did not return a complete profile. Please try again.",
      true
    );
  }

  const email = normalizeEmail(profile.email);
  const googleId = profile.googleId.trim();

  // Soft-deleted rows must not occupy googleId or block an active account.
  const released = await prisma.user.updateMany({
    where: { googleId, deletedAt: { not: null } },
    data: { googleId: null },
  });
  if (released.count > 0) {
    console.warn("[Auth] Released googleId from soft-deleted user(s)", { count: released.count });
  }

  let user = await prisma.user.findFirst({
    where: { googleId, deletedAt: null },
    select: GOOGLE_LOGIN_USER_SELECT,
  });

  if (user) {
    if (user.suspended) {
      console.warn("[Auth] Google login blocked: active account is suspended", { userId: user.id });
      throw googleAuthError(
        403,
        GOOGLE_AUTH_ERROR.USER_SUSPENDED,
        "This GateHub account is suspended. Contact support if you believe this is a mistake."
      );
    }
    if (!user.emailVerified) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
        select: GOOGLE_LOGIN_USER_SELECT,
      });
    }
  } else {
    const existingByEmail = await prisma.user.findUnique({
      where: { email },
      select: GOOGLE_LOGIN_USER_SELECT,
    });

    if (existingByEmail?.deletedAt) {
      console.warn("[Auth] Google login blocked: email belongs to a removed account", {
        userId: existingByEmail.id,
      });
      throw googleAuthError(
        403,
        GOOGLE_AUTH_ERROR.USER_DELETED,
        "This email belongs to a removed GateHub account. Sign in with email and password, or contact support to restore access."
      );
    }

    if (existingByEmail) {
      if (existingByEmail.suspended) {
        console.warn("[Auth] Google login blocked: email account is suspended", {
          userId: existingByEmail.id,
        });
        throw googleAuthError(
          403,
          GOOGLE_AUTH_ERROR.USER_SUSPENDED,
          "This GateHub account is suspended. Contact support if you believe this is a mistake."
        );
      }
      if (existingByEmail.googleId && existingByEmail.googleId !== googleId) {
        console.warn("[Auth] Google login blocked: email already linked to a different Google account", {
          userId: existingByEmail.id,
        });
        throw googleAuthError(
          409,
          GOOGLE_AUTH_ERROR.GOOGLE_ACCOUNT_MISMATCH,
          "This email is already linked to a different Google account. Sign in with email and password."
        );
      }
      user = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          googleId,
          authProvider: existingByEmail.authProvider === "google" ? "google" : "both",
          emailVerified: true,
          emailVerifiedAt: new Date(),
          ...(profile.avatar && !existingByEmail.avatar ? { avatar: profile.avatar } : {}),
        },
        select: GOOGLE_LOGIN_USER_SELECT,
      });
    } else {
      const settings = await getPlatformSettings();
      if (!settings.studentRegistrationEnabled) {
        throw googleAuthError(
          403,
          GOOGLE_AUTH_ERROR.REGISTRATIONS_DISABLED,
          "New registrations are currently disabled"
        );
      }

      try {
        user = await prisma.user.create({
          data: {
            email,
            googleId,
            authProvider: "google",
            firstName: profile.firstName,
            lastName: profile.lastName,
            avatar: profile.avatar ?? null,
            role: "student",
            emailVerified: true,
            emailVerifiedAt: new Date(),
          },
          select: GOOGLE_LOGIN_USER_SELECT,
        });
      } catch (err) {
        const prismaCode =
          err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
        console.error("[Auth] Google user create failed", { prismaCode: prismaCode || "unknown" });
        throw googleAuthError(
          500,
          GOOGLE_AUTH_ERROR.GOOGLE_AUTH_FAILED,
          "Google sign-in could not be completed. Please try again.",
          true
        );
      }
    }
  }

  try {
    await recordLoginHistory(user.id, req, true);
    const session = await createUserSession(user.id, user.tokenVersion, req);
    const token = await signToken({ ...user, sessionId: session.id });

    await logSecurityEvent({
      action: SECURITY_ACTIONS.LOGIN_SUCCESS,
      userId: user.id,
      email: user.email,
      ...getReqMeta(req),
      meta: { provider: "google" },
    });

    return { user: sanitizeUser(user), token, sessionId: session.id };
  } catch (err) {
    console.error("[Auth] Google session creation failed", {
      userId: user.id,
      message: err instanceof Error ? err.message : "unknown",
    });
    throw googleAuthError(
      500,
      GOOGLE_AUTH_ERROR.SESSION_FAILED,
      "Could not create a sign-in session. Please try again.",
      true
    );
  }
}

/** Issue short-lived one-time code instead of putting JWT in the redirect URL. */
export async function createOAuthExchangeCode(userId: string, sessionId: string, token: string) {
  const { rawToken } = await issueAuthToken({
    userId,
    type: "oauth_exchange",
    ttlMs: 120_000,
    payload: { sessionId, token },
  });
  return rawToken;
}

export async function exchangeOAuthCode(rawCode: string) {
  const consumed = await consumeAuthToken({ rawToken: rawCode, type: "oauth_exchange" });
  if (!consumed || !consumed.payload?.token) {
    throw new AppError(400, "Invalid or expired sign-in code. Please try again.");
  }
  const user = await prisma.user.findUnique({
    where: { id: consumed.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      avatar: true,
      emailVerified: true,
      suspended: true,
    },
  });
  if (!user || user.suspended) throw new AppError(401, "Authentication failed");
  return {
    user: sanitizeUser(user),
    token: String(consumed.payload.token),
  };
}

export async function logout(
  userId: string,
  role: string,
  req?: ReqLike,
  sessionId?: string
) {
  if (sessionId) {
    const { revokeSession } = await import("./sessionService.js");
    await revokeSession(sessionId, userId);
  }
  await logSecurityEvent({
    action: SECURITY_ACTIONS.LOGOUT,
    userId,
    ...getReqMeta(req),
  });
  if (isAdminRole(role) && req) {
    await logAuditEvent({
      adminId: userId,
      action: AUDIT_ACTIONS.ADMIN_LOGOUT,
      ipAddress: getClientIp(req),
    });
  }
  return { message: "Logged out successfully" };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      avatar: true,
      createdAt: true,
      suspended: true,
      emailVerified: true,
      emailVerifiedAt: true,
      lastLoginAt: true,
      pendingEmail: true,
    },
  });
  if (!user || user.suspended) throw new AppError(404, "User not found");
  return user;
}

export async function forgotPassword(email: string, req?: ReqLike) {
  const generic = {
    message: "If an account exists for this email, we've sent password reset instructions.",
  };
  const normalized = normalizeEmail(email);
  const meta = getReqMeta(req);

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  await logSecurityEvent({
    action: SECURITY_ACTIONS.PASSWORD_RESET_REQUESTED,
    userId: user?.id,
    email: normalized,
    ...meta,
  });

  if (!user || user.suspended || user.deletedAt) return generic;
  if (user.authProvider === "google" && !user.passwordHash) return generic;

  try {
    const { rawToken } = await issueAuthToken({ userId: user.id, type: "password_reset" });
    const { sendPasswordResetEmail } = await import("./emailService.js");
    await sendPasswordResetEmail(user.email, rawToken);
  } catch (err) {
    console.error("Password reset email failed:", err instanceof Error ? err.message : "error");
  }

  return generic;
}

export async function resetPassword(token: string, newPassword: string, req?: ReqLike) {
  const policy = await getPasswordPolicy();
  const passwordError = validatePassword(newPassword, policy);
  if (passwordError) throw new AppError(400, passwordError);

  const consumed = await consumeAuthToken({ rawToken: token, type: "password_reset" });
  if (!consumed) throw new AppError(400, "Invalid or expired reset token.");

  const existing = await prisma.user.findUnique({
    where: { id: consumed.userId },
    select: { id: true, email: true, authProvider: true },
  });
  if (!existing) throw new AppError(400, "Invalid or expired reset token.");

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const nextProvider =
    existing.authProvider === "google" || existing.authProvider === "both" ? "both" : "local";

  const user = await prisma.user.update({
    where: { id: consumed.userId },
    data: {
      passwordHash,
      loginAttempts: 0,
      lockedUntil: null,
      tokenVersion: { increment: 1 },
      authProvider: nextProvider,
    },
    select: { id: true, email: true },
  });

  await prisma.userSession.updateMany({
    where: { userId: consumed.userId },
    data: { revoked: true },
  });

  await logSecurityEvent({
    action: SECURITY_ACTIONS.PASSWORD_CHANGED,
    userId: user.id,
    email: user.email,
    ...getReqMeta(req),
    meta: { via: "reset" },
  });

  try {
    const { sendPasswordChangedEmail } = await import("./emailService.js");
    await sendPasswordChangedEmail(user.email);
  } catch {
    /* optional */
  }

  return { message: "Password reset successful. You can now log in with your new password." };
}

export async function verifyEmail(rawToken: string, req?: ReqLike) {
  const consumed = await consumeAuthToken({ rawToken, type: "email_verify" });
  if (!consumed) throw new AppError(400, "Invalid or expired verification link.");

  const user = await prisma.user.update({
    where: { id: consumed.userId },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
    select: { id: true, email: true, firstName: true, role: true, avatar: true, tokenVersion: true, emailVerified: true },
  });

  await logSecurityEvent({
    action: SECURITY_ACTIONS.EMAIL_VERIFIED,
    userId: user.id,
    email: user.email,
    ...getReqMeta(req),
  });

  try {
    const { sendWelcomeEmail } = await import("./emailService.js");
    await sendWelcomeEmail(user.email, user.firstName);
  } catch {
    /* optional */
  }

  return { message: "Email verified successfully. You can now sign in.", email: user.email };
}

export async function resendVerification(email: string, req?: ReqLike) {
  const generic = {
    message: "If an unverified account exists for this email, we've sent a verification link.",
  };
  const normalized = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user || user.deletedAt || user.suspended || user.emailVerified) return generic;

  try {
    await sendVerificationForUser(user);
    await logSecurityEvent({
      action: SECURITY_ACTIONS.EMAIL_VERIFICATION_SENT,
      userId: user.id,
      email: user.email,
      ...getReqMeta(req),
    });
  } catch (err) {
    console.error("Resend verification failed:", err instanceof Error ? err.message : "error");
  }
  return generic;
}

export async function requestEmailChange(
  userId: string,
  newEmailRaw: string,
  currentPassword: string,
  req?: ReqLike
) {
  const newEmail = normalizeEmail(newEmailRaw);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.suspended) throw new AppError(401, "Unauthorized");
  if (!user.passwordHash) {
    throw new AppError(400, "Set a password before changing email, or contact support.");
  }
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw new AppError(400, "Current password is incorrect");

  if (newEmail === user.email) throw new AppError(400, "That is already your email address");

  const taken = await prisma.user.findUnique({ where: { email: newEmail } });
  if (taken) throw new AppError(400, "Unable to change to that email address");

  await prisma.user.update({
    where: { id: userId },
    data: { pendingEmail: newEmail },
  });

  const { rawToken } = await issueAuthToken({
    userId,
    type: "email_change",
    payload: { newEmail },
  });

  const { sendEmailChangeConfirmEmail } = await import("./emailService.js");
  await sendEmailChangeConfirmEmail(newEmail, rawToken);

  await logSecurityEvent({
    action: SECURITY_ACTIONS.EMAIL_CHANGE_REQUESTED,
    userId,
    email: user.email,
    ...getReqMeta(req),
  });

  return {
    message: "Check your new email inbox to confirm the change.",
  };
}

export async function confirmEmailChange(rawToken: string, req?: ReqLike) {
  const consumed = await consumeAuthToken({ rawToken, type: "email_change" });
  if (!consumed) throw new AppError(400, "Invalid or expired email change link.");

  const newEmail = normalizeEmail(String(consumed.payload?.newEmail || ""));
  if (!newEmail) throw new AppError(400, "Invalid email change request.");

  const taken = await prisma.user.findUnique({ where: { email: newEmail } });
  if (taken && taken.id !== consumed.userId) {
    throw new AppError(400, "Unable to change to that email address");
  }

  const before = await prisma.user.findUnique({
    where: { id: consumed.userId },
    select: { email: true },
  });
  if (!before) throw new AppError(400, "Invalid email change request.");

  const user = await prisma.user.update({
    where: { id: consumed.userId },
    data: {
      email: newEmail,
      pendingEmail: null,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      tokenVersion: { increment: 1 },
    },
    select: { id: true, email: true },
  });

  await prisma.userSession.updateMany({
    where: { userId: user.id },
    data: { revoked: true },
  });

  await logSecurityEvent({
    action: SECURITY_ACTIONS.EMAIL_CHANGED,
    userId: user.id,
    email: user.email,
    ...getReqMeta(req),
  });

  try {
    const { sendEmailChangedNotice, maskEmail } = await import("./emailService.js");
    await sendEmailChangedNotice(before.email, maskEmail(newEmail));
  } catch {
    /* optional */
  }

  return { message: "Email updated successfully. Please sign in again." };
}

/** Exported for tests / health docs */
export function getAuthFrontendBase(): string {
  return getFrontendUrl();
}
