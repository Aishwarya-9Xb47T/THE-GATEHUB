import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import * as authController from "../controllers/authController.js";
import { authenticate } from "../middlewares/auth.js";
import { normalizeEmail } from "../utils/emailNormalize.js";
import { getClientUrlSafe } from "../utils/frontendUrl.js";

export const authRouter = Router();

const authRateLimitDisabled = process.env.AUTH_RATE_LIMIT_DISABLED === "true";
const isProd = process.env.NODE_ENV === "production";

function makeLimiter(opts: { windowMs: number; maxProd: number; maxDev: number; message: string }) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: isProd ? opts.maxProd : opts.maxDev,
    message: { success: false, error: opts.message },
    statusCode: 429,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => authRateLimitDisabled,
    keyGenerator: (req) => {
      const email =
        typeof req.body?.email === "string" ? normalizeEmail(req.body.email) : "";
      const ip = req.ip || req.socket?.remoteAddress || "unknown";
      return email ? `${ip}:${email}` : ip;
    },
  });
}

const loginLimiter = makeLimiter({
  windowMs: 60 * 1000,
  maxProd: 10,
  maxDev: 60,
  message: "Too many login attempts. Please try again in a minute.",
});

const signupLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  maxProd: 5,
  maxDev: 30,
  message: "Too many signup attempts from this IP. Please try again later.",
});

const forgotLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  maxProd: 5,
  maxDev: 20,
  message: "Too many password reset requests. Please try again later.",
});

const resetLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  maxProd: 10,
  maxDev: 30,
  message: "Too many password reset attempts. Please try again later.",
});

const verifyLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  maxProd: 10,
  maxDev: 30,
  message: "Too many verification attempts. Please try again later.",
});

const resendVerifyLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  maxProd: 3,
  maxDev: 10,
  message: "Too many verification emails requested. Please wait before trying again.",
});

const emailChangeLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  maxProd: 5,
  maxDev: 15,
  message: "Too many email change requests. Please try again later.",
});

// ─── Google OAuth Strategy ───────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
const GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_OAUTH_CALLBACK_URL || "http://localhost:5000/api/auth/google/callback";

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
        scope: ["profile", "email"],
      },
      (_accessToken, _refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error("No email from Google profile"));
        if (!profile.id) return done(new Error("No Google subject id on profile"));

        const googleUser = {
          googleId: profile.id,
          email: normalizeEmail(email),
          firstName: profile.name?.givenName || profile.displayName?.split(" ")[0] || "User",
          lastName:
            profile.name?.familyName || profile.displayName?.split(" ").slice(1).join(" ") || "",
          avatar: profile.photos?.[0]?.value,
        };
        return done(null, googleUser);
      }
    )
  );
  console.log("[Auth] Google OAuth strategy registered");
} else {
  console.log(
    "[Auth] Google OAuth not configured (set GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET to enable)"
  );
}

authRouter.get("/registration-options", authController.registrationOptions);
authRouter.post("/register", signupLimiter, authController.register);
authRouter.post("/login", loginLimiter, authController.login);
authRouter.post("/logout", authenticate, authController.logout);
authRouter.get("/me", authenticate, authController.me);
authRouter.post("/forgot-password", forgotLimiter, authController.forgotPassword);
authRouter.post("/reset-password", resetLimiter, authController.resetPassword);
authRouter.post("/verify-email", verifyLimiter, authController.verifyEmail);
authRouter.post("/resend-verification", resendVerifyLimiter, authController.resendVerification);
authRouter.post("/email-change", authenticate, emailChangeLimiter, authController.requestEmailChange);
authRouter.post("/email-change/confirm", verifyLimiter, authController.confirmEmailChange);
authRouter.post("/google/exchange", authController.exchangeGoogleCode);

authRouter.get(
  "/google",
  (req: Request, res: Response, next: NextFunction) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(503).json({
        success: false,
        error: "Google OAuth is not configured on this server.",
      });
    }
    next();
  },
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

import { handleCallback as handleGoogleWorkspaceCallback } from "../controllers/googleWorkspaceController.js";

authRouter.get(
  "/google/callback",
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.query.state && typeof req.query.state === "string") {
      try {
        const decoded = JSON.parse(Buffer.from(req.query.state, "base64").toString("utf-8"));
        if (decoded && decoded.userId) {
          return handleGoogleWorkspaceCallback(req, res);
        }
      } catch {
        /* fall through */
      }
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.redirect(`${getClientUrlSafe()}/auth/google/callback?error=not_configured`);
    }
    next();
  },
  passport.authenticate("google", { session: false, failureRedirect: "/api/auth/google/failure" }),
  authController.googleCallback
);

authRouter.get("/google/failure", (_req: Request, res: Response) => {
  res.redirect(`${getClientUrlSafe()}/auth/google/callback?error=google_auth_failed`);
});
