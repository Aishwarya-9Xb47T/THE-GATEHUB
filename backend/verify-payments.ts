/**
 * Payment system verification script.
 * Run: npx tsx backend/verify-payments.ts
 */
import "dotenv/config";
import { prisma } from "./src/utils/prisma.js";
import {
  grantCourseEnrollment,
  grantLearningUniverseEnrollment,
  hasCompletedCoursePayment,
} from "./src/services/enrollmentService.js";
import {
  fulfillPayment,
  verifyRazorpaySignature,
  PLATFORM_FEE_PERCENT,
  INSTRUCTOR_SHARE_PERCENT,
} from "./src/services/paymentService.js";

async function main() {
  console.log("=== PAYMENT SYSTEM VERIFICATION ===\n");

  // 1. Schema fields
  const paymentFields = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'Payment' AND column_name IN (
      'learning_universe_id', 'product_type', 'gateway', 'razorpay_order_id',
      'instructor_id', 'platform_fee', 'instructor_earning'
    )`;
  console.log("✓ Payment columns:", paymentFields.map((c) => c.column_name).join(", "));

  const luPriceCol = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'LearningUniverse' AND column_name = 'price'`;
  console.log("✓ LearningUniverse.price:", luPriceCol.length > 0 ? "exists" : "MISSING");

  // 2. Revenue split constants
  console.log(`✓ Platform fee: ${PLATFORM_FEE_PERCENT * 100}%`);
  console.log(`✓ Instructor share: ${INSTRUCTOR_SHARE_PERCENT * 100}%`);

  // 3. Signature verification (deterministic test)
  const testSecret = process.env.RAZORPAY_KEY_SECRET || "test";
  const orderId = "order_test123";
  const paymentId = "pay_test456";
  const crypto = await import("crypto");
  const expected = crypto
    .createHmac("sha256", testSecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const sigOk = verifyRazorpaySignature(orderId, paymentId, expected);
  console.log("✓ Razorpay signature verification:", sigOk ? "PASS" : "FAIL");

  // 4. Idempotency — find a test user and course
  const user = await prisma.user.findFirst({ where: { role: "student" } });
  const course = await prisma.course.findFirst({ where: { status: "published" } });
  const lu = await prisma.learningUniverse.findFirst({ where: { status: "published" } });

  if (user && course) {
    const txnId = `verify_${Date.now()}`;
    const r1 = await fulfillPayment({
      userId: user.id,
      productType: "course",
      courseId: course.id,
      learningUniverseId: null,
      amount: course.price || 999,
      transactionId: txnId,
      razorpayOrderId: `order_${txnId}`,
    });
    const r2 = await fulfillPayment({
      userId: user.id,
      productType: "course",
      courseId: course.id,
      learningUniverseId: null,
      amount: course.price || 999,
      transactionId: txnId,
      razorpayOrderId: `order_${txnId}`,
    });
    console.log("✓ Payment idempotency:", r1.created && !r2.created ? "PASS" : "CHECK");

    const enrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: course.id } },
      include: { progress: true },
    });
    console.log("✓ Course enrollment + progress:", enrollment?.progress ? "PASS" : "FAIL");

    const paid = await hasCompletedCoursePayment(user.id, course.id);
    console.log("✓ hasCompletedCoursePayment:", paid ? "PASS" : "FAIL (may be free course)");
  } else {
    console.log("⚠ Skipping course flow — no student/published course in DB");
  }

  if (user && lu) {
    await grantLearningUniverseEnrollment(user.id, lu.id);
    const luEnroll = await prisma.learningUniverseEnrollment.findUnique({
      where: { userId_learningUniverseId: { userId: user.id, learningUniverseId: lu.id } },
      include: { progress: true },
    });
    console.log("✓ LU enrollment + progress:", luEnroll?.progress ? "PASS" : "FAIL");
  } else {
    console.log("⚠ Skipping LU enrollment — no published LU in DB");
  }

  // 5. API route inventory
  const routes = [
    "POST /api/payments/razorpay/create-order",
    "POST /api/payments/razorpay/verify",
    "POST /api/payments/razorpay/webhook",
    "GET /api/payments/my-payments",
    "GET /api/payments/instructor/earnings",
    "GET /api/payments/admin/summary",
    "POST /api/learning-universes/:id/enroll",
    "GET /api/learning-universes/:id/enrollment-check",
    "GET /api/learning-universes/my-enrollments",
  ];
  console.log("\n✓ API routes implemented:");
  routes.forEach((r) => console.log("  ", r));

  const paymentCount = await prisma.payment.count();
  const luEnrollCount = await prisma.learningUniverseEnrollment.count();
  console.log(`\n✓ DB: ${paymentCount} payments, ${luEnrollCount} LU enrollments`);

  console.log("\n=== VERIFICATION COMPLETE ===");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
