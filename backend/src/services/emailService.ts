import nodemailer from "nodemailer";
import { getPlatformSettings } from "./platformSettingsService.js";
import { getFrontendUrl } from "../utils/frontendUrl.js";

type MailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

let cachedTransporter: nodemailer.Transporter | null = null;
let cachedKey = "";

function brandShell(opts: {
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  supportEmail?: string | null;
}) {
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<div style="text-align:center;margin:28px 0;">
          <a href="${opts.ctaUrl}" style="background:#0f172a;color:#fff;padding:12px 28px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;">
            ${opts.ctaLabel}
          </a>
        </div>
        <p style="color:#64748b;font-size:13px;line-height:1.5;">If the button doesn’t work, copy this link:<br/>
          <span style="word-break:break-all;color:#334155;">${opts.ctaUrl}</span>
        </p>`
      : "";

  const support = opts.supportEmail
    ? `<p style="margin:8px 0 0;">Need help? Contact <a href="mailto:${opts.supportEmail}">${opts.supportEmail}</a></p>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="text-align:center;padding:16px 0 8px;">
      <div style="font-size:22px;font-weight:700;letter-spacing:0.04em;color:#0f172a;">THE GATEHUB</div>
      <div style="font-size:13px;color:#64748b;margin-top:4px;">${opts.title}</div>
    </div>
    <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e2e8f0;">
      ${opts.bodyHtml}
      ${cta}
    </div>
    <div style="color:#94a3b8;font-size:12px;line-height:1.6;padding:20px 8px;text-align:center;">
      ${opts.footerNote || ""}
      ${support}
      <p style="margin-top:16px;">© ${new Date().getFullYear()} THE GATEHUB. All rights reserved.</p>
    </div>
  </div>
</body></html>`;
}

async function resolveMailConfig() {
  const settings = await getPlatformSettings().catch(() => null);
  const host = process.env.SMTP_HOST || settings?.smtpHost || "";
  const port = Number(process.env.SMTP_PORT || settings?.smtpPort || 587);
  const user = process.env.SMTP_USER || process.env.EMAIL_USER || settings?.smtpUsername || "";
  const pass = process.env.SMTP_PASSWORD || process.env.EMAIL_PASS || settings?.smtpPassword || "";
  const fromEmail =
    process.env.EMAIL_FROM || process.env.EMAIL_USER || user || "noreply@thegatehub.local";
  const fromName = process.env.EMAIL_FROM_NAME || settings?.platformName || "THE GATEHUB";
  const supportEmail = settings?.supportEmail || process.env.SUPPORT_EMAIL || null;

  return { host, port, user, pass, fromEmail, fromName, supportEmail, settings };
}

async function getTransporter() {
  const cfg = await resolveMailConfig();
  if (!cfg.user || !cfg.pass) {
    console.error(
      "[EMAIL] SMTP not configured — missing SMTP_USER/EMAIL_USER or SMTP_PASSWORD/EMAIL_PASS. " +
      "Password reset and verification emails will NOT be sent."
    );
    throw new Error(
      "Email is not configured. Please configure SMTP settings in Admin Settings or set EMAIL_USER/EMAIL_PASS (or SMTP_USER/SMTP_PASSWORD) in environment variables."
    );
  }

  const key = `${cfg.host}|${cfg.port}|${cfg.user}`;
  if (cachedTransporter && cachedKey === key) return { transporter: cachedTransporter, cfg };

  // Safe log — host, port, and masked user. Never logs password.
  const userDomain = cfg.user.includes("@") ? cfg.user.split("@")[1] : "(no-domain)";
  console.log(
    `[EMAIL] EMAIL_PROVIDER_CONNECTION_START host=${cfg.host || "(gmail-service)"} port=${cfg.port} secure=${cfg.port === 465} user=***@${userDomain}`
  );

  const connectionTimeout = Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10_000);
  const greetingTimeout = Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10_000);
  const socketTimeout = Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 20_000);

  // Existing Gmail / SMTP setup: prefer STARTTLS on 587; secure on 465.
  // Timeouts must fail the request — never hang the forgot-password API indefinitely.
  const transporter = cfg.host
    ? nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465,
        requireTLS: cfg.port === 587,
        auth: { user: cfg.user, pass: cfg.pass },
        connectionTimeout,
        greetingTimeout,
        socketTimeout,
        tls: { minVersion: "TLSv1.2" },
      })
    : nodemailer.createTransport({
        service: "gmail",
        auth: { user: cfg.user, pass: cfg.pass },
        connectionTimeout,
        greetingTimeout,
        socketTimeout,
      });

  cachedTransporter = transporter;
  cachedKey = key;
  return { transporter, cfg };
}

function maskRecipient(email: string): string {
  return email.replace(/(^.).*(@.*)$/, "$1***$2");
}

async function withSendTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`EMAIL_SEND timed out after ${ms}ms`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sendMail(payload: MailPayload) {
  const started = Date.now();
  const maskedTo = maskRecipient(payload.to);
  console.log(`[EMAIL] EMAIL_SEND_START to=${maskedTo} subject="${payload.subject}"`);

  try {
    const { transporter, cfg } = await getTransporter();
    const sendTimeoutMs = Number(process.env.SMTP_SEND_TIMEOUT_MS || 20_000);
    const result = (await withSendTimeout(
      transporter.sendMail({
        from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
      sendTimeoutMs
    )) as { messageId?: string; accepted?: string[]; rejected?: string[]; response?: string };

    const durationMs = Date.now() - started;
    console.log(
      `[EMAIL] EMAIL_SEND_SUCCESS durationMs=${durationMs} to=${maskedTo} messageId=${result?.messageId || "(none)"} accepted=${JSON.stringify(result?.accepted ?? [])} rejected=${JSON.stringify(result?.rejected ?? [])}`
    );

    if (result?.rejected?.length) {
      throw new Error(`SMTP rejected recipient(s): ${result.rejected.length}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - started;
    const isTimeout = /timed out|timeout|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(msg);
    console.error(
      `[EMAIL] ${isTimeout ? "EMAIL_SEND_TIMEOUT" : "EMAIL_SEND_FAILED"} durationMs=${durationMs} to=${maskedTo} message=${msg}`
    );
    // Invalidate cached transporter after failures so the next attempt reconnects cleanly.
    cachedTransporter = null;
    cachedKey = "";
    throw err instanceof Error ? err : new Error(msg);
  }
}

/**
 * Startup health-check for email delivery.
 * Prefer HTTPS API (Render Free blocks SMTP 25/465/587). Never logs secrets.
 */
export async function verifySmtpTransporter(): Promise<void> {
  if (process.env.EMAIL_API_KEY?.trim()) {
    if (!process.env.EMAIL_FROM?.trim()) {
      console.error(
        "[EMAIL] EMAIL_PROVIDER_NOT_CONFIGURED — EMAIL_API_KEY is set but EMAIL_FROM is missing"
      );
      return;
    }
    console.log(
      "[EMAIL] EMAIL_PROVIDER_READY — HTTPS email API configured (Resend). SMTP startup verify skipped."
    );
    return;
  }

  try {
    const { transporter } = await getTransporter();
    await transporter.verify();
    console.log("[EMAIL] SMTP READY — transporter verified successfully");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const category =
      msg.includes("not configured") ? "SMTP_NOT_CONFIGURED" :
      msg.includes("ECONNREFUSED") ? "SMTP_CONNECTION_REFUSED" :
      msg.includes("ETIMEDOUT") || msg.includes("timeout") ? "SMTP_TIMEOUT" :
      msg.includes("535") || msg.includes("Authentication") ? "SMTP_AUTH_FAILED" :
      "SMTP_VERIFY_FAILED";
    console.error(
      `[EMAIL] SMTP FAILED at startup — category=${category} message=${msg}. ` +
        "On Render Free, set EMAIL_API_KEY + EMAIL_FROM for password-reset email (HTTPS)."
    );
  }
}

function resolveHttpsMailConfig() {
  const apiKey = process.env.EMAIL_API_KEY?.trim() || "";
  const fromEmail = process.env.EMAIL_FROM?.trim() || "";
  const fromName = process.env.EMAIL_FROM_NAME?.trim() || "THE GATEHUB";

  if (!apiKey) {
    throw new Error(
      "EMAIL_PROVIDER_NOT_CONFIGURED: EMAIL_API_KEY is missing. " +
        "Set EMAIL_API_KEY (Resend) on Render — SMTP ports are blocked on Render Free."
    );
  }
  if (!fromEmail) {
    throw new Error(
      "EMAIL_PROVIDER_NOT_CONFIGURED: EMAIL_FROM is missing. " +
        "Use a Resend-verified sender (e.g. onboarding@resend.dev for tests, or your verified domain)."
    );
  }

  return { apiKey, fromEmail, fromName };
}

/**
 * Deliver password-reset mail via Resend HTTPS API (not SMTP).
 * Render Free blocks outbound SMTP on 25/465/587.
 * Exported for focused unit tests; do not log apiKey / token / Authorization.
 */
export async function sendPasswordResetViaHttpsApi(payload: MailPayload): Promise<{ id?: string }> {
  const { apiKey, fromEmail, fromName } = resolveHttpsMailConfig();
  const started = Date.now();
  const maskedTo = maskRecipient(payload.to);
  const timeoutMs = Number(process.env.EMAIL_API_TIMEOUT_MS || 15_000);
  const from =
    fromEmail.includes("<") ? fromEmail : `${fromName} <${fromEmail}>`;

  console.log(`[EMAIL] EMAIL_SEND_START provider=resend to=${maskedTo} subject="${payload.subject}"`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });

    const durationMs = Date.now() - started;
    const rawBody = await response.text();
    let parsed: { id?: string; message?: string; name?: string } = {};
    try {
      parsed = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      parsed = {};
    }

    if (!response.ok) {
      const safeReason = (parsed.message || parsed.name || `HTTP ${response.status}`).slice(0, 160);
      console.error(
        `[EMAIL] EMAIL_SEND_FAILED provider=resend durationMs=${durationMs} to=${maskedTo} status=${response.status} reason=${safeReason}`
      );
      throw new Error(`EMAIL_SEND_FAILED: provider HTTP ${response.status}`);
    }

    console.log(
      `[EMAIL] EMAIL_SEND_SUCCESS provider=resend durationMs=${durationMs} to=${maskedTo} id=${parsed.id || "(none)"}`
    );
    return { id: parsed.id };
  } catch (err) {
    const durationMs = Date.now() - started;
    if (err instanceof Error && err.name === "AbortError") {
      console.error(
        `[EMAIL] EMAIL_PROVIDER_TIMEOUT provider=resend durationMs=${durationMs} to=${maskedTo}`
      );
      throw new Error(`EMAIL_PROVIDER_TIMEOUT: Resend request timed out after ${timeoutMs}ms`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("EMAIL_SEND_FAILED") || msg.startsWith("EMAIL_PROVIDER_")) {
      throw err instanceof Error ? err : new Error(msg);
    }
    console.error(
      `[EMAIL] EMAIL_SEND_FAILED provider=resend durationMs=${durationMs} to=${maskedTo} message=${msg.slice(0, 200)}`
    );
    throw err instanceof Error ? err : new Error(msg);
  } finally {
    clearTimeout(timer);
  }
}

export async function sendPasswordResetEmail(email: string, rawToken: string) {
  const frontend = getFrontendUrl();
  const resetLink = `${frontend}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const settings = await getPlatformSettings().catch(() => null);
  const supportEmail = settings?.supportEmail || process.env.SUPPORT_EMAIL || null;

  // HTTPS only — do not use SMTP (blocked on Render Free).
  await sendPasswordResetViaHttpsApi({
    to: email,
    subject: "Reset your THE GATEHUB password",
    html: brandShell({
      title: "Password reset",
      supportEmail,
      footerNote:
        "This link expires in 1 hour and can be used only once. If you did not request a reset, you can ignore this email.",
      ctaLabel: "Reset password",
      ctaUrl: resetLink,
      bodyHtml: `<p style="color:#0f172a;line-height:1.6;">We received a request to reset the password for your THE GATEHUB account.</p>
        <p style="color:#334155;line-height:1.6;">For your security, never share this link. THE GATEHUB will never ask for your password by email.</p>`,
    }),
    text: `Reset your password: ${resetLink}\nThis link expires in 1 hour.`,
  });
}

export async function sendVerificationEmail(email: string, rawToken: string, firstName?: string) {
  const frontend = getFrontendUrl();
  const verifyLink = `${frontend}/verify-email?token=${encodeURIComponent(rawToken)}`;
  const { cfg } = await getTransporter();
  const name = firstName ? ` ${firstName}` : "";

  await sendMail({
    to: email,
    subject: "Verify your THE GATEHUB email",
    html: brandShell({
      title: "Verify your email",
      supportEmail: cfg.supportEmail,
      footerNote: "This verification link expires in 24 hours and can be used only once.",
      ctaLabel: "Verify email",
      ctaUrl: verifyLink,
      bodyHtml: `<p style="color:#0f172a;line-height:1.6;">Hi${name},</p>
        <p style="color:#334155;line-height:1.6;">Confirm your email address to finish setting up your THE GATEHUB account.</p>`,
    }),
    text: `Verify your email: ${verifyLink}`,
  });
}

export async function sendWelcomeEmail(email: string, firstName?: string) {
  const frontend = getFrontendUrl();
  const { cfg } = await getTransporter();
  const name = firstName ? ` ${firstName}` : "";

  await sendMail({
    to: email,
    subject: "Welcome to THE GATEHUB",
    html: brandShell({
      title: "Welcome",
      supportEmail: cfg.supportEmail,
      ctaLabel: "Open THE GATEHUB",
      ctaUrl: frontend,
      bodyHtml: `<p style="color:#0f172a;line-height:1.6;">Hi${name},</p>
        <p style="color:#334155;line-height:1.6;">Your account is ready. Learn, teach, and grow on THE GATEHUB.</p>`,
    }),
  }).catch((err) => {
    console.error("[EMAIL] Welcome email failed:", err instanceof Error ? err.message : "error");
  });
}

export async function sendPasswordChangedEmail(email: string) {
  const { cfg } = await getTransporter();
  await sendMail({
    to: email,
    subject: "Your THE GATEHUB password was changed",
    html: brandShell({
      title: "Security notice",
      supportEmail: cfg.supportEmail,
      footerNote: "If you did not make this change, reset your password immediately and contact support.",
      bodyHtml: `<p style="color:#0f172a;line-height:1.6;">Your THE GATEHUB password was changed successfully.</p>
        <p style="color:#334155;line-height:1.6;">All other sessions were signed out for your protection.</p>`,
    }),
  }).catch((err) => {
    console.error("[EMAIL] Password-changed email failed:", err instanceof Error ? err.message : "error");
  });
}

export async function sendEmailChangeConfirmEmail(newEmail: string, rawToken: string) {
  const frontend = getFrontendUrl();
  const link = `${frontend}/verify-email-change?token=${encodeURIComponent(rawToken)}`;
  const { cfg } = await getTransporter();

  await sendMail({
    to: newEmail,
    subject: "Confirm your new THE GATEHUB email",
    html: brandShell({
      title: "Confirm email change",
      supportEmail: cfg.supportEmail,
      footerNote: "This link expires in 24 hours and can be used only once.",
      ctaLabel: "Confirm new email",
      ctaUrl: link,
      bodyHtml: `<p style="color:#0f172a;line-height:1.6;">Confirm this address to finish changing the email on your THE GATEHUB account.</p>`,
    }),
  });
}

export async function sendEmailChangedNotice(oldEmail: string, newEmailMasked: string) {
  const { cfg } = await getTransporter();
  await sendMail({
    to: oldEmail,
    subject: "Your THE GATEHUB email was changed",
    html: brandShell({
      title: "Security notice",
      supportEmail: cfg.supportEmail,
      footerNote: "If you did not request this change, contact support immediately.",
      bodyHtml: `<p style="color:#0f172a;line-height:1.6;">The email on your THE GATEHUB account was changed to <strong>${newEmailMasked}</strong>.</p>`,
    }),
  }).catch((err) => {
    console.error("[EMAIL] Email-changed notice failed:", err instanceof Error ? err.message : "error");
  });
}

export async function sendAccountSecurityAlert(email: string, message: string) {
  const { cfg } = await getTransporter();
  await sendMail({
    to: email,
    subject: "THE GATEHUB security alert",
    html: brandShell({
      title: "Security alert",
      supportEmail: cfg.supportEmail,
      bodyHtml: `<p style="color:#0f172a;line-height:1.6;">${message}</p>`,
    }),
  }).catch(() => {});
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}
