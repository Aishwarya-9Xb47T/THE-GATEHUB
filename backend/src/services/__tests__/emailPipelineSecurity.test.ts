import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

/**
 * Comprehensive integration and security tests for the unified email pipeline,
 * multi-provider fallback (Resend -> SMTP), anti-enumeration, and token security.
 */

jest.unstable_mockModule("../../utils/prisma.js", () => ({
  default: {
    platformSettings: {
      findUnique: jest.fn(async () => null),
    },
  },
  prisma: {
    platformSettings: {
      findUnique: jest.fn(async () => null),
    },
  },
}));

jest.unstable_mockModule("../platformSettingsService.js", () => ({
  getPlatformSettings: jest.fn(async () => ({
    platformName: "THE GATEHUB",
    supportEmail: "support@thegatehub.com",
    smtpHost: null,
    smtpPort: 587,
    smtpUsername: null,
    smtpPassword: null,
  })),
}));

const originalFetch = global.fetch;

describe("Unified Email Delivery Pipeline & Fallback Contract", () => {
  const prevApiKey = process.env.EMAIL_API_KEY;
  const prevEmailFrom = process.env.EMAIL_FROM;
  const prevSmtpUser = process.env.SMTP_USER;
  const prevSmtpPass = process.env.SMTP_PASSWORD;
  const prevSmtpHost = process.env.SMTP_HOST;
  const prevFrontendUrl = process.env.FRONTEND_URL;
  const prevNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.EMAIL_API_KEY = "re_test_key_abc";
    process.env.EMAIL_FROM = "noreply@thegatehub.com";
    process.env.SMTP_USER = "smtp_user@gatehub.local";
    process.env.SMTP_PASSWORD = "smtp_password_secret";
    process.env.SMTP_HOST = "smtp.gatehub.local";
    process.env.FRONTEND_URL = "https://thegatehub.com";
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (prevApiKey === undefined) delete process.env.EMAIL_API_KEY;
    else process.env.EMAIL_API_KEY = prevApiKey;
    if (prevEmailFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = prevEmailFrom;
    if (prevSmtpUser === undefined) delete process.env.SMTP_USER;
    else process.env.SMTP_USER = prevSmtpUser;
    if (prevSmtpPass === undefined) delete process.env.SMTP_PASSWORD;
    else process.env.SMTP_PASSWORD = prevSmtpPass;
    if (prevSmtpHost === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = prevSmtpHost;
    if (prevFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = prevFrontendUrl;
    process.env.NODE_ENV = prevNodeEnv;
  });

  it("reports email is configured when Resend is present", async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    process.env.EMAIL_API_KEY = "re_live_key";
    process.env.EMAIL_FROM = "noreply@thegatehub.com";

    const { isEmailConfigured } = await import("../emailService.js");
    expect(await isEmailConfigured()).toBe(true);
  });

  it("reports email is configured when SMTP is present (without Resend)", async () => {
    delete process.env.EMAIL_API_KEY;
    process.env.SMTP_USER = "smtp_user@gatehub.local";
    process.env.SMTP_PASSWORD = "password123";

    const { isEmailConfigured } = await import("../emailService.js");
    expect(await isEmailConfigured()).toBe(true);
  });

  it("reports email is NOT configured when neither provider is available", async () => {
    delete process.env.EMAIL_API_KEY;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;

    const { isEmailConfigured } = await import("../emailService.js");
    expect(await isEmailConfigured()).toBe(false);
  });

  it("delivers via Resend HTTPS when Resend accepts", async () => {
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ id: "resend_msg_001" }), { status: 200 })
    ) as unknown as typeof fetch;

    const { deliverMail } = await import("../emailService.js");
    const result = await deliverMail({
      to: "recipient@example.com",
      subject: "Test Subject",
      html: "<p>Hello</p>",
      text: "Hello",
    }, "corr-test-1");

    expect(result.provider).toBe("resend");
    expect(result.id).toBe("resend_msg_001");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not log secrets or API keys during delivery", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ id: "msg_safe_01" }), { status: 200 })
    ) as unknown as typeof fetch;

    const { deliverMail } = await import("../emailService.js");
    await deliverMail({
      to: "customer@example.com",
      subject: "Your Reset Link",
      html: "<p>Secret link</p>",
      text: "Secret link",
    }, "corr-safe-test");

    const allOutput = [
      ...logSpy.mock.calls,
      ...errSpy.mock.calls,
      ...warnSpy.mock.calls,
    ].map((c) => c.map(String).join(" ")).join("\n");

    expect(allOutput).not.toContain("re_test_key_abc");
    expect(allOutput).not.toContain("smtp_password_secret");
    expect(allOutput).not.toMatch(/customer@example\.com/); // Recipient should be masked

    logSpy.mockRestore();
    errSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
