import nodemailer from "nodemailer";

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }
  return transporter;
}

async function sendMail(to: string, subject: string, html: string) {
  const t = getTransporter();
  if (!t) {
    console.log("[COMMERCE EMAIL] skipped (no SMTP):", subject, to);
    return;
  }
  try {
    await t.sendMail({ from: process.env.EMAIL_USER, to, subject, html });
  } catch (err) {
    console.error("[COMMERCE EMAIL]", err);
  }
}

function wrap(body: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <h1 style="color:#333;">THE GATEHUB</h1>
      ${body}
      <p style="color:#666;font-size:12px;margin-top:30px;">© THE GATEHUB</p>
    </div>`;
}

export async function sendPurchaseSuccessEmail(params: {
  email: string;
  name: string;
  productTitle: string;
  amount: number;
  currency: string;
  orderNumber: string;
}) {
  await sendMail(
    params.email,
    `Purchase confirmed — ${params.productTitle}`,
    wrap(`
      <p>Hi ${params.name},</p>
      <p>Thank you for your purchase of <strong>${params.productTitle}</strong>.</p>
      <p>Order: <strong>${params.orderNumber}</strong><br/>
      Amount: <strong>${params.currency} ${params.amount.toFixed(2)}</strong></p>
      <p><a href="${CLIENT_URL}/student/purchases">View purchase history</a></p>
    `)
  );
}

export async function sendInvoiceEmail(params: {
  email: string;
  name: string;
  invoiceNumber: string;
  invoiceUrl: string;
}) {
  await sendMail(
    params.email,
    `Invoice ${params.invoiceNumber}`,
    wrap(`
      <p>Hi ${params.name},</p>
      <p>Your invoice <strong>${params.invoiceNumber}</strong> is ready.</p>
      <p><a href="${CLIENT_URL}${params.invoiceUrl}">Download invoice</a></p>
    `)
  );
}

export async function sendEnrollmentEmail(params: {
  email: string;
  name: string;
  productTitle: string;
  accessUrl: string;
}) {
  await sendMail(
    params.email,
    `You now have access — ${params.productTitle}`,
    wrap(`
      <p>Hi ${params.name},</p>
      <p>You're enrolled in <strong>${params.productTitle}</strong>.</p>
      <p><a href="${CLIENT_URL}${params.accessUrl}">Start learning</a></p>
    `)
  );
}

export async function sendRefundEmail(params: {
  email: string;
  name: string;
  productTitle: string;
  amount: number;
  status: "requested" | "completed" | "rejected";
}) {
  const subject =
    params.status === "completed"
      ? `Refund completed — ${params.productTitle}`
      : params.status === "rejected"
        ? `Refund request update — ${params.productTitle}`
        : `Refund requested — ${params.productTitle}`;
  await sendMail(
    params.email,
    subject,
    wrap(`
      <p>Hi ${params.name},</p>
      <p>Refund ${params.status} for <strong>${params.productTitle}</strong>
      ${params.status === "completed" ? ` — ${params.amount.toFixed(2)} refunded.` : "."}</p>
    `)
  );
}

export async function sendPaymentFailedEmail(params: {
  email: string;
  name: string;
  productTitle: string;
}) {
  await sendMail(
    params.email,
    `Payment failed — ${params.productTitle}`,
    wrap(`
      <p>Hi ${params.name},</p>
      <p>Your payment for <strong>${params.productTitle}</strong> could not be completed.</p>
      <p><a href="${CLIENT_URL}/student/cart">Try again</a></p>
    `)
  );
}

export async function sendWishlistReminderEmail(params: {
  email: string;
  name: string;
  items: string[];
}) {
  if (!params.items.length) return;
  await sendMail(
    params.email,
    "Items waiting in your wishlist",
    wrap(`
      <p>Hi ${params.name},</p>
      <p>You saved these courses:</p>
      <ul>${params.items.map((i) => `<li>${i}</li>`).join("")}</ul>
      <p><a href="${CLIENT_URL}/student/wishlist">View wishlist</a></p>
    `)
  );
}

export async function sendCouponAppliedEmail(params: {
  email: string;
  name: string;
  couponCode: string;
  discountAmount: number;
}) {
  await sendMail(
    params.email,
    `Coupon ${params.couponCode} applied`,
    wrap(`
      <p>Hi ${params.name},</p>
      <p>Coupon <strong>${params.couponCode}</strong> saved you ₹${params.discountAmount.toFixed(2)}.</p>
    `)
  );
}
