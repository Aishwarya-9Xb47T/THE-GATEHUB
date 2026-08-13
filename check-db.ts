
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Verifying Database Contents...\n");

  const [
    totalCourses,
    publishedCourses,
    draftCourses,
    totalLearningUniverses,
    publishedLU,
    draftLU,
    totalEnrollments,
    instructors,
  ] = await Promise.all([
    prisma.course.count(),
    prisma.course.count({ where: { status: "published" } }),
    prisma.course.count({ where: { status: "draft" } }),
    prisma.learningUniverse.count(),
    prisma.learningUniverse.count({ where: { status: "published" } }),
    prisma.learningUniverse.count({ where: { status: "draft" } }),
    prisma.enrollment.count() + prisma.learningUniverseEnrollment.count(),
    prisma.user.findMany({
      where: {
        role: { in: ["instructor", "admin", "super_admin"] },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    }),
  ]);

  console.log("📊 Database Contains:");
  console.log(`  Courses = ${totalCourses}`);
  console.log(`    Published = ${publishedCourses}`);
  console.log(`    Draft = ${draftCourses}`);
  console.log(`\n  Learning Universes = ${totalLearningUniverses}`);
  console.log(`    Published = ${publishedLU}`);
  console.log(`    Draft = ${draftLU}`);
  console.log(`\n  Enrollments = ${totalEnrollments}`);
  console.log(`\n  Instructors = ${instructors.length}`);
  instructors.forEach((inst) => {
    console.log(`    ID: ${inst.id} | ${inst.firstName} ${inst.lastName} | ${inst.email}`);
  });

  // List sample courses
  console.log("\n📚 Sample Courses (first 5):");
  const sampleCourses = await prisma.course.findMany({
    take: 5,
    select: {
      id: true,
      title: true,
      status: true,
      instructorId: true,
    },
  });
  sampleCourses.forEach((course) => {
    console.log(`  - [${course.id}] ${course.title} (${course.status}) by ${course.instructorId}`);
  });

  // List sample learning universes
  console.log("\n🌌 Sample Learning Universes (first 5):");
  const sampleLU = await prisma.learningUniverse.findMany({
    take: 5,
    select: {
      id: true,
      title: true,
      status: true,
      instructorId: true,
    },
  });
  sampleLU.forEach((lu) => {
    console.log(`  - [${lu.id}] ${lu.title} (${lu.status}) by ${lu.instructorId}`);
  });
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });

