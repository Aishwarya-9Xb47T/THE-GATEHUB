/**
 * Full E2E for "Computer Networking Mastery" Learning Universe.
 * Run: npx tsx backend/verify-lu-networking-e2e.ts
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";
import { prisma } from "./src/utils/prisma.js";
import { grantLearningUniverseEnrollment } from "./src/services/enrollmentService.js";
import { publishLearningUniverse } from "./src/controllers/learning-universe-controller.js";

const BASE = process.env.API_URL || "http://localhost:5000/api";
const JWT_SECRET = process.env.JWT_SECRET || "supersecret_jwt_key_123_456_789";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.join(__dirname, "samples", "computer-networking-mastery.tex");

type Check = { name: string; pass: boolean; detail: string };
const results: Check[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}`);
  console.log(`  ${detail}\n`);
}

function signTestToken(user: { id: string; email: string; role: string; tokenVersion?: number }) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion ?? 0 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
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
  console.log("=== Computer Networking Mastery — Full LU E2E ===\n");

  if (!fs.existsSync(SAMPLE)) {
    check("Sample course file", false, `Missing ${SAMPLE}`);
    process.exit(1);
  }

  const tex = fs.readFileSync(SAMPLE, "utf8");
  const instructor =
    (await prisma.user.findFirst({ where: { role: "instructor" } })) ||
    (await prisma.user.findFirst({ where: { role: "admin" } })) ||
    (await prisma.user.findFirst());
  if (!instructor) {
    check("Instructor user", false, "No user found");
    process.exit(1);
  }

  let student = await prisma.user.findFirst({
    where: { role: "student", id: { not: instructor.id } },
  });
  if (!student) student = await prisma.user.findFirst({ where: { id: { not: instructor.id } } });
  if (!student) {
    check("Student user", false, "No student found");
    process.exit(1);
  }

  const existing = await prisma.learningUniverse.findFirst({
    where: { title: "Computer Networking Mastery", instructorId: instructor.id },
  });

  const universe = await publishLearningUniverse(tex, instructor.id, undefined, {
    universeId: existing?.id,
  });
  check("Publish course", universe.status === "published", `id=${universe.id}, status=${universe.status}`);

  const luDetail = await prisma.learningUniverse.findUnique({
    where: { id: universe.id },
    include: {
      tracks: {
        orderBy: { order: "asc" },
        include: {
          modules: {
            orderBy: { order: "asc" },
            include: {
              lessons: {
                orderBy: { order: "asc" },
                include: { project: true },
              },
            },
          },
        },
      },
    },
  });

  const lessons = luDetail!.tracks.flatMap((t) => t.modules.flatMap((m) => m.lessons));
  check("Course has 9 lessons", lessons.length >= 9, `${lessons.length} lessons`);

  const projectLesson = lessons.find((l) => l.title.includes("Packet Analyzer"));
  check("Project lesson exists", !!projectLesson?.project, projectLesson?.title ?? "not found");

  const lesson1 = lessons[0];
  const blocks = (lesson1.contentBlocks as { type: string }[]) || [];
  check("Lesson 1 has overview block", blocks.some((b) => b.type === "overview"), `types: ${blocks.map((b) => b.type).join(", ")}`);
  check("Lesson 1 has quiz block", blocks.some((b) => b.type === "quiz"), `types: ${blocks.map((b) => b.type).join(", ")}`);

  const projectBlock = projectLesson
    ? ((projectLesson.contentBlocks as { type: string; content?: { githubUrl?: string; colabUrl?: string } }[]) || []).find(
        (b) => b.type === "project"
      )
    : null;
  check(
    "Project block has GitHub URL",
    !!projectBlock?.content?.githubUrl?.includes("github.com"),
    projectBlock?.content?.githubUrl ?? "missing"
  );
  check(
    "Project block has Colab URL",
    !!projectBlock?.content?.colabUrl?.includes("colab"),
    projectBlock?.content?.colabUrl ?? "missing"
  );

  await grantLearningUniverseEnrollment(student.id, universe.id);
  const studentToken = signTestToken(student);
  const instructorToken = signTestToken(instructor);

  check(
    "Enroll student",
    !!(await prisma.learningUniverseEnrollment.findUnique({
      where: { userId_learningUniverseId: { userId: student.id, learningUniverseId: universe.id } },
    })),
    `student=${student.email}`
  );

  // Complete all lessons
  for (const lesson of lessons) {
    await api(`/learning-universes/${universe.id}/lessons/${lesson.id}/progress`, studentToken, {
      method: "PATCH",
      body: { completed: true },
    });
  }

  const progress = await api(`/learning-universes/${universe.id}/progress`, studentToken);
  const prog = progress.json as { percentComplete?: number; isCompleted?: boolean; certificate?: { certificateId: string } };
  check(
    "Complete all lessons → 100%",
    progress.status === 200 && prog.percentComplete === 100 && prog.isCompleted === true,
    JSON.stringify(prog)
  );

  // Project submission (GitHub)
  if (projectLesson?.project) {
    await prisma.learningUniverseProjectSubmission.deleteMany({
      where: { projectId: projectLesson.project.id, userId: student.id },
    });

    const form = new FormData();
    form.append("githubUrl", "https://github.com/test/networking-capstone");
    form.append("notes", "Networking Mastery capstone submission");

    const submitRes = await fetch(
      `${BASE}/learning-universes/${universe.id}/lessons/${projectLesson.id}/project/submit`,
      { method: "POST", headers: { Authorization: `Bearer ${studentToken}` }, body: form }
    );
    const submitJson = (await submitRes.json().catch(() => ({}))) as { data?: { id: string; status: string } };
    check(
      "Project GitHub submission",
      submitRes.ok && !!submitJson.data?.id,
      `status=${submitRes.status} body=${JSON.stringify(submitJson)}`
    );

    // Instructor review
    const reviewRes = await api(
      `/project-reviews/instructor/submissions/${submitJson.data!.id}`,
      instructorToken,
      { method: "PATCH", body: { action: "approve", grade: 92, feedback: "Excellent packet analyzer" } }
    );
    check(
      "Instructor grades project",
      reviewRes.status === 200,
      `status=${reviewRes.status} body=${JSON.stringify(reviewRes.json)}`
    );
  }

  // Certificate
  const dbCert = await prisma.learningUniverseCertificate.findFirst({
    where: { userId: student.id, learningUniverseId: universe.id },
  });
  check(
    "Certificate generated",
    !!dbCert?.certificateId,
    `certId=${dbCert?.certificateId}`
  );

  if (dbCert) {
    const dlRes = await fetch(`${BASE}/certificates/lu/${dbCert.id}/download`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const buf = await dlRes.arrayBuffer();
    check(
      "Certificate PDF download",
      dlRes.status === 200 && dlRes.headers.get("content-type")?.includes("pdf") && buf.byteLength > 1000,
      `status=${dlRes.status}, bytes=${buf.byteLength}`
    );

    const verifyRes = await fetch(`${BASE}/certificates/verify/lu/${dbCert.certificateId}`);
    const verifyJson = (await verifyRes.json()) as {
      valid?: boolean;
      studentName?: string;
      learningUniverseTitle?: string;
    };
    check(
      "Certificate verification",
      verifyRes.status === 200 && verifyJson.valid === true,
      JSON.stringify(verifyJson)
    );
    check(
      "Certificate renders student name",
      !!verifyJson.studentName?.length,
      verifyJson.studentName ?? "missing"
    );
    check(
      "Certificate renders course title",
      verifyJson.learningUniverseTitle?.includes("Networking") ?? false,
      verifyJson.learningUniverseTitle ?? "missing"
    );
  }

  // PDF compile smoke test
  const { prepareLatexForCompilation } = await import("./src/services/latexLearningCommands.js");
  const { compileLatexLocally } = await import("./src/services/latexCompileService.js");
  const { code } = prepareLatexForCompilation(tex, universe.id);
  check("PDF prepared content has all sections", [
    "Overview", "Quiz", "Practice:", "Project:", "Assignment:", "Discussion", "Checkpoint", "Final Exam",
  ].every((s) => code.includes(s)), "key sections present");

  const compile = await compileLatexLocally(`lu-e2e-${Date.now()}`, tex, { maxPasses: 2 });
  check("PDF compiles", compile.success, compile.success ? compile.pdfPath! : compile.errors[0]?.message ?? "failed");

  console.log("=== SUMMARY ===");
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(`${passed}/${results.length} checks passed`);
  if (failed.length) {
    console.log("\nFailed:");
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
  console.log("\nAll Networking Mastery E2E checks passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
