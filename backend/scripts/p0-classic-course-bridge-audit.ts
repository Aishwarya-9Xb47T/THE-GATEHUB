/**
 * P0.3 — Count published/active courses that can/cannot bridge to a Learning Universe.
 */
import { prisma } from "../src/utils/prisma.js";
import { resolveCanonicalUniverseId } from "../src/services/learnerScopeService.js";

async function main() {
  const courses = await prisma.course.findMany({
    where: { status: "published" },
    select: {
      id: true,
      title: true,
      status: true,
      instructorId: true,
      _count: { select: { sections: true, enrollments: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const bridgeable: Array<Record<string, unknown>> = [];
  const blocked: Array<Record<string, unknown>> = [];

  for (const c of courses) {
    const luId = await resolveCanonicalUniverseId(c.id);
    const row = {
      courseId: c.id,
      title: c.title,
      status: c.status,
      sections: c._count.sections,
      enrollments: c._count.enrollments,
      luId,
    };
    if (luId) bridgeable.push(row);
    else blocked.push(row);
  }

  console.log(
    JSON.stringify(
      {
        totalPublishedOrActive: courses.length,
        bridgeableCount: bridgeable.length,
        blockedCount: blocked.length,
        bridgeable: bridgeable.slice(0, 40),
        blocked,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
