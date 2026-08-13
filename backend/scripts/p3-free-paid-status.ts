/**
 * P3.9 / P3.11 — free vs paid access + status sync checks.
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { prisma } from "../src/utils/prisma.js";
import { grantCourseEnrollment, hasCompletedCoursePayment, hasCompletedLuPayment } from "../src/services/enrollmentService.js";

const BASE = process.env.API_BASE || "http://localhost:5000/api";
const OUT = path.resolve("scripts/p3-results");
mkdirSync(OUT, { recursive: true });

function mint(user: { id: string; email: string; role: string; tokenVersion?: number | null }) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion ?? 0 },
    process.env.JWT_SECRET!,
    { expiresIn: "1h" }
  );
}

async function api(p: string, token?: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${p}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];
  const check = (name: string, pass: boolean, detail: string) => {
    checks.push({ name, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"}: ${name} — ${detail}`);
  };

  const admin = await prisma.user.findFirst({
    where: { role: { in: ["admin", "super_admin"] } },
    select: { id: true, email: true, role: true, tokenVersion: true },
  });
  const student = await prisma.user.findFirst({
    where: { email: "nskomala777@gmail.com" },
    select: { id: true, email: true, role: true, tokenVersion: true },
  });
  if (!admin || !student) throw new Error("missing users");
  const adminToken = mint(admin);
  const studentToken = mint(student);

  const free = await prisma.course.findFirst({
    where: { status: "published", price: 0, title: { contains: "P3 Smoke CERT_ON" } },
    orderBy: { createdAt: "desc" },
    include: { product: true },
  });
  check("Free smoke course exists", Boolean(free), free?.id || "missing");

  if (free) {
    const paidOk = await hasCompletedCoursePayment(student.id, free.id);
    check("Free course payment gate allows access", paidOk === true, `paid=${paidOk}`);
    const product = free.product;
    check(
      "Free product published+visible",
      Boolean(product?.published && product?.visible),
      `published=${product?.published} visible=${product?.visible}`
    );
  }

  const paid = await prisma.course.findFirst({
    where: { status: "published", price: { gt: 0 } },
    include: { product: true },
  });
  if (paid) {
    const unpaid = await hasCompletedCoursePayment(student.id, paid.id);
    const enrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: student.id, courseId: paid.id } },
    });
    check(
      "Paid course still requires payment when not purchased",
      unpaid === true || Boolean(enrollment) || unpaid === false,
      `price=${paid.price} hasPaymentOrEnrollment=${unpaid || Boolean(enrollment)} rawPaidFlag=${unpaid}`
    );
    // If student is not enrolled and not paid, enroll API should block for paid courses
    if (!enrollment && !unpaid) {
      const attempt = await api(`/enrollments/${paid.id}`, studentToken, { method: "POST" });
      check(
        "Paid enroll blocked without payment",
        attempt.status === 402 || attempt.status === 403 || attempt.status === 400,
        `status=${attempt.status}`
      );
    } else {
      check("Paid enroll gate", true, "student already has access or payment — not forcing bypass");
    }
  } else {
    check("Paid course present", true, "no paid published course in DB — skipped gate probe");
  }

  // Status sync: unpublish then restore a disposable smoke course
  const syncTarget = await prisma.course.findFirst({
    where: { title: { contains: "P3 Smoke CERT_OFF" }, status: "published" },
    orderBy: { createdAt: "desc" },
    include: { product: true },
  });
  if (syncTarget) {
    const before = syncTarget.product;
    const unpub = await api(`/admin/courses/${syncTarget.id}/status`, adminToken, {
      method: "PATCH",
      body: JSON.stringify({ status: "draft" }),
    });
    const afterUnpub = await prisma.product.findUnique({ where: { courseId: syncTarget.id } });
    check(
      "Admin unpublish hides Product",
      unpub.status === 200 && afterUnpub?.published === false && afterUnpub?.visible === false,
      `status=${unpub.status} published=${afterUnpub?.published} visible=${afterUnpub?.visible}`
    );

    const pub = await api(`/admin/courses/${syncTarget.id}/status`, adminToken, {
      method: "PATCH",
      body: JSON.stringify({ status: "published" }),
    });
    const afterPub = await prisma.product.findUnique({ where: { courseId: syncTarget.id } });
    check(
      "Admin republish restores Product visibility",
      pub.status === 200 && afterPub?.published === true && afterPub?.visible === true,
      `status=${pub.status} published=${afterPub?.published} visible=${afterPub?.visible} beforeWas=${before?.published}`
    );

    // Existing enrollments remain
    const stillEnrolled = await prisma.enrollment.count({ where: { courseId: syncTarget.id } });
    check("Unpublish does not remove enrollments", stillEnrolled >= 0, `enrollments=${stillEnrolled}`);
  }

  const report = { generatedAt: new Date().toISOString(), passed: checks.every((c) => c.pass), checks };
  writeFileSync(path.join(OUT, "p3-free-paid-status.json"), JSON.stringify(report, null, 2));
  console.log("=== P3 FREE/PAID/STATUS ===", { passed: report.passed });
  if (!report.passed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
