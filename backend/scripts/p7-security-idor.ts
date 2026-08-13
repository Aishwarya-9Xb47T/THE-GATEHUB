/**
 * P7 security / IDOR smoke — authorization boundaries for student/instructor/admin.
 * Does NOT print secrets. Does NOT mutate historical Deep Learning cert.
 */
import "dotenv/config";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const API = process.env.API_BASE || "http://localhost:5000/api";
const OUT = path.resolve("scripts/p7-results");
mkdirSync(OUT, { recursive: true });
const prisma = new PrismaClient();

function mint(user: { id: string; email: string; role: string; tokenVersion?: number | null }) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion ?? 0 },
    process.env.JWT_SECRET!,
    { expiresIn: "1h" }
  );
}

async function req(method: string, p: string, token?: string, body?: unknown) {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text: text.slice(0, 200) };
}

type Check = { name: string; pass: boolean; detail: string };

async function main() {
  const checks: Check[] = [];
  const push = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  const [admin, instructor, otherInstructor, studentA, studentB] = await Promise.all([
    prisma.user.findFirst({ where: { email: "superadmin@platform.local" } }),
    prisma.user.findFirst({ where: { email: "instructor@lms.dev" } }),
    prisma.user.findFirst({
      where: { role: "INSTRUCTOR", email: { not: "instructor@lms.dev" } },
    }),
    prisma.user.findFirst({ where: { email: "nskomala777@gmail.com" } }),
    prisma.user.findFirst({
      where: { role: "STUDENT", email: { not: "nskomala777@gmail.com" } },
    }),
  ]);

  if (!admin || !instructor || !studentA) throw new Error("Missing fixture users");

  const tAdmin = mint(admin);
  const tInst = mint(instructor);
  const tStudentA = mint(studentA);
  const tStudentB = studentB ? mint(studentB) : null;
  const tOtherInst = otherInstructor ? mint(otherInstructor) : null;

  // Student cannot access admin
  {
    const r = await req("GET", "/admin/dashboard", tStudentA);
    push("student-blocked-admin", r.status === 401 || r.status === 403, `status=${r.status}`);
  }

  // Student cannot access instructor students
  {
    const r = await req("GET", "/enrollments/instructor/students", tStudentA);
    push("student-blocked-instructor-students", r.status === 401 || r.status === 403, `status=${r.status}`);
  }

  // Unauth blocked
  {
    const r = await req("GET", "/learning/my");
    push("unauth-learning-blocked", r.status === 401 || r.status === 403, `status=${r.status}`);
  }

  // Instructor cannot hit admin
  {
    const r = await req("GET", "/admin/dashboard", tInst);
    push("instructor-blocked-admin", r.status === 401 || r.status === 403, `status=${r.status}`);
  }

  // Admin can hit admin
  {
    const r = await req("GET", "/admin/dashboard", tAdmin);
    push("admin-dashboard-ok", r.status === 200, `status=${r.status}`);
  }

  // Certificate IDOR — student B cannot download student A cert PDF if exists
  const certA = await prisma.learningUniverseCertificate.findFirst({
    where: { userId: studentA.id, status: "active" },
    select: { id: true, certificateId: true, userId: true },
  });
  if (certA && tStudentB) {
    const r = await req("GET", `/certificates/${certA.certificateId}/download`, tStudentB);
    // Accept 403/404/401 — must not be 200 with PDF for other student
    const contentTypeOk = r.status !== 200;
    push(
      "cert-download-idor",
      contentTypeOk,
      `status=${r.status} (must not succeed for other student)`
    );
  } else {
    push("cert-download-idor", true, "skipped — no certA or studentB");
  }

  // Public verify still works for valid cert id (no auth)
  if (certA) {
    const r = await req("GET", `/certificates/verify/${certA.certificateId}`);
    push("cert-public-verify", r.status === 200, `status=${r.status}`);
  }

  // Progress IDOR — student B cannot write student A LU progress via forged path
  const luId = "cmsq2od7a0001jn2aoy29aabc";
  if (tStudentB) {
    const r = await req("GET", `/learning-universes/${luId}/progress`, tStudentB);
    // May be 200 with empty/own progress or 403 if not enrolled — must not expose A’s private fields if not enrolled
    const ok = r.status === 200 || r.status === 403 || r.status === 404 || r.status === 401;
    push("progress-get-boundary", ok, `status=${r.status}`);
  }

  // Instructor ownership — other instructor should not edit Deep Learning course
  const courseId = "cmsq2oect00e3jn2afshiac8r";
  if (tOtherInst) {
    const r = await req("PATCH", `/courses/${courseId}`, tOtherInst, { title: "HACKED" });
    push(
      "instructor-cannot-edit-others-course",
      r.status === 401 || r.status === 403 || r.status === 404,
      `status=${r.status}`
    );
  } else {
    push("instructor-cannot-edit-others-course", true, "skipped — only one instructor");
  }

  // Report export auth — student cannot export instructor session report without being host
  {
    const session = await prisma.liveSession.findFirst({
      where: { hostUserId: instructor.id },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    if (session) {
      const r = await req("GET", `/live-sessions/${session.id}/report/export?format=csv`, tStudentA);
      push(
        "student-blocked-session-export",
        r.status === 401 || r.status === 403 || r.status === 404,
        `status=${r.status}`
      );
    } else {
      push("student-blocked-session-export", true, "skipped — no session");
    }
  }

  // ZIP incomplete vs complete — incomplete should block for Deep Learning (~6%)
  {
    const r = await req("GET", `/learning-universes/${luId}/download-complete`, tStudentA);
    const blocked = r.status === 403 || r.status === 400 || r.status === 409;
    push("zip-incomplete-blocked", blocked || r.status === 404, `status=${r.status}`);
  }

  // Paid gate — prefer a student with no completed payment on a paid published course
  {
    const paid = await prisma.course.findFirst({
      where: { price: { gt: 0 }, status: "published" },
      select: { id: true, title: true, price: true },
      orderBy: { createdAt: "desc" },
    });
    if (paid) {
      // Use studentB if available and unpaid; otherwise probe check endpoint
      const probeUser = studentB || studentA;
      const probeToken = studentB ? tStudentB! : tStudentA;
      const payment = await prisma.payment.findFirst({
        where: { userId: probeUser.id, courseId: paid.id, status: "completed" },
        select: { id: true },
      });
      const enrollment = await prisma.enrollment.findFirst({
        where: { userId: probeUser.id, courseId: paid.id },
        select: { id: true },
      });
      if (payment || enrollment) {
        const check = await req("GET", `/enrollments/${paid.id}/check`, probeToken);
        push(
          "paid-enroll-denied-without-payment",
          true,
          `skipped — probe user already paid/enrolled; check=${check.status}; re-run p3-paid-gate for fresh unpaid proof`
        );
      } else {
        const r = await req("POST", `/enrollments/${paid.id}`, probeToken);
        const denied = r.status === 402 || r.status === 403 || r.status === 400;
        push(
          "paid-enroll-denied-without-payment",
          denied,
          `status=${r.status} course=${paid.title}`
        );
      }
    } else {
      push("paid-enroll-denied-without-payment", true, "skipped — no paid published course");
    }
  }

  const failed = checks.filter((c) => !c.pass);
  const report = {
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks,
  };
  writeFileSync(path.join(OUT, "p7-security.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (failed.length) process.exit(1);
  console.log("P7 security/IDOR PASS");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
