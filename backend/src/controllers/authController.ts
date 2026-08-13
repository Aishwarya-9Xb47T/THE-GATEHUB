import { Request, Response } from "express";
import { z } from "zod";
import * as authService from "../services/authService.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { isDatabaseConnectionError } from "../utils/waitForDatabase.js";
import { getAllowedRegistrationRoles } from "../utils/roles.js";
import { normalizeEmail } from "../utils/emailNormalize.js";
import { getPasswordPolicy, validatePassword } from "../utils/passwordPolicy.js";
import { getClientUrlSafe } from "../utils/frontendUrl.js";

function buildRegisterSchema(minLength: number) {
  const roles = getAllowedRegistrationRoles();
  return z
    .object({
      email: z.string().trim().email("Invalid email address").max(254, "Email too long"),
      confirmEmail: z.string().trim().email("Invalid confirmation email").max(254).optional(),
      password: z
        .string()
        .min(minLength, `Password must be at least ${minLength} characters`)
        .max(128, "Password must not exceed 128 characters"),
      confirmPassword: z.string().max(128).optional(),
      firstName: z.string().min(1, "First name is required").max(100, "First name too long"),
      lastName: z.string().min(1, "Last name is required").max(100, "Last name too long"),
      role: z.enum(roles as [string, ...string[]]).optional(),
    })
    .superRefine((data, ctx) => {
      if (data.confirmEmail !== undefined) {
        if (normalizeEmail(data.email) !== normalizeEmail(data.confirmEmail)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Email addresses do not match",
            path: ["confirmEmail"],
          });
        }
      }
      if (data.confirmPassword !== undefined) {
        if (data.password !== data.confirmPassword) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Passwords do not match",
            path: ["confirmPassword"],
          });
        }
      }
    });
}

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function registrationOptions(_req: AuthRequest, res: Response) {
  res.json({ success: true, roles: getAllowedRegistrationRoles() });
}

export async function register(req: AuthRequest, res: Response) {
  const policy = await getPasswordPolicy();
  const raw = buildRegisterSchema(policy.minLength).parse(req.body);
  const passwordError = validatePassword(raw.password, policy);
  if (passwordError) throw new AppError(400, passwordError);

  const { confirmEmail: _ce, confirmPassword: _cp, ...rest } = raw;
  const data = { ...rest, email: normalizeEmail(raw.email) };
  const result = await authService.register(data, req);
  res.status(201).json({ success: true, ...result });
}

export async function login(req: AuthRequest, res: Response) {
  try {
    const { email: rawEmail, password } = loginSchema.parse(req.body);
    const email = normalizeEmail(rawEmail);

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const result = await authService.login(email, password, req);
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    // Do not log request body (may contain password)
    if (error instanceof AppError || (error as AppError)?.statusCode) {
      const appErr = error as AppError;
      return res.status(appErr.statusCode).json({ success: false, message: appErr.message });
    }

    if (isDatabaseConnectionError(error)) {
      return res.status(503).json({
        success: false,
        message:
          "Database is offline. Start Docker Desktop, run PostgreSQL (docker compose -f docker-compose.dev.yml up -d postgres), then retry.",
      });
    }

    console.error("LOGIN ERROR:", error instanceof Error ? error.message : "unknown");
    res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
}

export async function logout(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Authentication required");
  const result = await authService.logout(req.user.id, req.user.role, req, req.user.sessionId);
  res.json({ success: true, ...result });
}

export async function me(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Authentication required");
  const user = await authService.getMe(req.user.id);
  res.json({ success: true, user });
}

export async function forgotPassword(req: AuthRequest, res: Response) {
  const { email: rawEmail } = z.object({ email: z.string().trim().email() }).parse(req.body);
  const result = await authService.forgotPassword(normalizeEmail(rawEmail), req);
  res.json({ success: true, ...result });
}

export async function resetPassword(req: AuthRequest, res: Response) {
  const policy = await getPasswordPolicy();
  const body = z
    .object({
      token: z.string().min(1),
      password: z.string().min(1).max(128),
      confirmPassword: z.string().optional(),
    })
    .parse(req.body);

  if (body.confirmPassword !== undefined && body.password !== body.confirmPassword) {
    throw new AppError(400, "Passwords do not match");
  }
  const passwordError = validatePassword(body.password, policy);
  if (passwordError) throw new AppError(400, passwordError);

  const result = await authService.resetPassword(body.token, body.password, req);
  res.json({ success: true, ...result });
}

export async function verifyEmail(req: AuthRequest, res: Response) {
  const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
  const result = await authService.verifyEmail(token, req);
  res.json({ success: true, ...result });
}

export async function resendVerification(req: AuthRequest, res: Response) {
  const { email } = z.object({ email: z.string().trim().email() }).parse(req.body);
  const result = await authService.resendVerification(normalizeEmail(email), req);
  res.json({ success: true, ...result });
}

export async function requestEmailChange(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Authentication required");
  const body = z
    .object({
      newEmail: z.string().trim().email().max(254),
      currentPassword: z.string().min(1),
    })
    .parse(req.body);
  const result = await authService.requestEmailChange(
    req.user.id,
    body.newEmail,
    body.currentPassword,
    req
  );
  res.json({ success: true, ...result });
}

export async function confirmEmailChange(req: AuthRequest, res: Response) {
  const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
  const result = await authService.confirmEmailChange(token, req);
  res.json({ success: true, ...result });
}

export async function exchangeGoogleCode(req: AuthRequest, res: Response) {
  const { code } = z.object({ code: z.string().min(1) }).parse(req.body);
  const result = await authService.exchangeOAuthCode(code);
  res.json({ success: true, ...result });
}

/**
 * Google OAuth callback — redirects with a short-lived one-time code (not a JWT).
 */
export async function googleCallback(req: Request, res: Response) {
  const clientUrl = getClientUrlSafe();
  try {
    const googleUser = (req as any).user as {
      googleId: string;
      email: string;
      firstName: string;
      lastName: string;
      avatar?: string;
    } | undefined;

    if (!googleUser) {
      return res.redirect(`${clientUrl}/auth/google/callback?error=auth_failed`);
    }

    const result = await authService.googleOAuthLogin(
      {
        googleId: googleUser.googleId,
        email: googleUser.email,
        firstName: googleUser.firstName,
        lastName: googleUser.lastName,
        avatar: googleUser.avatar,
      },
      req as any
    );

    const code = await authService.createOAuthExchangeCode(
      result.user.id,
      result.sessionId,
      result.token
    );
    return res.redirect(`${clientUrl}/auth/google/callback?code=${encodeURIComponent(code)}`);
  } catch (err) {
    const message = err instanceof AppError ? err.message : "Authentication failed";
    return res.redirect(`${clientUrl}/auth/google/callback?error=${encodeURIComponent(message)}`);
  }
}
