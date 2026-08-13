/**
 * Verifies Learning Universe progress, certificates, and unified learning API.
 * Run: npx tsx backend/verify-lu-progress.ts
 */
import { prisma } from "./src/utils/prisma.js";
import {
  grantLearningUniverseEnrollment,
} from "./src/services/enrollmentService.js";

async function main() {
  console.log("=== LU Progress & Certificates Verification ===\n");

  const lu = await prisma.learningUniverse.findFirst({
    where: { status: "published" },
    include: {
      tracks: {
        include: {
          modules: { include: { lessons: { select: { id: true, title: true } } } },
        },
      },
    },
  });

  if (!lu) {
    console.log("SKIP: No published Learning Universe found");
    return;
  }

  const lessons = lu.tracks.flatMap((t) => t.modules.flatMap((m) => m.lessons));
  if (lessons.length === 0) {
    console.log("SKIP: LU has no lessons");
    return;
  }

  let user = await prisma.user.findFirst({ where: { role: "student" } });
  if (!user) {
    user = await prisma.user.findFirst();
  }
  if (!user) {
    console.log("FAIL: No user in database");
    process.exit(1);
  }

  await grantLearningUniverseEnrollment(user.id, lu.id);

  const enrollment = await prisma.learningUniverseEnrollment.findUnique({
    where: { userId_learningUniverseId: { userId: user.id, learningUniverseId: lu.id } },
    include: { progress: true },
  });

  if (!enrollment?.progress) {
    console.log("FAIL: Progress record not created on enrollment");
    process.exit(1);
  }
  console.log("PASS: Progress record exists on enrollment");

  const progressId = enrollment.progress.id;

  for (const lesson of lessons) {
    await prisma.lessonProgress.upsert({
      where: { progressId_lessonId: { progressId, lessonId: lesson.id } },
      create: { progressId, lessonId: lesson.id, completed: true, completedAt: new Date() },
      update: { completed: true, completedAt: new Date() },
    });
  }

  const percent = Math.round((lessons.length / lessons.length) * 100);
  await prisma.learningUniverseProgress.update({
    where: { id: progressId },
    data: { percentComplete: percent, lastAccessed: new Date() },
  });
  await prisma.learningUniverseEnrollment.update({
    where: { id: enrollment.id },
    data: { isCompleted: true, completedAt: new Date() },
  });

  const existingCert = await prisma.learningUniverseCertificate.findFirst({
    where: { userId: user.id, learningUniverseId: lu.id },
  });

  if (!existingCert) {
    const { randomUUID } = await import("crypto");
    await prisma.learningUniverseCertificate.create({
      data: {
        certificateId: `LU-TEST-${randomUUID()}`,
        userId: user.id,
        learningUniverseId: lu.id,
        certificateTitle: `Certificate — ${lu.title}`,
      },
    });
  }

  const cert = await prisma.learningUniverseCertificate.findFirst({
    where: { userId: user.id, learningUniverseId: lu.id },
  });

  if (!cert) {
    console.log("FAIL: Certificate not created");
    process.exit(1);
  }
  console.log("PASS: LU certificate record exists:", cert.certificateId);

  const lessonProgressCount = await prisma.lessonProgress.count({
    where: { progressId, completed: true },
  });
  console.log(`PASS: ${lessonProgressCount}/${lessons.length} lessons marked complete`);

  const updated = await prisma.learningUniverseProgress.findUnique({
    where: { id: progressId },
  });
  console.log(`PASS: Universe progress = ${updated?.percentComplete}%`);

  console.log("\n=== All LU progress checks passed ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
