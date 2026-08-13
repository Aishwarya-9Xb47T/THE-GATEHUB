/**
 * P3.9 paid course access gate — create paid smoke course, prove enroll is blocked without payment.
 * Does NOT bypass payment authorization.
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { prisma } from "../src/utils/prisma.js";
import { syncProductFromCourse } from "../src/services/productCatalogService.js";
import { syncCatalogOnPublish } from "../src/services/productRoutingService.js";
import { buildLearnerExperienceFromPublishedUniverse } from "../src/services/learningExperience/learningExperienceEngine.js";
import { ensurePublishVersionPointer } from "../src/services/learnerScopeService.js";
import { hasCompletedCoursePayment } from "../src/services/enrollmentService.js";

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

  const instructor = await prisma.user.findFirst({
    where: { email: "instructor@lms.dev" },
    select: { id: true, email: true, role: true, tokenVersion: true },
  });
  const student = await prisma.user.findFirst({
    where: { email: "nskomala777@gmail.com" },
    select: { id: true, email: true, role: true, tokenVersion: true },
  });
  if (!instructor || !student) throw new Error("missing users");

  const title = `P3 Smoke PAID ${new Date().toISOString().slice(0, 19)}`;
  const price = 499;

  const course = await prisma.course.create({
    data: {
      title,
      subtitle: "Paid smoke course",
      description: "P3.9 paid access gate test — do not bypass payment.",
      price,
      difficulty: "beginner",
      language: "en",
      status: "draft",
      instructorId: instructor.id,
      sections: {
        create: [
          {
            title: "Module 1",
            order: 0,
            lectures: {
              create: [{ title: "Paid Lesson 1", type: "article", content: "Paid content", order: 0 }],
            },
          },
        ],
      },
    },
  });

  const lu = await prisma.learningUniverse.create({
    data: {
      title,
      subtitle: "Paid LU",
      description: "Paid Learning Universe for P3.9.",
      difficulty: "Beginner",
      price,
      status: "draft",
      instructorId: instructor.id,
      dslSource: "",
      structuredData: {
        productType: "premium-course",
        linkedCourseId: course.id,
        creationSource: "p3-paid-smoke",
        completionRules: {
          certificateEligible: false,
          minimumProgressPercent: 100,
          requireAllRequiredSteps: true,
        },
      },
      tracks: {
        create: [
          {
            title: "Track 1",
            description: "Core",
            order: 0,
            modules: {
              create: [
                {
                  title: "Module 1",
                  description: "Core",
                  order: 0,
                  lessons: {
                    create: [
                      {
                        title: "Paid Lesson 1",
                        order: 0,
                        overviewMarkdown: "Paid lesson",
                        contentBlocks: [
                          { type: "overview", content: { markdown: "Welcome" } },
                          { type: "theory", content: { markdown: "Theory" } },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    include: { tracks: { include: { modules: { include: { lessons: true } } } } },
  });

  await prisma.course.update({
    where: { id: course.id },
    data: {
      aiContent: JSON.stringify({
        academicStudio: { learningUniverseId: lu.id },
        learningUniverseId: lu.id,
      }),
    },
  });

  const learnerExperience = buildLearnerExperienceFromPublishedUniverse(
    {
      id: lu.id,
      title,
      description: lu.description,
      difficulty: lu.difficulty,
      tracks: lu.tracks.map((t) => ({
        id: t.id,
        title: t.title,
        modules: t.modules.map((m) => ({
          id: m.id,
          title: m.title,
          lessons: m.lessons.map((l) => ({
            id: l.id,
            title: l.title,
            contentBlocks: l.contentBlocks as any,
          })),
        })),
      })),
    },
    { certificateEligible: false, minimumProgressPercent: 100, requireAllRequiredSteps: true }
  );

  await prisma.learningUniverse.update({
    where: { id: lu.id },
    data: {
      status: "published",
      publishedAt: new Date(),
      structuredData: {
        productType: "premium-course",
        linkedCourseId: course.id,
        creationSource: "p3-paid-smoke",
        completionRules: {
          certificateEligible: false,
          minimumProgressPercent: 100,
          requireAllRequiredSteps: true,
        },
        learnerExperience,
      },
    },
  });
  await ensurePublishVersionPointer(lu.id);
  await syncCatalogOnPublish(lu.id);
  await prisma.course.update({
    where: { id: course.id },
    data: { status: "published", publishedAt: new Date(), price },
  });
  await syncProductFromCourse(course.id);

  const product = await prisma.product.findUnique({ where: { courseId: course.id } });
  check(
    "Paid product created visible",
    Boolean(product?.published && product?.visible && (product?.price ?? 0) > 0),
    `price=${product?.price} published=${product?.published}`
  );

  const studentToken = mint(student);
  const paidFlag = await hasCompletedCoursePayment(student.id, course.id);
  check("Student has not paid", paidFlag === false, `paid=${paidFlag}`);

  // Direct enroll must be blocked
  const enroll = await api(`/enrollments/${course.id}`, studentToken, { method: "POST" });
  check(
    "Paid course enroll blocked without payment",
    enroll.status === 402,
    `status=${enroll.status} body=${JSON.stringify(enroll.json).slice(0, 200)}`
  );

  // LU enroll also blocked
  const luEnroll = await api(`/learning-universes/${lu.id}/enroll`, studentToken, { method: "POST" });
  check(
    "Paid LU enroll blocked without payment",
    luEnroll.status === 402 || luEnroll.status === 400,
    `status=${luEnroll.status} body=${JSON.stringify(luEnroll.json).slice(0, 200)}`
  );

  // Check endpoint reports unpaid
  const checkEnroll = await api(`/enrollments/${course.id}/check`, studentToken);
  check(
    "Enroll check shows unpaid/not enrolled",
    checkEnroll.status === 200 && checkEnroll.json.enrolled === false && checkEnroll.json.paid === false,
    JSON.stringify(checkEnroll.json)
  );

  // Progress access should fail (not enrolled)
  const progress = await api(`/learning-universes/${course.id}/progress`, studentToken);
  check(
    "Progress denied without enrollment",
    progress.status === 403 || progress.status === 404,
    `status=${progress.status}`
  );

  // Simulate completed payment record then enroll succeeds (still using real payment status path)
  await prisma.payment.create({
    data: {
      userId: student.id,
      courseId: course.id,
      learningUniverseId: lu.id,
      amount: price,
      currency: "INR",
      status: "completed",
      gateway: "p3-smoke-simulated",
      transactionId: `p3-paid-${Date.now()}`,
    },
  });

  const paidAfter = await hasCompletedCoursePayment(student.id, course.id);
  check("Payment record unlocks hasCompletedCoursePayment", paidAfter === true, `paid=${paidAfter}`);

  const enrollAfter = await api(`/enrollments/${course.id}`, studentToken, { method: "POST" });
  check(
    "Enroll succeeds after completed payment",
    enrollAfter.status === 201 || enrollAfter.status === 200,
    `status=${enrollAfter.status}`
  );

  const courseEn = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: student.id, courseId: course.id } },
  });
  const luEn = await prisma.learningUniverseEnrollment.findUnique({
    where: { userId_learningUniverseId: { userId: student.id, learningUniverseId: lu.id } },
  });
  check("Course+LU enrollment after payment", Boolean(courseEn && luEn), `course=${courseEn?.id} lu=${luEn?.id}`);

  const report = {
    generatedAt: new Date().toISOString(),
    courseId: course.id,
    luId: lu.id,
    productId: product?.id,
    price,
    passed: checks.every((c) => c.pass),
    checks,
  };
  writeFileSync(path.join(OUT, "p3-paid-gate.json"), JSON.stringify(report, null, 2));
  console.log("=== P3 PAID GATE ===", { passed: report.passed, courseId: course.id });
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
