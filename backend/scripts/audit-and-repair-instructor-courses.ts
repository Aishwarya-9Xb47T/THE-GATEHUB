/**
 * Audit and Safe Repair Script for Instructor Course Ownership and Relationships
 *
 * Scans Courses, LearningUniverses, and LatexProjects for:
 * 1. Ownership desynchronization between Course and linked LearningUniverse
 * 2. Unlinked or orphaned courses
 * 3. LearningUniverses with missing instructorId
 * 4. Summary of draft vs published courses/universes per instructor
 *
 * Usage:
 *   npx tsx scripts/audit-and-repair-instructor-courses.ts [--repair] [--dry-run]
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface AuditReport {
  timestamp: string;
  isRepairMode: boolean;
  totalCourses: number;
  totalUniverses: number;
  totalProjects: number;
  ownershipMismatches: Array<{
    courseId: string;
    courseTitle: string;
    currentCourseInstructorId: string | null;
    universeId: string;
    universeTitle: string;
    universeInstructorId: string;
    repaired: boolean;
  }>;
  unownedCourses: Array<{
    courseId: string;
    courseTitle: string;
    status: string;
    possibleEvidence?: string;
  }>;
  unlinkedUniverses: Array<{
    universeId: string;
    title: string;
    instructorId: string;
    status: string;
    productType?: string;
  }>;
  instructorSummary: Record<string, { coursesCount: number; universesCount: number }>;
}

async function runAudit() {
  const args = process.argv.slice(2);
  const isRepairMode = args.includes("--repair");

  console.log(`\n======================================================`);
  console.log(`🔎 THE GATEHUB Instructor Course Ownership Audit`);
  console.log(`Mode: ${isRepairMode ? "⚠️  REPAIR MODE (Active Fixes Enabled)" : "🛡️  DRY RUN (Read Only)"}`);
  console.log(`======================================================\n`);

  try {
    const [courses, universes, projects] = await Promise.all([
      prisma.course.findMany({
        select: {
          id: true,
          title: true,
          status: true,
          instructorId: true,
          createdAt: true,
        },
      }),
      prisma.learningUniverse.findMany({
        select: {
          id: true,
          title: true,
          status: true,
          instructorId: true,
          structuredData: true,
          sourceProjectId: true,
          createdAt: true,
        },
      }),
      prisma.latexProject.findMany({
        select: {
          id: true,
          title: true,
          authorId: true,
        },
      }),
    ]);

    const report: AuditReport = {
      timestamp: new Date().toISOString(),
      isRepairMode,
      totalCourses: courses.length,
      totalUniverses: universes.length,
      totalProjects: projects.length,
      ownershipMismatches: [],
      unownedCourses: [],
      unlinkedUniverses: [],
      instructorSummary: {},
    };

    // Index courses by id
    const courseMap = new Map(courses.map((c) => [c.id, c]));

    // Check universe-linked course ownership
    for (const universe of universes) {
      // Summarize by instructor
      if (!report.instructorSummary[universe.instructorId]) {
        report.instructorSummary[universe.instructorId] = { coursesCount: 0, universesCount: 0 };
      }
      report.instructorSummary[universe.instructorId].universesCount++;

      const sd = universe.structuredData && typeof universe.structuredData === "object"
        ? (universe.structuredData as Record<string, unknown>)
        : {};

      const linkedCourseId = typeof sd.linkedCourseId === "string" ? sd.linkedCourseId : undefined;
      const productType = typeof sd.productType === "string" ? sd.productType : undefined;

      if (linkedCourseId) {
        const course = courseMap.get(linkedCourseId);
        if (course) {
          if (course.instructorId !== universe.instructorId) {
            let repaired = false;
            // Only auto-repair if the course was orphaned (no instructorId)
            if (!course.instructorId && isRepairMode) {
              await prisma.course.update({
                where: { id: course.id },
                data: { instructorId: universe.instructorId },
              });
              repaired = true;
              console.log(
                `[REPAIR] Aligned orphaned Course "${course.title}" (${course.id}) instructorId to ${universe.instructorId}`
              );
            } else if (course.instructorId && isRepairMode) {
              console.log(
                `[SAFETY LOCK] Course "${course.title}" (${course.id}) has existing instructor ${course.instructorId}. Not overwriting to universe owner ${universe.instructorId} without manual confirmation.`
              );
            }
            report.ownershipMismatches.push({
              courseId: course.id,
              courseTitle: course.title,
              currentCourseInstructorId: course.instructorId,
              universeId: universe.id,
              universeTitle: universe.title,
              universeInstructorId: universe.instructorId,
              repaired,
            });
          }
        }
      } else {
        report.unlinkedUniverses.push({
          universeId: universe.id,
          title: universe.title,
          instructorId: universe.instructorId,
          status: universe.status,
          productType,
        });
      }
    }

    // Inspect courses
    for (const course of courses) {
      if (course.instructorId) {
        if (!report.instructorSummary[course.instructorId]) {
          report.instructorSummary[course.instructorId] = { coursesCount: 0, universesCount: 0 };
        }
        report.instructorSummary[course.instructorId].coursesCount++;
      } else {
        // Course without instructorId
        const matchingUniverse = universes.find(
          (u) =>
            u.title.toLowerCase().trim() === course.title.toLowerCase().trim() ||
            (u.structuredData &&
              typeof u.structuredData === "object" &&
              (u.structuredData as any).linkedCourseId === course.id)
        );

        report.unownedCourses.push({
          courseId: course.id,
          courseTitle: course.title,
          status: course.status,
          possibleEvidence: matchingUniverse
            ? `Matches Universe "${matchingUniverse.title}" owned by ${matchingUniverse.instructorId}`
            : undefined,
        });
      }
    }

    console.log(`📊 Audit Summary:`);
    console.log(` - Total Courses in DB: ${report.totalCourses}`);
    console.log(` - Total Learning Universes: ${report.totalUniverses}`);
    console.log(` - Total LaTeX Projects: ${report.totalProjects}`);
    console.log(` - Ownership Desyncs Detected: ${report.ownershipMismatches.length}`);
    console.log(` - Unowned Courses: ${report.unownedCourses.length}`);
    console.log(` - Standalone / Unlinked Universes: ${report.unlinkedUniverses.length}`);

    if (report.ownershipMismatches.length > 0) {
      console.log(`\n⚠️  Ownership Desynchronizations:`);
      for (const m of report.ownershipMismatches) {
        console.log(
          `   - Course "${m.courseTitle}" (${m.courseId}) owned by ${m.currentCourseInstructorId ?? "NONE"} != Universe owner ${m.universeInstructorId} (${m.universeId}) [Repaired: ${m.repaired}]`
        );
      }
    }

    if (report.unownedCourses.length > 0) {
      console.log(`\n⚠️  Unowned Courses:`);
      for (const u of report.unownedCourses) {
        console.log(`   - "${u.courseTitle}" (${u.courseId}, status: ${u.status}) Evidence: ${u.possibleEvidence || "None"}`);
      }
    }

    console.log(`\n👨‍🏫 Instructor Course & Universe Breakdown:`);
    for (const [instructorId, counts] of Object.entries(report.instructorSummary)) {
      console.log(`   - Instructor ${instructorId}: ${counts.coursesCount} courses, ${counts.universesCount} universes`);
    }

    console.log(`\n✅ Audit complete.`);
    return report;
  } catch (error) {
    console.error("Audit failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.env.NODE_ENV !== "test") {
  runAudit().catch(() => process.exit(1));
}

export { runAudit };
