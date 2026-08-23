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
    `[EMAIL] Creating SMTP transporter: host=${cfg.host || "(gmail-service)"} port=${cfg.port} secure=${cfg.port === 465} user=***@${userDomain}`
  );

  const transporter = cfg.host
    ? nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465,
        auth: { user: cfg.user, pass: cfg.pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      })
    : nodemailer.createTransport({
        service: "gmail",
        auth: { user: cfg.user, pass: cfg.pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });

  cachedTransporter = transporter;
  cachedKey = key;
  return { transporter, cfg };
}

async function sendMail(payload: MailPayload) {
  const { transporter, cfg } = await getTransporter();
  const result = await transporter.sendMail({
    from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  }) as { messageId?: string; accepted?: string[]; rejected?: string[]; response?: string };

  const maskedTo = payload.to.replace(/(^.).*(@.*)$/, "$1***$2");
  console.log(
    `[EMAIL] Sent: "${payload.subject}" → ${maskedTo} | messageId=${result?.messageId || "(none)"} accepted=${JSON.stringify(result?.accepted ?? [])} rejected=${JSON.stringify(result?.rejected ?? [])}`
  );

  if (result?.rejected?.length) {
    console.error(`[EMAIL] SMTP rejected recipient(s): ${JSON.stringify(result.rejected)}`);
  }
}

/**
 * Startup health-check for SMTP. Logs [EMAIL] SMTP READY or [EMAIL] SMTP FAILED.
 * Safe to call at boot — never exposes credentials.
 */
export async function verifySmtpTransporter(): Promise<void> {
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
    console.error(`[EMAIL] SMTP FAILED at startup — category=${category} message=${msg}`);
  }
}

export async function sendPasswordResetEmail(email: string, rawToken: string) {
  const frontend = getFrontendUrl();
  const resetLink = `${frontend}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const { cfg } = await getTransporter();

  await sendMail({
    to: email,
    subject: "Reset your THE GATEHUB password",
    html: brandShell({
      title: "Password reset",
      supportEmail: cfg.supportEmail,
      footerNote: "This link expires in 1 hour and can be used only once. If you did not request a reset, you can ignore this email.",
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
