/**
 * P3.0 — Fresh course smoke test (certificate ON + OFF).
 * Creates brand-new Course ↔ Product ↔ LU via instructor-owned data + real HTTP APIs.
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { prisma } from "../src/utils/prisma.js";
import { syncProductFromCourse } from "../src/services/productCatalogService.js";
import { syncCatalogOnPublish } from "../src/services/productRoutingService.js";
import { grantCourseEnrollment } from "../src/services/enrollmentService.js";
import { buildLearnerExperienceFromPublishedUniverse } from "../src/services/learningExperience/learningExperienceEngine.js";
import { resolveCanonicalUniverseId } from "../src/services/learnerScopeService.js";
import { ensurePublishVersionPointer } from "../src/services/learnerScopeService.js";

const BASE = process.env.API_BASE || "http://localhost:5000/api";
const OUT_DIR = path.resolve("scripts/p3-results");
mkdirSync(OUT_DIR, { recursive: true });

type Check = { name: string; pass: boolean; detail: string };
const report: Record<string, unknown> = { startedAt: new Date().toISOString(), suites: {} };

function mint(user: { id: string; email: string; role: string; tokenVersion?: number | null }) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "2h" }
  );
}

async function api(pathName: string, token?: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${pathName}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function check(checks: Check[], name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name} — ${detail}`);
}

async function createFreshCourse(opts: {
  instructorId: string;
  title: string;
  certificateEligible: boolean;
  price: number;
}) {
  const stamp = Date.now();
  const course = await prisma.course.create({
    data: {
      title: opts.title,
      subtitle: "P3 smoke test course",
      description: "Brand-new course created for P3.0 platform consistency smoke test.",
      price: opts.price,
      difficulty: "beginner",
      language: "en",
      status: "draft",
      instructorId: opts.instructorId,
      sections: {
        create: [
          {
            title: "Module 1",
            order: 0,
            lectures: {
              create: [
                { title: "Lesson 1 — Foundations", type: "article", content: "Intro content", order: 0 },
                { title: "Lesson 2 — Practice", type: "article", content: "Practice content", order: 1 },
              ],
            },
          },
        ],
      },
    },
  });

  const lu = await prisma.learningUniverse.create({
    data: {
      title: opts.title,
      subtitle: "P3 smoke LU",
      description: "Linked Learning Universe for P3.0 smoke test.",
      difficulty: "Beginner",
      price: opts.price,
      status: "draft",
      instructorId: opts.instructorId,
      dslSource: "",
      structuredData: {
        productType: "premium-course",
        linkedCourseId: course.id,
        creationSource: "p3-smoke",
        completionRules: {
          certificateEligible: opts.certificateEligible,
          minimumProgressPercent: 100,
          requireAllRequiredSteps: true,
        },
        aiArchitect: {
          interview: {
            courseInfo: { certificationEligible: opts.certificateEligible },
          },
        },
      },
      tracks: {
        create: [
          {
            title: "Track 1",
            description: "Core track",
            order: 0,
            modules: {
              create: [
                {
                  title: "Module 1",
                  description: "Core module",
                  order: 0,
                  lessons: {
                    create: [
                      {
                        title: "Lesson 1 — Foundations",
                        order: 0,
                        overviewMarkdown: "Learn the foundations.",
                        contentBlocks: [
                          { type: "overview", content: { markdown: "Welcome to lesson 1." } },
                          { type: "theory", content: { markdown: "Core theory for lesson 1." } },
                        ],
                      },
                      {
                        title: "Lesson 2 — Practice",
                        order: 1,
                        overviewMarkdown: "Apply what you learned.",
                        contentBlocks: [
                          { type: "overview", content: { markdown: "Welcome to lesson 2." } },
                          { type: "theory", content: { markdown: "Practice theory for lesson 2." } },
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
    include: {
      tracks: {
        include: {
          modules: { include: { lessons: true } },
        },
      },
    },
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
      title: opts.title,
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
    {
      certificateEligible: opts.certificateEligible,
      minimumProgressPercent: 100,
      requireAllRequiredSteps: true,
    }
  );

  await prisma.learningUniverse.update({
    where: { id: lu.id },
    data: {
      structuredData: {
        productType: "premium-course",
        linkedCourseId: course.id,
        creationSource: "p3-smoke",
        completionRules: {
          certificateEligible: opts.certificateEligible,
          minimumProgressPercent: 100,
          requireAllRequiredSteps: true,
        },
        aiArchitect: {
          interview: {
            courseInfo: { certificationEligible: opts.certificateEligible },
          },
        },
        learnerExperience,
      },
      status: "published",
      publishedAt: new Date(),
    },
  });

  await ensurePublishVersionPointer(lu.id);
  await syncCatalogOnPublish(lu.id);

  await prisma.course.update({
    where: { id: course.id },
    data: { status: "published", publishedAt: new Date() },
  });
  await syncProductFromCourse(course.id);

  const product = await prisma.product.findUnique({
    where: { courseId: course.id },
  });

  return {
    courseId: course.id,
    luId: lu.id,
    productId: product?.id ?? null,
    productPublished: product?.published ?? false,
    productVisible: product?.visible ?? false,
    stamp,
    lessonIds: lu.tracks.flatMap((t) => t.modules.flatMap((m) => m.lessons.map((l) => l.id))),
    learnerExperience,
  };
}

async function completeAllRequiredSteps(
  token: string,
  courseId: string,
  luId: string,
  experience: ReturnType<typeof buildLearnerExperienceFromPublishedUniverse>
) {
  const patches: Array<{ lessonId: string; stepId: string; status: number; percent?: number; error?: string }> = [];
  for (const track of experience.outline.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        const lessonExp = experience.lessons[lesson.id];
        if (!lessonExp) continue;
        for (const step of lessonExp.steps) {
          // Progress with no required steps is visited / navigableSteps (all except next-lesson).
          if (step.kind === "next-lesson") continue;
          const needsComplete = step.progressRule.requiredForCompletion;
          const res = await api(`/learning-universes/${courseId}/step-progress`, token, {
            method: "PATCH",
            body: JSON.stringify({
              lessonId: lesson.id,
              stepId: step.id,
              completed: needsComplete || true,
              visited: true,
              progress: 100,
            }),
          });
          patches.push({
            lessonId: lesson.id,
            stepId: step.id,
            status: res.status,
            percent: res.json.percentComplete ?? res.json.data?.percentComplete,
            error: res.status >= 400 ? JSON.stringify(res.json).slice(0, 200) : undefined,
          });
        }
      }
    }
  }
  const progress = await api(`/learning-universes/${luId}/progress`, token);
  return { patches, progress };
}

async function runSuite(label: string, certificateEligible: boolean, student: any, instructor: any) {
  const checks: Check[] = [];
  console.log(`\n=== P3.0 suite: ${label} (cert=${certificateEligible}) ===`);

  const created = await createFreshCourse({
    instructorId: instructor.id,
    title: `P3 Smoke ${label} ${new Date().toISOString().slice(0, 19)}`,
    certificateEligible,
    price: 0,
  });

  check(
    checks,
    "Course+LU+Product created",
    Boolean(created.courseId && created.luId && created.productId),
    `course=${created.courseId} lu=${created.luId} product=${created.productId}`
  );
  check(
    checks,
    "Product visible/published",
    created.productPublished && created.productVisible,
    `published=${created.productPublished} visible=${created.productVisible}`
  );

  const resolved = await resolveCanonicalUniverseId(created.courseId);
  check(checks, "Canonical LU resolves", resolved === created.luId, `resolved=${resolved}`);

  // Student discover (browse products / published courses)
  const studentToken = mint(student);
  const browse = await api("/commerce/products", studentToken);
  const browseCourses = await api("/courses", studentToken);
  const foundInBrowse =
    JSON.stringify(browse.json).includes(created.courseId) ||
    JSON.stringify(browse.json).includes(created.luId) ||
    JSON.stringify(browseCourses.json).includes(created.courseId) ||
    JSON.stringify(browseCourses.json).includes(created.luId);
  check(
    checks,
    "Student can discover course",
    foundInBrowse,
    `browseStatus=${browse.status}/${browseCourses.status} productVisible=${created.productVisible}`
  );

  // Enroll via Course enrollment (bridges to LU)
  await grantCourseEnrollment(student.id, created.courseId);
  const courseEnroll = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: student.id, courseId: created.courseId } },
  });
  const luEnroll = await prisma.learningUniverseEnrollment.findUnique({
    where: {
      userId_learningUniverseId: { userId: student.id, learningUniverseId: created.luId },
    },
  });
  check(checks, "Course enrollment exists", Boolean(courseEnroll), `id=${courseEnroll?.id}`);
  check(checks, "LU enrollment bridged", Boolean(luEnroll), `id=${luEnroll?.id}`);

  // Idempotent re-enroll
  await grantCourseEnrollment(student.id, created.courseId);
  const enrollCount = await prisma.enrollment.count({
    where: { userId: student.id, courseId: created.courseId },
  });
  const luEnrollCount = await prisma.learningUniverseEnrollment.count({
    where: { userId: student.id, learningUniverseId: created.luId },
  });
  check(checks, "Enrollment idempotent", enrollCount === 1 && luEnrollCount === 1, `course=${enrollCount} lu=${luEnrollCount}`);

  // Complete all required steps
  const completion = await completeAllRequiredSteps(
    studentToken,
    created.courseId,
    created.luId,
    created.learnerExperience
  );
  const percent =
    completion.progress.json.percentComplete ??
    completion.progress.json.data?.percentComplete ??
    0;
  const isCompleted =
    completion.progress.json.isCompleted === true || percent === 100;
  check(checks, "Reached 100%", percent === 100 && isCompleted, `percent=${percent} completed=${isCompleted}`);

  // My Courses
  const myCourses = await api("/enrollments/my", studentToken);
  const card = (myCourses.json.enrollments || []).find(
    (e: { course: { id: string } }) => e.course.id === created.courseId
  );
  const luMine = await api("/learning-universes/my-enrollments", studentToken);
  const luCards = (luMine.json.enrollments || []).filter(
    (e: { learningUniverse: { id: string } }) => e.learningUniverse.id === created.luId
  );
  const dupCards =
    (card ? 1 : 0) +
    (luCards.length > 0 &&
    !(card?.course?.learningUniverseId === created.luId || card?.downloadId === created.luId)
      ? luCards.length
      : 0);
  // Dedup is frontend; API may return both — record both presence
  check(
    checks,
    "My Courses card present",
    Boolean(card),
    `percent=${card?.progress?.percent} completed=${card?.isCompleted} canDownload=${card?.canDownload}`
  );
  check(
    checks,
    "No dual logical duplicate after frontend dedup rule",
    Boolean(card) &&
      (luCards.length === 0 ||
        card?.course?.learningUniverseId === created.luId ||
        card?.downloadId === created.luId),
    `courseCard=${Boolean(card)} luCards=${luCards.length} learningUniverseId=${card?.course?.learningUniverseId}`
  );

  // Instructor students
  const instructorToken = mint(instructor);
  const instructorStudents = await api("/enrollments/instructor/students", instructorToken);
  const group = (instructorStudents.json.courses || []).find(
    (c: { courseId: string }) => c.courseId === created.courseId
  );
  const studentRow = group?.students?.find((s: { id: string }) => s.id === student.id);
  check(
    checks,
    "Instructor sees student completed",
    Boolean(studentRow) && (studentRow.isCompleted === true || studentRow.progress === 100),
    `progress=${studentRow?.progress} completed=${studentRow?.isCompleted} cert=${studentRow?.hasCertificate}`
  );

  // Certificate eligibility
  const elig = await api(`/certificates/eligibility/lu/${created.luId}`, studentToken);
  const eligible = elig.json.eligible === true;
  const unavailable = elig.json.certificateUnavailable === true || elig.json.eligible === false;
  if (certificateEligible) {
    check(
      checks,
      "Certificate eligible",
      eligible || Boolean(elig.json.certificate),
      JSON.stringify({
        eligible: elig.json.eligible,
        unavailable: elig.json.certificateUnavailable,
        pending: elig.json.pendingRequirements?.slice?.(0, 3),
        hasCert: Boolean(elig.json.certificate),
      })
    );

    let certId: string | null = elig.json.certificate?.certificateId ?? null;
    let certDbId: string | null = elig.json.certificate?.id ?? null;
    if (!certId) {
      const claim = await api(`/certificates/lu/${created.luId}/claim`, studentToken, { method: "POST" });
      certId = claim.json.certificate?.certificateId ?? null;
      certDbId = claim.json.certificate?.id ?? null;
      check(checks, "Claim certificate", claim.status < 400 && Boolean(certId), `status=${claim.status} id=${certId}`);
    } else {
      check(checks, "Certificate already present/auto-issued", true, `id=${certId}`);
    }

    if (certDbId) {
      const dl = await fetch(`${BASE}/certificates/lu/${certDbId}/download`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const buf = Buffer.from(await dl.arrayBuffer());
      check(
        checks,
        "Download certificate PDF",
        dl.status === 200 && buf.length > 500 && buf.slice(0, 4).toString() === "%PDF",
        `status=${dl.status} bytes=${buf.length}`
      );
    }

    if (certId) {
      const verify = await api(`/certificates/verify/${certId}`);
      check(
        checks,
        "Verify certificate",
        verify.status === 200 &&
          (/active|verified/i.test(JSON.stringify(verify.json)) || verify.json.valid === true || verify.json.certificate),
        `status=${verify.status}`
      );
    }
  } else {
    check(
      checks,
      "Certificate not available (OFF)",
      !eligible && !elig.json.certificate,
      JSON.stringify({
        eligible: elig.json.eligible,
        certificateUnavailable: elig.json.certificateUnavailable,
        reason: elig.json.reason || elig.json.message,
        pending: elig.json.pendingRequirements?.slice?.(0, 2),
      })
    );
  }

  // ZIP download (completion-gated)
  const zip = await fetch(`${BASE}/learning-universes/${created.luId}/download-complete`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  const zipOk = zip.status === 200;
  check(
    checks,
    "ZIP available after completion",
    zipOk,
    `status=${zip.status} contentType=${zip.headers.get("content-type")}`
  );

  return {
    label,
    certificateEligible,
    created: {
      courseId: created.courseId,
      luId: created.luId,
      productId: created.productId,
    },
    checks,
    passed: checks.every((c) => c.pass),
    myCoursesCard: card
      ? {
          percent: card.progress?.percent,
          isCompleted: card.isCompleted,
          canDownload: card.canDownload,
          continueUrl: card.continueUrl,
          learningUniverseId: card.course?.learningUniverseId ?? card.learningUniverseId,
        }
      : null,
    eligibility: elig.json,
    dupCards,
  };
}

async function main() {
  const instructor =
    (await prisma.user.findFirst({
      where: { email: "instructor@lms.dev" },
      select: { id: true, email: true, role: true, tokenVersion: true },
    })) ||
    (await prisma.user.findFirst({
      where: { role: "instructor" },
      select: { id: true, email: true, role: true, tokenVersion: true },
    }));
  const student =
    (await prisma.user.findFirst({
      where: { email: "nskomala777@gmail.com" },
      select: { id: true, email: true, role: true, tokenVersion: true },
    })) ||
    (await prisma.user.findFirst({
      where: { role: "student" },
      select: { id: true, email: true, role: true, tokenVersion: true },
    }));

  if (!instructor || !student) {
    throw new Error(`Missing users instructor=${Boolean(instructor)} student=${Boolean(student)}`);
  }

  console.log("Using", { instructor: instructor.email, student: student.email });

  const certOn = await runSuite("CERT_ON", true, student, instructor);
  const certOff = await runSuite("CERT_OFF", false, student, instructor);

  report.suites = { certOn, certOff };
  report.finishedAt = new Date().toISOString();
  report.passed = certOn.passed && certOff.passed;

  const out = path.join(OUT_DIR, "p3-0-smoke.json");
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log("\n=== P3.0 SUMMARY ===");
  console.log({ passed: report.passed, out });
  if (!report.passed) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
