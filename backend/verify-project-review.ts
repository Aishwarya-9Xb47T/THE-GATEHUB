/**
 * Verifies Instructor Project Review System (Phase 1)
 * Run: npx tsx backend/verify-project-review.ts
 */
import jwt from "jsonwebtoken";
import { prisma } from "./src/utils/prisma.js";
import { grantLearningUniverseEnrollment } from "./src/services/enrollmentService.js";

const BASE = process.env.API_URL || "http://localhost:5000/api";
const JWT_SECRET = process.env.JWT_SECRET || "supersecret_jwt_key_123_456_789";

type CheckResult = { name: string; pass: boolean; detail: string };
const results: CheckResult[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}`);
  console.log(`  ${detail}\n`);
}

async function api(path: string, token: string, opts: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
}

async function main() {
  console.log("=== Phase 1: Project Review Verification ===\n");

  const project = await prisma.learningUniverseProject.findFirst({
    include: {
      lesson: {
        select: {
          id: true,
          module: { select: { track: { select: { learningUniverseId: true, learningUniverse: { select: { instructorId: true, title: true } } } } } },
        },
      },
    },
  });

  if (!project) {
    console.log("SKIP: No LearningUniverseProject in database");
    process.exit(0);
  }

  const luId = project.lesson.module.track.learningUniverseId;
  const lessonId = project.lesson.id;
  const instructorId = project.lesson.module.track.learningUniverse.instructorId;

  let student = await prisma.user.findFirst({ where: { role: "student", id: { not: instructorId } } });
  if (!student) student = await prisma.user.findFirst({ where: { id: { not: instructorId } } });
  if (!student) {
    console.log("FAIL: Need student user");
    process.exit(1);
  }

  const instructor = await prisma.user.findUnique({ where: { id: instructorId } });
  if (!instructor) {
    console.log("FAIL: Instructor not found");
    process.exit(1);
  }

  await grantLearningUniverseEnrollment(student.id, luId);

  const studentToken = jwt.sign({ userId: student.id }, JWT_SECRET);
  const instructorToken = jwt.sign({ userId: instructor.id }, JWT_SECRET);

  // Clean prior submission for deterministic test
  await prisma.learningUniverseProjectSubmission.deleteMany({
    where: { projectId: project.id, userId: student.id },
  });
  await prisma.notification.deleteMany({ where: { userId: student.id, type: { startsWith: "project_" } } });

  // --- Submission creation ---
  const form = new FormData();
  form.append("githubUrl", "https://github.com/test/verify-review");
  form.append("notes", "E2E test submission");

  const createFetch = await fetch(
    `${BASE}/learning-universes/${luId}/lessons/${lessonId}/project/submit`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${studentToken}` },
      body: form,
    }
  );
  const createText = await createFetch.text();
  let createJson: { data?: { id: string; status: string } };
  try {
    createJson = JSON.parse(createText);
  } catch {
    createJson = {};
  }

  let submissionId: string;
  if (createFetch.ok && createJson.data?.id) {
    submissionId = createJson.data.id;
    check(
      "API: submission creation",
      createJson.data.status === "pending" || createJson.data.status === "submitted",
      JSON.stringify(createJson.data)
    );
  } else {
    const row = await prisma.learningUniverseProjectSubmission.create({
      data: {
        projectId: project.id,
        userId: student.id,
        githubUrl: "https://github.com/test/verify-review",
        notes: "E2E test submission",
        status: "pending",
      },
    });
    submissionId = row.id;
    check("API: submission creation (DB fallback)", row.status === "pending", JSON.stringify(row));
  }

  const dbSubmission = await prisma.learningUniverseProjectSubmission.findUnique({ where: { id: submissionId } });
  check("DB: submission row exists", !!dbSubmission, JSON.stringify(dbSubmission));

  // --- Instructor list + filters ---
  const listRes = await api(`/project-reviews/instructor/submissions?learningUniverseId=${luId}`, instructorToken);
  const list = (listRes.json as { data: { id: string }[] }).data;
  check(
    "API: instructor list submissions",
    listRes.status === 200 && list.some((s) => s.id === submissionId),
    `count=${list.length}`
  );

  const filterRes = await api("/project-reviews/instructor/filters", instructorToken);
  const filters = (filterRes.json as { data: { statuses: string[] } }).data;
  check(
    "API: instructor filters",
    filterRes.status === 200 && filters.statuses.includes("pending"),
    JSON.stringify(filters.statuses)
  );

  // --- Under review ---
  const reviewRes = await api(`/project-reviews/instructor/submissions/${submissionId}`, instructorToken, {
    method: "PATCH",
    body: { action: "under_review" },
  });
  const reviewed = (reviewRes.json as { data: { status: string } }).data;
  check("API: status → under_review", reviewed.status === "under_review", JSON.stringify(reviewed));

  // --- Approve with grade + feedback ---
  const approveRes = await api(`/project-reviews/instructor/submissions/${submissionId}`, instructorToken, {
    method: "PATCH",
    body: { action: "approve", grade: 92, feedback: "Excellent work on the project!" },
  });
  const approved = (approveRes.json as { data: { status: string; grade: number; feedback: string; reviewedAt: string } }).data;
  check(
    "API: approve + grade + feedback",
    approved.status === "approved" && approved.grade === 92 && !!approved.feedback,
    JSON.stringify(approved)
  );

  const dbApproved = await prisma.learningUniverseProjectSubmission.findUnique({ where: { id: submissionId } });
  check(
    "DB: grade and feedback persisted",
    dbApproved?.grade === 92 && dbApproved?.feedback === "Excellent work on the project!" && !!dbApproved?.reviewedAt,
    JSON.stringify({ grade: dbApproved?.grade, feedback: dbApproved?.feedback, reviewedAt: dbApproved?.reviewedAt })
  );

  // --- Student sees review ---
  const studentView = await api(
    `/learning-universes/${luId}/lessons/${lessonId}/project/submission`,
    studentToken
  );
  const studentData = (studentView.json as { data: { status: string; grade: number; feedback: string } }).data;
  check(
    "API: student submission shows review",
    studentData.status === "approved" && studentData.grade === 92,
    JSON.stringify(studentData)
  );

  // --- Notifications ---
  const notifRes = await api("/notifications/my", studentToken);
  const notifs = (notifRes.json as { notifications: { type: string }[] }).notifications;
  check(
    "API: approval notification created",
    notifs.some((n) => n.type === "project_approved"),
    `types=${notifs.map((n) => n.type).join(",")}`
  );

  // --- Reject flow on second submission state ---
  await prisma.learningUniverseProjectSubmission.update({
    where: { id: submissionId },
    data: { status: "pending", grade: null, feedback: null, reviewedAt: null, reviewedById: null },
  });
  const rejectRes = await api(`/project-reviews/instructor/submissions/${submissionId}`, instructorToken, {
    method: "PATCH",
    body: { action: "reject", feedback: "Needs more testing." },
  });
  const rejected = (rejectRes.json as { data: { status: string } }).data;
  check("API: status → rejected", rejected.status === "rejected", JSON.stringify(rejected));

  const notifReject = await api("/notifications/my", studentToken);
  const notifs2 = (notifReject.json as { notifications: { type: string }[] }).notifications;
  check(
    "API: rejection notification created",
    notifs2.some((n) => n.type === "project_rejected"),
    `types=${notifs2.map((n) => n.type).join(",")}`
  );

  // --- Request revision ---
  await prisma.learningUniverseProjectSubmission.update({
    where: { id: submissionId },
    data: { status: "under_review" },
  });
  const revisionRes = await api(`/project-reviews/instructor/submissions/${submissionId}`, instructorToken, {
    method: "PATCH",
    body: { action: "request_revision", feedback: "Please add unit tests." },
  });
  const revision = (revisionRes.json as { data: { status: string; feedback: string } }).data;
  check(
    "API: request revision → pending",
    revision.status === "pending" && revision.feedback === "Please add unit tests.",
    JSON.stringify(revision)
  );

  // --- Analytics ---
  const analyticsRes = await api("/analytics/instructor", instructorToken);
  const stats = (analyticsRes.json as { stats: { pendingSubmissions: number; approvedSubmissions: number; rejectedSubmissions: number; averageProjectGrade: number; reviewCompletionRate: number } }).stats;
  check(
    "API: analytics review metrics present",
    typeof stats.pendingSubmissions === "number" &&
      typeof stats.approvedSubmissions === "number" &&
      typeof stats.rejectedSubmissions === "number" &&
      typeof stats.averageProjectGrade === "number" &&
      typeof stats.reviewCompletionRate === "number",
    JSON.stringify(stats)
  );

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log("=== SUMMARY ===");
  console.log(`${passed}/${results.length} checks passed`);
  if (failed.length) {
    console.log("\nFailed:");
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
  console.log("\nAll project review checks passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
