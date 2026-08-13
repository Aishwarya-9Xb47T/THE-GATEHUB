/**
 * P0 verification against live DB + API (categories + courseId progress resolve).
 */
import { prisma } from "../src/utils/prisma.js";
import { resolveCanonicalUniverseId } from "../src/services/learnerScopeService.js";

async function main() {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { courses: true, learningUniverses: true } } },
  });
  console.log("[P0.1] categories in DB:", categories.length);
  console.log(
    categories.slice(0, 10).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      courses: c._count.courses,
      lus: c._count.learningUniverses,
    }))
  );

  const courseId = "cmsq2oect00e3jn2afshiac8r"; // Deep Learning
  const luId = await resolveCanonicalUniverseId(courseId);
  console.log("[P0.2/P0.3] Deep Learning course → LU:", { courseId, luId });

  const enrollments = await prisma.enrollment.findMany({
    where: { courseId },
    select: {
      userId: true,
      user: { select: { email: true } },
      progress: { select: { percent: true } },
    },
    take: 5,
  });
  console.log("[P0.2] Course enrollments:", enrollments);

  if (luId) {
    const luEnroll = await prisma.learningUniverseEnrollment.findMany({
      where: { learningUniverseId: luId },
      select: {
        userId: true,
        user: { select: { email: true } },
        progress: { select: { percentComplete: true, lastLessonId: true } },
        isCompleted: true,
      },
      take: 5,
    });
    console.log("[P0.2] LU enrollments/progress:", JSON.stringify(luEnroll, null, 2));
  }

  // Admin user for HTTP test
  const admin = await prisma.user.findFirst({
    where: { role: { in: ["admin", "super_admin"] } },
    select: { id: true, email: true, role: true },
  });
  const student = enrollments[0]
    ? await prisma.user.findUnique({
        where: { id: enrollments[0].userId },
        select: { id: true, email: true, role: true },
      })
    : await prisma.user.findFirst({
        where: { role: "student" },
        select: { id: true, email: true, role: true },
      });

  console.log("[auth subjects]", { admin, student });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
