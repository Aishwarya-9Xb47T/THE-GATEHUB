import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

/**
 * HTTPS (Resend) transport tests for password-reset email only.
 * Does not call the real Resend API.
 */

const originalFetch = global.fetch;

describe("sendPasswordResetViaHttpsApi (Resend HTTPS)", () => {
  const prevKey = process.env.EMAIL_API_KEY;
  const prevFrom = process.env.EMAIL_FROM;
  const prevName = process.env.EMAIL_FROM_NAME;
  const prevTimeout = process.env.EMAIL_API_TIMEOUT_MS;

  beforeEach(() => {
    process.env.EMAIL_API_KEY = "re_test_key_not_real";
    process.env.EMAIL_FROM = "onboarding@resend.dev";
    process.env.EMAIL_FROM_NAME = "THE GATEHUB";
    delete process.env.EMAIL_API_TIMEOUT_MS;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (prevKey === undefined) delete process.env.EMAIL_API_KEY;
    else process.env.EMAIL_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = prevFrom;
    if (prevName === undefined) delete process.env.EMAIL_FROM_NAME;
    else process.env.EMAIL_FROM_NAME = prevName;
    if (prevTimeout === undefined) delete process.env.EMAIL_API_TIMEOUT_MS;
    else process.env.EMAIL_API_TIMEOUT_MS = prevTimeout;
  });

  async function loadSender() {
    return import("../emailService.js");
  }

  it("treats provider HTTP 2xx as acceptance", async () => {
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ id: "msg_123" }), { status: 200 })
    ) as unknown as typeof fetch;

    const { sendPasswordResetViaHttpsApi } = await loadSender();
    const result = await sendPasswordResetViaHttpsApi({
      to: "user@example.com",
      subject: "Reset your THE GATEHUB password",
      html: "<p>reset</p>",
      text: "reset",
    });
    expect(result.id).toBe("msg_123");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(String(init.headers && (init.headers as Record<string, string>).Authorization)).toMatch(/^Bearer /);
    // Body must not be logged by us; assert request body has no API key field.
    expect(String(init.body)).not.toContain("re_test_key_not_real");
  });

  it("fails on provider HTTP 400", async () => {
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ message: "Invalid from address" }), { status: 400 })
    ) as unknown as typeof fetch;
    const { sendPasswordResetViaHttpsApi } = await loadSender();
    await expect(
      sendPasswordResetViaHttpsApi({
        to: "user@example.com",
        subject: "Reset",
        html: "<p>x</p>",
      })
    ).rejects.toThrow(/EMAIL_SEND_FAILED.*400/);
  });

  it("fails on provider HTTP 500", async () => {
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ message: "Internal" }), { status: 500 })
    ) as unknown as typeof fetch;
    const { sendPasswordResetViaHttpsApi } = await loadSender();
    await expect(
      sendPasswordResetViaHttpsApi({
        to: "user@example.com",
        subject: "Reset",
        html: "<p>x</p>",
      })
    ).rejects.toThrow(/EMAIL_SEND_FAILED.*500/);
  });

  it("fails on provider timeout", async () => {
    process.env.EMAIL_API_TIMEOUT_MS = "30";
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      return await new Promise((_resolve, reject) => {
        const err = new Error("aborted");
        err.name = "AbortError";
        init?.signal?.addEventListener("abort", () => reject(err));
      });
    }) as unknown as typeof fetch;

    const { sendPasswordResetViaHttpsApi } = await loadSender();
    await expect(
      sendPasswordResetViaHttpsApi({
        to: "user@example.com",
        subject: "Reset",
        html: "<p>x</p>",
      })
    ).rejects.toThrow(/EMAIL_PROVIDER_TIMEOUT/);
  });

  it("fails when EMAIL_API_KEY is missing", async () => {
    delete process.env.EMAIL_API_KEY;
    const { sendPasswordResetViaHttpsApi } = await loadSender();
    await expect(
      sendPasswordResetViaHttpsApi({
        to: "user@example.com",
        subject: "Reset",
        html: "<p>x</p>",
      })
    ).rejects.toThrow(/EMAIL_PROVIDER_NOT_CONFIGURED/);
  });
});

describe("sendPasswordResetEmail preserves production reset URL", () => {
  const prevKey = process.env.EMAIL_API_KEY;
  const prevFrom = process.env.EMAIL_FROM;
  const prevFrontend = process.env.FRONTEND_URL;
  const prevNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.EMAIL_API_KEY = "re_test_key_not_real";
    process.env.EMAIL_FROM = "onboarding@resend.dev";
    process.env.NODE_ENV = "production";
    process.env.FRONTEND_URL = "https://gatehub-frontend.onrender.com";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (prevKey === undefined) delete process.env.EMAIL_API_KEY;
    else process.env.EMAIL_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = prevFrom;
    if (prevFrontend === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = prevFrontend;
    process.env.NODE_ENV = prevNodeEnv;
  });

  it("embeds the production frontend reset URL and does not log the token or API key", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    let capturedBody = "";

    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      capturedBody = String(init?.body || "");
      return new Response(JSON.stringify({ id: "msg_abc" }), { status: 200 });
    }) as unknown as typeof fetch;

    const { sendPasswordResetEmail } = await import("../emailService.js");
    const token = "super-secret-reset-token-value";
    await sendPasswordResetEmail("user@example.com", token);

    expect(capturedBody).toContain(
      "https://gatehub-frontend.onrender.com/reset-password?token=" + encodeURIComponent(token)
    );
    expect(capturedBody).not.toContain("localhost");

    const allLogs = [...logSpy.mock.calls, ...errSpy.mock.calls].map((c) => c.map(String).join(" ")).join("\n");
    expect(allLogs).not.toContain(token);
    expect(allLogs).not.toContain("re_test_key_not_real");
    expect(allLogs).not.toMatch(/Bearer\s+re_/);

    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});
