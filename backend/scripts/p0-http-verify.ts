/**
 * P0 end-to-end HTTP verification (categories + progress courseId resolve).
 * Uses SUPER_ADMIN credentials from env; finds a real enrolled student via DB JWT mint.
 */
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../src/utils/prisma.js";
import { resolveCanonicalUniverseId } from "../src/services/learnerScopeService.js";

const BASE = process.env.API_BASE || "http://localhost:5000/api";

async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = (await res.json()) as { success?: boolean; token?: string; accessToken?: string; error?: string };
  const token = json.token || json.accessToken;
  if (!res.ok || !token) throw new Error(`Login failed for ${email}: ${res.status} ${json.error || JSON.stringify(json)}`);
  return token;
}

function mintToken(user: { id: string; email: string; role: string; tokenVersion?: number }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET missing");
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
    },
    secret,
    { expiresIn: "1h" }
  );
}

async function apiGet(path: string, token: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  console.log("=== P0 HTTP VERIFY ===");

  // P0.1 Categories
  const adminEmail = process.env.SUPER_ADMIN_EMAIL!;
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD!;
  const adminToken = await login(adminEmail, adminPassword);
  const cats = await apiGet("/admin/categories", adminToken);
  console.log("[P0.1] GET /admin/categories", cats.status, {
    success: cats.json.success,
    count: Array.isArray(cats.json.categories) ? cats.json.categories.length : "N/A",
    sample: Array.isArray(cats.json.categories)
      ? cats.json.categories.slice(0, 3).map((c: { name: string; slug: string }) => ({ name: c.name, slug: c.slug }))
      : cats.json,
  });
  if (cats.status !== 200 || !cats.json.success || !Array.isArray(cats.json.categories)) {
    throw new Error("P0.1 FAILED: categories GET did not return list");
  }

  // P0.2 Progress with courseId
  const courseId = "cmsq2oect00e3jn2afshiac8r"; // Deep Learning
  const luId = await resolveCanonicalUniverseId(courseId);
  if (!luId) throw new Error("Deep Learning has no LU — unexpected after bridge audit");

  const enrollment = await prisma.learningUniverseEnrollment.findFirst({
    where: { learningUniverseId: luId },
    include: {
      user: { select: { id: true, email: true, role: true, tokenVersion: true } },
      progress: { select: { percentComplete: true, lastLessonId: true } },
    },
  });
  if (!enrollment) throw new Error("No LU enrollment for Deep Learning — cannot verify progress");

  const studentToken = mintToken({
    id: enrollment.user.id,
    email: enrollment.user.email,
    role: enrollment.user.role,
    tokenVersion: enrollment.user.tokenVersion,
  });

  const progViaCourse = await apiGet(`/learning-universes/${courseId}/progress`, studentToken);
  const progViaLu = await apiGet(`/learning-universes/${luId}/progress`, studentToken);

  console.log("[P0.2] progress via courseId", progViaCourse.status, {
    success: progViaCourse.json.success,
    learningUniverseId: progViaCourse.json.learningUniverseId,
    percentComplete: progViaCourse.json.percentComplete,
    lastLessonId: progViaCourse.json.lastLessonId,
  });
  console.log("[P0.2] progress via luId", progViaLu.status, {
    success: progViaLu.json.success,
    learningUniverseId: progViaLu.json.learningUniverseId,
    percentComplete: progViaLu.json.percentComplete,
    lastLessonId: progViaLu.json.lastLessonId,
  });

  if (progViaCourse.status !== 200 || !progViaCourse.json.success) {
    throw new Error(`P0.2 FAILED: progress via courseId → ${progViaCourse.status} ${JSON.stringify(progViaCourse.json)}`);
  }
  if (progViaCourse.json.learningUniverseId !== luId) {
    throw new Error(`P0.2 FAILED: expected learningUniverseId ${luId}, got ${progViaCourse.json.learningUniverseId}`);
  }
  if (progViaCourse.json.percentComplete !== progViaLu.json.percentComplete) {
    throw new Error("P0.2 FAILED: percent mismatch between courseId and luId progress");
  }

  // Experience via courseId
  const exp = await apiGet(`/learning-universes/${courseId}/experience`, studentToken);
  console.log("[P0.3] experience via courseId", exp.status, {
    success: exp.json.success,
    hasData: Boolean(exp.json.data),
    title: exp.json.data?.course?.title || exp.json.data?.title,
  });
  if (exp.status !== 200 || !exp.json.success || !exp.json.data) {
    throw new Error(`P0.3 FAILED: experience via courseId → ${exp.status} ${JSON.stringify(exp.json).slice(0, 400)}`);
  }

  console.log("=== P0 HTTP VERIFY PASS ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
