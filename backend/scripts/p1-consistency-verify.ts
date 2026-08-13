/**
 * P1 consistency verification — dashboard, progress, continue URL, cert idempotency.
 */
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/utils/prisma.js";
import { resolveCanonicalUniverseId } from "../src/services/learnerScopeService.js";

const BASE = process.env.API_BASE || "http://localhost:5000/api";
const courseId = "cmsq2oect00e3jn2afshiac8r"; // Deep Learning

function mint(user: { id: string; email: string; role: string; tokenVersion: number }) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion },
    process.env.JWT_SECRET!,
    { expiresIn: "1h" }
  );
}

async function api(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const luId = (await resolveCanonicalUniverseId(courseId))!;
  const enrollment = await prisma.learningUniverseEnrollment.findFirst({
    where: { learningUniverseId: luId },
    include: {
      user: { select: { id: true, email: true, role: true, tokenVersion: true } },
      progress: true,
    },
  });
  if (!enrollment) throw new Error("No enrollment");
  const token = mint(enrollment.user);

  const player = await api(`/learning-universes/${courseId}/progress`, token);
  const dashboard = await api(`/learning/my`, token);
  const myCourses = await api(`/enrollments/my`, token);

  const dashItem = (dashboard.json.items || []).find(
    (i: { id: string; type: string }) => i.id === courseId || i.id === luId
  );
  const courseCard = (myCourses.json.enrollments || []).find(
    (e: { course: { id: string } }) => e.course.id === courseId
  );

  console.log("=== P1 PROGRESS CONSISTENCY ===");
  console.log({
    playerPercent: player.json.percentComplete,
    playerLuId: player.json.learningUniverseId,
    dashboardPercent: dashItem?.progressPercent,
    dashboardContinue: dashItem?.continueUrl,
    dashboardCompleted: dashItem?.isCompleted,
    myCoursesPercent: courseCard?.progress?.percent,
    myCoursesContinue: courseCard?.continueUrl,
    myCoursesCompleted: courseCard?.isCompleted,
    myCoursesCanDownload: courseCard?.canDownload,
  });

  if (dashItem?.progressPercent !== player.json.percentComplete) {
    throw new Error(
      `Dashboard/player mismatch: ${dashItem?.progressPercent} vs ${player.json.percentComplete}`
    );
  }
  if (courseCard?.progress?.percent !== player.json.percentComplete) {
    throw new Error(
      `MyCourses/player mismatch: ${courseCard?.progress?.percent} vs ${player.json.percentComplete}`
    );
  }
  if (!dashItem?.continueUrl?.includes("/learn")) {
    throw new Error(`Bad continue URL: ${dashItem?.continueUrl}`);
  }

  // Certificate claim idempotency (if already has cert, or if eligible)
  const elig = await api(`/certificates/eligibility/lu/${luId}`, token);
  console.log("eligibility", {
    eligible: elig.json.eligible,
    certificateUnavailable: elig.json.certificateUnavailable,
    hasCert: Boolean(elig.json.certificate),
    pending: elig.json.pendingRequirements?.slice(0, 2),
  });

  if (elig.json.certificate || elig.json.eligible) {
    const c1 = await api(`/certificates/lu/${luId}/claim`, token, { method: "POST" });
    const c2 = await api(`/certificates/lu/${luId}/claim`, token, { method: "POST" });
    console.log("claim idempotency", {
      c1: c1.status,
      id1: c1.json.certificate?.certificateId,
      c2: c2.status,
      id2: c2.json.certificate?.certificateId,
      reused: c2.json.reused,
    });
    if (c1.json.certificate?.certificateId !== c2.json.certificate?.certificateId) {
      throw new Error("Duplicate certificate IDs on double claim");
    }
    const count = await prisma.learningUniverseCertificate.count({
      where: { userId: enrollment.userId, learningUniverseId: luId, status: "active" },
    });
    if (count !== 1) throw new Error(`Expected 1 active cert, got ${count}`);
  }

  // Instructor students (find instructor of course)
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { instructorId: true, instructor: { select: { id: true, email: true, role: true, tokenVersion: true } } },
  });
  if (course?.instructor) {
    const iToken = mint(course.instructor);
    const students = await api(`/enrollments/instructor/students`, iToken);
    const group = (students.json.courses || []).find((c: { courseId: string }) => c.courseId === courseId);
    const studentRow = group?.students?.find((s: { id: string }) => s.id === enrollment.userId);
    console.log("instructor student row", studentRow);
    if (studentRow && studentRow.progress !== player.json.percentComplete) {
      throw new Error(
        `Instructor/player mismatch: ${studentRow.progress} vs ${player.json.percentComplete}`
      );
    }
  }

  // Negative: incomplete claim should fail if not eligible and no cert
  if (!elig.json.eligible && !elig.json.certificate) {
    const bad = await api(`/certificates/lu/${luId}/claim`, token, { method: "POST" });
    console.log("incomplete claim blocked", bad.status, bad.json.error);
    if (bad.status === 200 && !bad.json.reused) throw new Error("Incomplete claim should not succeed");
  }

  console.log("=== P1 VERIFY PASS ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
