import { isAdminRole } from "../utils/roles.js";
import { Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";

export async function getInstructorAnalytics(req: AuthRequest, res: Response) {
  if (!req.user || (req.user.role !== "instructor" && !isAdminRole(req.user.role))) {
    throw new AppError(403, "Forbidden");
  }

  const instructorId = req.user.id;

  const totalCourses = await prisma.course.count({ where: { instructorId } });
  const totalLearningUniverses = await prisma.learningUniverse.count({
    where: { instructorId, status: "published" },
  });

  const instructorCourses = await prisma.course.findMany({
    where: { instructorId },
    select: {
      id: true,
      price: true,
      averageRating: true,
      reviewCount: true,
      _count: { select: { enrollments: true } },
    },
  });

  let courseEnrollments = 0;
  let courseRevenue = 0;
  let totalRatingSum = 0;
  let totalRatingCount = 0;

  for (const course of instructorCourses) {
    const enrolls = course._count.enrollments;
    courseEnrollments += enrolls;
    courseRevenue += enrolls * course.price;

    if (course.averageRating > 0 && course.reviewCount > 0) {
      totalRatingSum += course.averageRating * course.reviewCount;
      totalRatingCount += course.reviewCount;
    }
  }

  const [
    luEnrollments,
    luCompletions,
    luCertificates,
    luPaymentAgg,
    pendingSubmissions,
    approvedSubmissions,
    rejectedSubmissions,
    gradedSubmissions,
    reviewedSubmissions,
    totalSubmissions,
  ] = await Promise.all([
    prisma.learningUniverseEnrollment.count({
      where: { learningUniverse: { instructorId } },
    }),
    prisma.learningUniverseEnrollment.count({
      where: { learningUniverse: { instructorId }, isCompleted: true },
    }),
    prisma.learningUniverseCertificate.count({
      where: { learningUniverse: { instructorId } },
    }),
    prisma.payment.aggregate({
      where: {
        learningUniverse: { instructorId },
        status: "completed",
      },
      _sum: { amount: true, instructorEarning: true },
    }),
    prisma.learningUniverseProjectSubmission.count({
      where: {
        status: { in: ["pending", "submitted"] },
        project: { lesson: { module: { track: { learningUniverse: { instructorId } } } } },
      },
    }),
    prisma.learningUniverseProjectSubmission.count({
      where: {
        status: "approved",
        project: { lesson: { module: { track: { learningUniverse: { instructorId } } } } },
      },
    }),
    prisma.learningUniverseProjectSubmission.count({
      where: {
        status: "rejected",
        project: { lesson: { module: { track: { learningUniverse: { instructorId } } } } },
      },
    }),
    prisma.learningUniverseProjectSubmission.findMany({
      where: {
        grade: { not: null },
        project: { lesson: { module: { track: { learningUniverse: { instructorId } } } } },
      },
      select: { grade: true },
    }),
    prisma.learningUniverseProjectSubmission.count({
      where: {
        reviewedAt: { not: null },
        project: { lesson: { module: { track: { learningUniverse: { instructorId } } } } },
      },
    }),
    prisma.learningUniverseProjectSubmission.count({
      where: {
        project: { lesson: { module: { track: { learningUniverse: { instructorId } } } } },
      },
    }),
  ]);

  const averageProjectGrade =
    gradedSubmissions.length > 0
      ? Number(
          (
            gradedSubmissions.reduce((sum, s) => sum + (s.grade ?? 0), 0) /
            gradedSubmissions.length
          ).toFixed(1)
        )
      : 0;
  const reviewCompletionRate =
    totalSubmissions > 0
      ? Math.round((reviewedSubmissions / totalSubmissions) * 100)
      : 0;

  const luRevenue =
    luPaymentAgg._sum.instructorEarning ?? luPaymentAgg._sum.amount ?? 0;
  const totalRevenue = courseRevenue + luRevenue;
  const totalEnrollments = courseEnrollments + luEnrollments;
  const averageRating =
    totalRatingCount > 0 ? Number((totalRatingSum / totalRatingCount).toFixed(1)) : 0;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const [recentCourseEnrollments, recentLuEnrollments] = await Promise.all([
    prisma.enrollment.findMany({
      where: { course: { instructorId }, enrolledAt: { gte: sevenDaysAgo } },
      select: { enrolledAt: true },
    }),
    prisma.learningUniverseEnrollment.findMany({
      where: { learningUniverse: { instructorId }, enrolledAt: { gte: sevenDaysAgo } },
      select: { enrolledAt: true },
    }),
  ]);

  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const engagementMap = new Map<string, number>();

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    engagementMap.set(daysOfWeek[d.getDay()], 0);
  }

  [...recentCourseEnrollments, ...recentLuEnrollments].forEach((e) => {
    const dayName = daysOfWeek[e.enrolledAt.getDay()];
    if (engagementMap.has(dayName)) {
      engagementMap.set(dayName, engagementMap.get(dayName)! + 1);
    }
  });

  const engagementData = Array.from(engagementMap.entries()).map(([name, activeStudents]) => ({
    name,
    activeStudents,
  }));

  res.json({
    success: true,
    stats: {
      totalCourses,
      totalLearningUniverses,
      courseEnrollments,
      luEnrollments,
      luCompletions,
      luCertificates,
      luRevenue,
      pendingSubmissions,
      approvedSubmissions,
      rejectedSubmissions,
      averageProjectGrade,
      reviewCompletionRate,
      totalEnrollments,
      totalRevenue,
      averageRating: averageRating > 0 ? averageRating : "N/A",
    },
    revenueData: [],
    engagementData,
  });
}
