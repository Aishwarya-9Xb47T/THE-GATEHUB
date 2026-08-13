import fs from "fs";
import path from "path";
import { prisma } from "../utils/prisma.js";
import { getPlatformSettings } from "./platformSettingsService.js";

function invoiceNumber(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `INV-${y}${m}-${suffix}`;
}

export async function createInvoiceForOrder(params: {
  orderId: string;
  paymentId: string;
  userId: string;
  billingName?: string;
  billingEmail?: string;
}) {
  const existing = await prisma.invoice.findUnique({ where: { orderId: params.orderId } });
  if (existing) return existing;

  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: {
      payment: true,
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (!order || !order.payment) throw new Error("Order or payment not found for invoice");

  const settings = await getPlatformSettings();
  const gstPct = settings.commerceGstPercentage ?? 0;
  const halfGst = order.taxAmount / 2;
  const cgstAmount = gstPct > 0 ? halfGst : 0;
  const sgstAmount = gstPct > 0 ? halfGst : 0;
  const igstAmount = 0;

  const lineItems = [
    {
      title: order.productTitle,
      productType: order.productType,
      quantity: 1,
      unitPrice: order.subtotal,
      discount: order.discountAmount,
      tax: order.taxAmount,
      total: order.totalAmount,
    },
  ];

  const invNum = invoiceNumber();
  const html = buildInvoiceHtml({
    invoiceNumber: invNum,
    platformName: settings.platformName,
    companyName: settings.companyName || settings.platformName,
    companyAddress: settings.companyAddress || undefined,
    companyGstin: settings.companyGstin || undefined,
    orderNumber: order.orderNumber,
    issuedAt: new Date(),
    billingName:
      params.billingName ||
      `${order.user.firstName} ${order.user.lastName}`.trim(),
    billingEmail: params.billingEmail || order.user.email,
    lineItems,
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    taxAmount: order.taxAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    hsnSac: "999293",
    totalAmount: order.totalAmount,
    currency: order.currency,
    transactionId: order.payment.transactionId,
    couponCode: order.couponCode,
  });

  const uploadDir = path.join(process.cwd(), process.env.UPLOAD_DIR || "uploads", "invoices");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const fileName = `${invNum}.html`;
  const filePath = path.join(uploadDir, fileName);
  fs.writeFileSync(filePath, html, "utf8");
  const publicPath = `/uploads/invoices/${fileName}`;

  return prisma.invoice.create({
    data: {
      invoiceNumber: invNum,
      orderId: order.id,
      userId: params.userId,
      paymentId: params.paymentId,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      taxAmount: order.taxAmount,
      totalAmount: order.totalAmount,
      currency: order.currency,
      billingName: params.billingName || `${order.user.firstName} ${order.user.lastName}`.trim(),
      billingEmail: params.billingEmail || order.user.email,
      gstin: settings.companyGstin ?? null,
      cgstAmount,
      sgstAmount,
      igstAmount,
      hsnSac: "999293",
      lineItems,
      pdfPath: publicPath,
    },
  });
}

function buildInvoiceHtml(data: {
  invoiceNumber: string;
  platformName: string;
  companyName: string;
  companyAddress?: string;
  companyGstin?: string;
  orderNumber: string;
  issuedAt: Date;
  billingName: string;
  billingEmail: string;
  lineItems: Array<{ title: string; unitPrice: number; discount: number; tax: number; total: number }>;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  hsnSac?: string;
  totalAmount: number;
  currency: string;
  transactionId: string | null;
  couponCode: string | null;
}) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: data.currency }).format(n);

  const rows = data.lineItems
    .map(
      (item) =>
        `<tr><td>${item.title}</td><td>${fmt(item.unitPrice)}</td><td>${fmt(item.discount)}</td><td>${fmt(item.tax)}</td><td>${fmt(item.total)}</td></tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Invoice ${data.invoiceNumber}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;color:#111}
h1{font-size:1.5rem} table{width:100%;border-collapse:collapse;margin:24px 0}
th,td{border:1px solid #ddd;padding:8px;text-align:left} th{background:#f5f5f5}
.totals{margin-top:16px;text-align:right}.muted{color:#666;font-size:14px}
</style></head><body>
<h1>${data.platformName}</h1>
<p class="muted">${data.companyName}${data.companyGstin ? `<br>GSTIN: ${data.companyGstin}` : ""}${data.companyAddress ? `<br>${data.companyAddress}` : ""}</p>
<h2>Tax Invoice</h2>
<p><strong>Invoice:</strong> ${data.invoiceNumber}<br>
<strong>HSN/SAC:</strong> ${data.hsnSac || "999293"}<br>
<strong>Order:</strong> ${data.orderNumber}<br>
<strong>Date:</strong> ${data.issuedAt.toLocaleDateString("en-IN")}<br>
<strong>Payment ID:</strong> ${data.transactionId || "—"}</p>
<p><strong>Bill To</strong><br>${data.billingName}<br>${data.billingEmail}</p>
<table><thead><tr><th>Item</th><th>Price</th><th>Discount</th><th>Tax</th><th>Total</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="totals">
<p>Subtotal: ${fmt(data.subtotal)}</p>
${data.couponCode ? `<p>Coupon (${data.couponCode}): -${fmt(data.discountAmount)}</p>` : ""}
${data.cgstAmount ? `<p>CGST: ${fmt(data.cgstAmount)}</p>` : ""}
${data.sgstAmount ? `<p>SGST: ${fmt(data.sgstAmount)}</p>` : ""}
${data.igstAmount ? `<p>IGST: ${fmt(data.igstAmount)}</p>` : ""}
<p>Tax: ${fmt(data.taxAmount)}</p>
<p><strong>Total Paid: ${fmt(data.totalAmount)}</strong></p>
</div>
<p class="muted">Thank you for learning with ${data.platformName}.</p>
</body></html>`;
}
