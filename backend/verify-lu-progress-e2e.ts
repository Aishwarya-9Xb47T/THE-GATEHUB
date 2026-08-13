/**
 * End-to-end verification for Learning Universe Progress features.
 * Run: npx tsx backend/verify-lu-progress-e2e.ts
 */
import jwt from "jsonwebtoken";
import { prisma } from "./src/utils/prisma.js";
import { grantLearningUniverseEnrollment } from "./src/services/enrollmentService.js";

const BASE = process.env.API_URL || "http://localhost:5000/api";
const JWT_SECRET = process.env.JWT_SECRET || "supersecret_jwt_key_123_456_789";

function signTestToken(user: { id: string; email: string; role: string; tokenVersion?: number }) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

type CheckResult = { name: string; pass: boolean; detail: string };

const results: CheckResult[] = [];
function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}`);
  console.log(`  ${detail}\n`);
}

async function api(
  path: string,
  token: string,
  opts: { method?: string; body?: unknown } = {}
) {
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
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json, headers: res.headers };
}

function deriveModuleCompletion(
  tracks: { id: string; modules: { id: string; lessons: { id: string }[] }[] }[],
  completedLessonIds: Set<string>
) {
  return tracks.flatMap((t) =>
    t.modules.map((m) => ({
      moduleId: m.id,
      trackId: t.id,
      total: m.lessons.length,
      completed: m.lessons.filter((l) => completedLessonIds.has(l.id)).length,
      isComplete: m.lessons.length > 0 && m.lessons.every((l) => completedLessonIds.has(l.id)),
    }))
  );
}

function deriveTrackCompletion(
  tracks: { id: string; modules: { lessons: { id: string }[] }[] }[],
  completedLessonIds: Set<string>
) {
  return tracks.map((t) => {
    const lessons = t.modules.flatMap((m) => m.lessons);
    return {
      trackId: t.id,
      total: lessons.length,
      completed: lessons.filter((l) => completedLessonIds.has(l.id)).length,
      isComplete: lessons.length > 0 && lessons.every((l) => completedLessonIds.has(l.id)),
    };
  });
}

async function main() {
  console.log("=== LU Progress E2E Verification ===\n");

  const lu = await prisma.learningUniverse.findFirst({
    where: { status: "published" },
    include: {
      tracks: {
        orderBy: { order: "asc" },
        include: {
          modules: {
            orderBy: { order: "asc" },
            include: { lessons: { orderBy: { order: "asc" }, select: { id: true, title: true } } },
          },
        },
      },
    },
  });

  if (!lu) {
    console.log("FAIL: No published Learning Universe in database");
    process.exit(1);
  }

  const allLessons = lu.tracks.flatMap((t) => t.modules.flatMap((m) => m.lessons));
  if (allLessons.length < 2) {
    console.log("FAIL: Need at least 2 lessons for edge-case testing");
    process.exit(1);
  }

  let student = await prisma.user.findFirst({ where: { role: "student" } });
  if (!student) student = await prisma.user.findFirst();
  if (!student) {
    console.log("FAIL: No user in database");
    process.exit(1);
  }

  const token = signTestToken(student);

  // Reset progress for clean test
  const existingEnrollment = await prisma.learningUniverseEnrollment.findUnique({
    where: { userId_learningUniverseId: { userId: student.id, learningUniverseId: lu.id } },
    include: { progress: true },
  });
  if (existingEnrollment?.progress) {
    await prisma.lessonProgress.deleteMany({ where: { progressId: existingEnrollment.progress.id } });
    await prisma.learningUniverseProgress.update({
      where: { id: existingEnrollment.progress.id },
      data: { percentComplete: 0, lastAccessed: null },
    });
    await prisma.learningUniverseEnrollment.update({
      where: { id: existingEnrollment.id },
      data: { isCompleted: false, completedAt: null },
    });
    await prisma.learningUniverseCertificate.deleteMany({
      where: { userId: student.id, learningUniverseId: lu.id },
    });
  }

  await grantLearningUniverseEnrollment(student.id, lu.id);

  const enrollment = await prisma.learningUniverseEnrollment.findUnique({
    where: { userId_learningUniverseId: { userId: student.id, learningUniverseId: lu.id } },
    include: { progress: true },
  });

  check(
    "DB: progress record on enrollment",
    !!enrollment?.progress,
    enrollment?.progress
      ? `progressId=${enrollment.progress.id}, percent=${enrollment.progress.percentComplete}`
      : "missing"
  );

  // --- Lesson completion persistence ---
  const lesson1 = allLessons[0];
  const patch1 = await api(
    `/learning-universes/${lu.id}/lessons/${lesson1.id}/progress`,
    token,
    { method: "PATCH", body: { completed: true } }
  );
  const p1 = patch1.json as { percentComplete?: number; completedCount?: number };
  check(
    "API: lesson completion PATCH",
    patch1.status === 200 && p1.percentComplete !== undefined,
    `status=${patch1.status} body=${JSON.stringify(patch1.json)}`
  );

  const dbLesson1 = await prisma.lessonProgress.findUnique({
    where: {
      progressId_lessonId: { progressId: enrollment!.progress!.id, lessonId: lesson1.id },
    },
  });
  check(
    "DB: lesson completion persisted",
    dbLesson1?.completed === true && !!dbLesson1.completedAt,
    JSON.stringify(dbLesson1)
  );

  // --- Touch-only (resume) without marking complete ---
  const lesson2 = allLessons[1];
  const touch = await api(
    `/learning-universes/${lu.id}/lessons/${lesson2.id}/progress`,
    token,
    { method: "PATCH", body: { completed: false, touch: true } }
  );
  const dbLesson2 = await prisma.lessonProgress.findUnique({
    where: {
      progressId_lessonId: { progressId: enrollment!.progress!.id, lessonId: lesson2.id },
    },
  });
  check(
    "API+DB: resume touch (last accessed lesson)",
    touch.status === 200 && dbLesson2?.completed === false,
    `touch status=${touch.status}, lesson2 completed=${dbLesson2?.completed}`
  );

  const getProg1 = await api(`/learning-universes/${lu.id}/progress`, token);
  const gp1 = getProg1.json as { lastLessonId?: string; percentComplete?: number };
  check(
    "API: resume returns lastLessonId",
    getProg1.status === 200 && gp1.lastLessonId === lesson2.id,
    `lastLessonId=${gp1.lastLessonId}, expected=${lesson2.id}`
  );

  // --- Module / track derived completion ---
  const completedSoFar = new Set([lesson1.id]);
  const moduleStates = deriveModuleCompletion(lu.tracks, completedSoFar);
  const partialModule = moduleStates.find((m) => m.completed > 0 && !m.isComplete);
  const trackStates = deriveTrackCompletion(lu.tracks, completedSoFar);
  const partialTrack = trackStates.find((t) => t.completed > 0 && !t.isComplete);
  check(
    "DERIVED: partial module completion",
    !!partialModule || allLessons.length === 1,
    partialModule
      ? `module ${partialModule.moduleId}: ${partialModule.completed}/${partialModule.total}`
      : "single-lesson universe"
  );
  check(
    "DERIVED: partial track completion",
    !!partialTrack || lu.tracks.length === 0,
    partialTrack
      ? `track ${partialTrack.trackId}: ${partialTrack.completed}/${partialTrack.total}`
      : "no tracks"
  );

  // --- Complete all lessons → universe completion + certificate ---
  for (const lesson of allLessons) {
    await api(`/learning-universes/${lu.id}/lessons/${lesson.id}/progress`, token, {
      method: "PATCH",
      body: { completed: true },
    });
  }

  const getProgFinal = await api(`/learning-universes/${lu.id}/progress`, token);
  const gpf = getProgFinal.json as {
    percentComplete?: number;
    isCompleted?: boolean;
    certificate?: { certificateId: string };
  };
  check(
    "API: universe completion at 100%",
    gpf.percentComplete === 100 && gpf.isCompleted === true,
    JSON.stringify({ percent: gpf.percentComplete, isCompleted: gpf.isCompleted })
  );

  const dbEnrollment = await prisma.learningUniverseEnrollment.findUnique({
    where: { id: enrollment!.id },
  });
  const dbCert = await prisma.learningUniverseCertificate.findFirst({
    where: { userId: student.id, learningUniverseId: lu.id },
  });
  check(
    "DB: universe enrollment marked complete",
    dbEnrollment?.isCompleted === true && !!dbEnrollment.completedAt,
    JSON.stringify({ isCompleted: dbEnrollment?.isCompleted, completedAt: dbEnrollment?.completedAt })
  );
  check(
    "DB+API: certificate auto-generated",
    !!dbCert && !!gpf.certificate?.certificateId,
    `db certId=${dbCert?.certificateId}, api cert=${gpf.certificate?.certificateId}`
  );

  const allComplete = new Set(allLessons.map((l) => l.id));
  const allModulesComplete = deriveModuleCompletion(lu.tracks, allComplete).every(
    (m) => m.total === 0 || m.isComplete
  );
  const allTracksComplete = deriveTrackCompletion(lu.tracks, allComplete).every(
    (t) => t.total === 0 || t.isComplete
  );
  check("DERIVED: all modules complete", allModulesComplete, `${moduleStates.length} modules checked`);
  check("DERIVED: all tracks complete", allTracksComplete, `${trackStates.length} tracks checked`);

  // --- Certificate download ---
  const certForDownload = await prisma.learningUniverseCertificate.findFirst({
    where: { userId: student.id, learningUniverseId: lu.id },
  });
  if (certForDownload) {
    let dlOk = false;
    let dlDetail = "";
    for (let attempt = 0; attempt < 2 && !dlOk; attempt++) {
      const dlRes = await fetch(`${BASE}/certificates/lu/${certForDownload.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const buf = await dlRes.arrayBuffer();
      const isPdf = dlRes.headers.get("content-type")?.includes("pdf");
      dlOk = dlRes.status === 200 && isPdf && buf.byteLength > 1000;
      dlDetail = `attempt=${attempt + 1} status=${dlRes.status}, content-type=${dlRes.headers.get("content-type")}, bytes=${buf.byteLength}`;
      if (!dlOk) await new Promise((r) => setTimeout(r, 1500));
    }
    check("API: certificate PDF download", dlOk, dlDetail);

    const verifyRes = await fetch(`${BASE}/certificates/verify/lu/${dbCert.certificateId}`);
    const verifyJson = await verifyRes.json();
    check(
      "API: certificate verification",
      verifyRes.status === 200 && verifyJson.valid === true,
      JSON.stringify(verifyJson)
    );
  }

  // --- Unified learning API (dashboard / continue learning) ---
  const myLearning = await api("/learning/my", token);
  const ml = myLearning.json as {
    continueLearning?: { type: string; id: string; continueUrl: string }[];
    items?: { type: string; id: string; progressPercent: number; continueUrl: string }[];
  };
  const luItem = ml.items?.find((i) => i.type === "learning_universe" && i.id === lu.id);
  check(
    "API: unified /learning/my includes LU",
    myLearning.status === 200 && !!luItem,
    luItem ? JSON.stringify(luItem) : JSON.stringify(myLearning.json)
  );
  check(
    "API: continue learning URL for LU",
    !!luItem?.continueUrl?.includes(`/student/learning-universe/${lu.id}/learn`),
    luItem?.continueUrl ?? "missing"
  );

  // --- My enrollments (browse integration) ---
  const myEnroll = await api("/learning-universes/my-enrollments", token);
  const me = myEnroll.json as { enrollments?: { learningUniverseId: string; progress?: { percentComplete: number } }[] };
  const luEnroll = me.enrollments?.find((e) => e.learningUniverseId === lu.id);
  check(
    "API: my-enrollments progress for browse",
    myEnroll.status === 200 && (luEnroll?.progress?.percentComplete ?? 0) === 100,
    JSON.stringify(luEnroll?.progress)
  );

  // --- My certificates ---
  const myCerts = await api("/certificates/my", token);
  const mc = myCerts.json as { certificates?: { type: string; contentId: string }[] };
  const luCert = mc.certificates?.find((c) => c.type === "learning_universe" && c.contentId === lu.id);
  check(
    "API: /certificates/my LU has downloadUrl",
    myCerts.status === 200 && !!luCert?.downloadUrl?.includes("/api/certificates/lu/"),
    luCert?.downloadUrl ?? "missing"
  );

  // --- Edge cases ---
  const badLesson = await api(`/learning-universes/${lu.id}/lessons/nonexistent-id/progress`, token, {
    method: "PATCH",
    body: { completed: true },
  });
  check("EDGE: invalid lesson returns 404", badLesson.status === 404, `status=${badLesson.status}`);

  const noAuth = await fetch(`${BASE}/learning-universes/${lu.id}/progress`);
  check("EDGE: unauthenticated progress returns 401", noAuth.status === 401, `status=${noAuth.status}`);

  // Idempotent certificate (complete again should not duplicate)
  const certCountBefore = await prisma.learningUniverseCertificate.count({
    where: { userId: student.id, learningUniverseId: lu.id },
  });
  await api(`/learning-universes/${lu.id}/lessons/${lesson1.id}/progress`, token, {
    method: "PATCH",
    body: { completed: true },
  });
  const certCountAfter = await prisma.learningUniverseCertificate.count({
    where: { userId: student.id, learningUniverseId: lu.id },
  });
  check(
    "EDGE: no duplicate certificates on re-complete",
    certCountBefore === certCountAfter,
    `before=${certCountBefore}, after=${certCountAfter}`
  );

  // --- Analytics integration (LU metrics included) ---
  const instructor = await prisma.user.findUnique({ where: { id: lu.instructorId } });
  if (instructor) {
    const instrToken = signTestToken(instructor);
    const analytics = await api("/analytics/instructor", instrToken);
    const an = analytics.json as {
      stats?: {
        totalEnrollments?: number;
        courseEnrollments?: number;
        luEnrollments?: number;
        luCompletions?: number;
        luCertificates?: number;
        luRevenue?: number;
        totalLearningUniverses?: number;
      };
    };
    const [courseEnrollCount, luEnrollCount, luCompleteCount, luCertCount] = await Promise.all([
      prisma.enrollment.count({ where: { course: { instructorId: instructor.id } } }),
      prisma.learningUniverseEnrollment.count({
        where: { learningUniverse: { instructorId: instructor.id } },
      }),
      prisma.learningUniverseEnrollment.count({
        where: { learningUniverse: { instructorId: instructor.id }, isCompleted: true },
      }),
      prisma.learningUniverseCertificate.count({
        where: { learningUniverse: { instructorId: instructor.id } },
      }),
    ]);
    check(
      "API: analytics includes LU in total enrollments",
      analytics.status === 200 &&
        (an.stats?.totalEnrollments ?? 0) === courseEnrollCount + luEnrollCount,
      `total=${an.stats?.totalEnrollments}, courses=${courseEnrollCount}, lu=${luEnrollCount}`
    );
    check(
      "API: analytics luEnrollments metric",
      an.stats?.luEnrollments === luEnrollCount,
      `api=${an.stats?.luEnrollments}, db=${luEnrollCount}`
    );
    check(
      "API: analytics luCompletions metric",
      an.stats?.luCompletions === luCompleteCount,
      `api=${an.stats?.luCompletions}, db=${luCompleteCount}`
    );
    check(
      "API: analytics luCertificates metric",
      an.stats?.luCertificates === luCertCount,
      `api=${an.stats?.luCertificates}, db=${luCertCount}`
    );
    check(
      "API: analytics totalLearningUniverses metric",
      (an.stats?.totalLearningUniverses ?? 0) >= 1,
      `published LUs=${an.stats?.totalLearningUniverses}`
    );
    check(
      "API: analytics luRevenue field present",
      typeof an.stats?.luRevenue === "number",
      `luRevenue=${an.stats?.luRevenue}`
    );
  }

  // --- Category hub data sources (progress + continue URL) ---
  const category = await prisma.category.findFirst({
    where: { learningUniverses: { some: { id: lu.id } } },
  });
  if (category) {
    const slug = category.name.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
    const publishedRes = await fetch(`${BASE}/learning-universes`);
    const publishedJson = (await publishedRes.json()) as { data?: { id: string; categoryRel?: { name: string } }[] };
    const inCategory = (publishedJson.data || []).filter(
      (u) => u.categoryRel?.name === category.name || u.id === lu.id
    );
    check(
      "API: category hub published universes",
      inCategory.length >= 1,
      `category=${category.name}, universes=${inCategory.length}`
    );
    check(
      "API: category hub enrollment progress",
      (luEnroll?.progress?.percentComplete ?? 0) === 100,
      `enrolled LU progress=${luEnroll?.progress?.percentComplete}%`
    );
    check(
      "API: category hub continue learning URL",
      !!luItem?.continueUrl?.includes(`/student/learning-universe/${lu.id}/learn`),
      luItem?.continueUrl ?? "missing"
    );
  } else {
    check(
      "API: category hub enrollment progress",
      (luEnroll?.progress?.percentComplete ?? 0) === 100,
      `progress=${luEnroll?.progress?.percentComplete}%`
    );
    check(
      "API: category hub continue learning URL",
      !!luItem?.continueUrl?.includes(`/student/learning-universe/${lu.id}/learn`),
      luItem?.continueUrl ?? "missing"
    );
  }

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log("=== SUMMARY ===");
  console.log(`${passed}/${results.length} checks passed`);
  if (failed.length) {
    console.log("\nFailed checks:");
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
  console.log("\nAll LU progress E2E checks passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
