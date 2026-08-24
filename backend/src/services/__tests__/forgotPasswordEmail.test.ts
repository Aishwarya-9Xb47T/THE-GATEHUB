import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

/**
 * Contract tests for password-reset email success/failure semantics.
 * Mocks Prisma + email + tokens — does not send real mail.
 */

process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-secret-for-forgot-password-unit-tests-only-32";

const findUnique = jest.fn();
const logSecurityEvent = jest.fn(async () => undefined);
const issueAuthToken = jest.fn(async () => ({ rawToken: "test-raw-token", id: "tok-1" }));
const sendPasswordResetEmail = jest.fn(async () => undefined);

jest.unstable_mockModule("../../utils/prisma.js", () => ({
  prisma: {
    user: { findUnique },
  },
}));

jest.unstable_mockModule("../securityAuditService.js", () => ({
  logSecurityEvent,
  SECURITY_ACTIONS: { PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED" },
  getReqMeta: () => ({ ip: "127.0.0.1", userAgent: "test" }),
}));

jest.unstable_mockModule("../authTokenService.js", () => ({
  issueAuthToken,
  consumeAuthToken: jest.fn(),
}));

jest.unstable_mockModule("../emailService.js", () => ({
  sendPasswordResetEmail,
}));

const { forgotPassword } = await import("../authService.js");
const { AppError } = await import("../../middlewares/errorHandler.js");
const { getFrontendUrl } = await import("../../utils/frontendUrl.js");

describe("forgotPassword email delivery contract", () => {
  beforeEach(() => {
    findUnique.mockReset();
    logSecurityEvent.mockClear();
    issueAuthToken.mockClear();
    sendPasswordResetEmail.mockReset();
    sendPasswordResetEmail.mockImplementation(async () => undefined);
  });

  it("awaits the existing email service and returns success only after acceptance", async () => {
    findUnique.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      suspended: false,
      deletedAt: null,
      authProvider: "local",
      passwordHash: "hash",
    });

    const result = await forgotPassword("user@example.com");
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith("user@example.com", "test-raw-token");
    expect(result.message).toMatch(/password reset instructions/i);
  });

  it("does not return fake success when the HTTPS email provider fails", async () => {
    findUnique.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      suspended: false,
      deletedAt: null,
      authProvider: "local",
      passwordHash: "hash",
    });
    sendPasswordResetEmail.mockRejectedValue(new Error("EMAIL_PROVIDER_TIMEOUT: Resend request timed out after 15000ms"));

    try {
      await forgotPassword("user@example.com");
      throw new Error("expected AppError");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as InstanceType<typeof AppError>).statusCode).toBe(503);
      expect((err as InstanceType<typeof AppError>).message).toBe(
        "Unable to send the reset email right now. Please try again."
      );
      expect((err as InstanceType<typeof AppError>).details?.reason).toBe("EMAIL_PROVIDER_TIMEOUT");
    }
  });

  it("does not return fake success on provider HTTP failure", async () => {
    findUnique.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      suspended: false,
      deletedAt: null,
      authProvider: "local",
      passwordHash: "hash",
    });
    sendPasswordResetEmail.mockRejectedValue(new Error("EMAIL_SEND_FAILED: provider HTTP 400"));

    try {
      await forgotPassword("user@example.com");
      throw new Error("expected AppError");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as InstanceType<typeof AppError>).statusCode).toBe(503);
      expect((err as InstanceType<typeof AppError>).details?.code).toBe("PASSWORD_RESET_EMAIL_FAILED");
      expect((err as InstanceType<typeof AppError>).details?.reason).toBe("EMAIL_SEND_FAILED");
    }
  });

  it("does not attempt password-reset email for Google-only accounts", async () => {
    findUnique.mockResolvedValue({
      id: "u-google",
      email: "google-only@example.com",
      suspended: false,
      deletedAt: null,
      authProvider: "google",
      passwordHash: null,
    });
    const result = await forgotPassword("google-only@example.com");
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(issueAuthToken).not.toHaveBeenCalled();
    expect(result.message).toMatch(/password reset instructions/i);
  });

  it("keeps anti-enumeration success when no account exists (no email send)", async () => {
    findUnique.mockResolvedValue(null);
    const result = await forgotPassword("missing@example.com");
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(result.message).toMatch(/password reset instructions/i);
  });
});

describe("password reset URL (production frontend)", () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevFrontend = process.env.FRONTEND_URL;
  const prevClient = process.env.CLIENT_URL;

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
    if (prevFrontend === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = prevFrontend;
    if (prevClient === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = prevClient;
  });

  it("builds reset links against the configured production frontend, not localhost", () => {
    process.env.NODE_ENV = "production";
    process.env.FRONTEND_URL = "https://gatehub-frontend.onrender.com";
    delete process.env.CLIENT_URL;
    const frontend = getFrontendUrl();
    expect(frontend).toBe("https://gatehub-frontend.onrender.com");
    expect(frontend).not.toMatch(/localhost|127\.0\.0\.1/);
    const link = `${frontend}/reset-password?token=${encodeURIComponent("opaque-token")}`;
    expect(link.startsWith("https://gatehub-frontend.onrender.com/reset-password?token=")).toBe(true);
  });
});
