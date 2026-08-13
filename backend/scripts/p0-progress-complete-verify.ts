import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/utils/prisma.js";
import { resolveCanonicalUniverseId } from "../src/services/learnerScopeService.js";

const BASE = process.env.API_BASE || "http://localhost:5000/api";
const courseId = "cmsq2oect00e3jn2afshiac8r";

function mint(user: { id: string; email: string; role: string; tokenVersion: number }) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion },
    process.env.JWT_SECRET!,
    { expiresIn: "1h" }
  );
}

async function main() {
  const luId = (await resolveCanonicalUniverseId(courseId))!;
  const enrollment = await prisma.learningUniverseEnrollment.findFirst({
    where: { learningUniverseId: luId, userId: "cmoi97hzt0000tlh83u1agzee" },
    include: {
      user: { select: { id: true, email: true, role: true, tokenVersion: true } },
      progress: { include: { lessonProgress: true } },
    },
  });
  console.log("DB enrollment count check:");
  const all = await prisma.learningUniverseEnrollment.count({
    where: { learningUniverseId: luId, userId: "cmoi97hzt0000tlh83u1agzee" },
  });
  console.log({ all, progressId: enrollment?.progress?.id, last: enrollment?.progress?.lastLessonId, lessonProg: enrollment?.progress?.lessonProgress.length });

  const lessons = await prisma.learningUniverseLesson.findMany({
    where: { module: { track: { learningUniverseId: luId } } },
    select: { id: true, title: true, order: true },
    orderBy: { order: "asc" },
    take: 3,
  });
  console.log("lessons", lessons);

  const token = mint(enrollment!.user);

  // GET before
  const before = await fetch(`${BASE}/learning-universes/${courseId}/progress`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  console.log("GET before (courseId)", {
    lu: before.learningUniverseId,
    pct: before.percentComplete,
    last: before.lastLessonId,
    completedLessons: before.progress?.lessonProgress?.filter((p: { completed: boolean }) => p.completed).length,
  });

  const lessonId = lessons[0]?.id;
  if (!lessonId) throw new Error("no lesson");

  const patch = await fetch(`${BASE}/learning-universes/${courseId}/lessons/${lessonId}/progress`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ completed: true }),
  }).then(async (r) => ({ status: r.status, json: await r.json() }));
  console.log("PATCH complete via courseId", patch.status, patch.json);

  const afterCourse = await fetch(`${BASE}/learning-universes/${courseId}/progress`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  const afterLu = await fetch(`${BASE}/learning-universes/${luId}/progress`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  console.log("GET after courseId", {
    pct: afterCourse.percentComplete,
    last: afterCourse.lastLessonId,
    completed: afterCourse.progress?.lessonProgress?.filter((p: { completed: boolean }) => p.completed).length,
  });
  console.log("GET after luId", {
    pct: afterLu.percentComplete,
    last: afterLu.lastLessonId,
    completed: afterLu.progress?.lessonProgress?.filter((p: { completed: boolean }) => p.completed).length,
  });

  // category create smoke (admin login)
  const login = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.SUPER_ADMIN_EMAIL,
      password: process.env.SUPER_ADMIN_PASSWORD,
    }),
  }).then((r) => r.json());
  const adminToken = login.token || login.accessToken;
  const slug = `p0-test-${Date.now()}`;
  const created = await fetch(`${BASE}/admin/categories`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: `P0 Test ${slug}`, slug, description: "temp p0" }),
  }).then(async (r) => ({ status: r.status, json: await r.json() }));
  console.log("CREATE category", created.status, created.json?.category?.id);
  if (created.json?.category?.id) {
    await prisma.category.delete({ where: { id: created.json.category.id } });
    console.log("cleaned up test category");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
