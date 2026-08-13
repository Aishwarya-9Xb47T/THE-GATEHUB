import crypto from "crypto";
import { fulfillPayment, markPaymentFailed, markPaymentRefunded } from "./paymentService.js";
import type { ProductType } from "./paymentService.js";

export function verifyWebhookSignature(body: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[RAZORPAY] RAZORPAY_WEBHOOK_SECRET not set — skipping webhook verification");
    return true;
  }
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return expected === signature;
}

export async function handleRazorpayWebhookEvent(event: string, payload: any) {
  if (event === "payment.captured") {
    const payment = payload.payment?.entity;
    if (!payment) return { handled: false };

    const notes = payment.notes || {};
    const userId = notes.userId as string | undefined;
    const productType = (notes.productType as ProductType) || (notes.courseId ? "course" : "learning_universe");
    const courseId = (notes.courseId as string) || null;
    const learningUniverseId = (notes.learningUniverseId as string) || null;

    if (!userId) {
      console.error("[RAZORPAY WEBHOOK] Missing userId in payment notes");
      return { handled: false };
    }

    const amount = typeof payment.amount === "number" ? payment.amount / 100 : 0;

    await fulfillPayment({
      userId,
      productType,
      courseId,
      learningUniverseId,
      amount,
      transactionId: payment.id,
      razorpayOrderId: payment.order_id,
      gateway: "razorpay",
    });

    return { handled: true };
  }

  if (event === "payment.failed") {
    const payment = payload.payment?.entity;
    if (payment?.order_id) {
      await markPaymentFailed(payment.order_id);
    }
    return { handled: true };
  }

  if (event === "refund.processed") {
    const refund = payload.refund?.entity;
    if (refund?.payment_id) {
      await markPaymentRefunded(refund.payment_id);
    }
    return { handled: true };
  }

  return { handled: false };
}
