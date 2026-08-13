import { Response } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import {
  grantCourseEnrollment,
  hasCompletedCoursePayment,
} from "../services/enrollmentService.js";

export async function enroll(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const courseId = req.params.courseId;
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new AppError(404, "Course not found");
  if (course.status !== "published") throw new AppError(400, "Course is not available for enrollment");

  if (course.price > 0) {
    const paid = await hasCompletedCoursePayment(req.user.id, courseId);
    if (!paid) throw new AppError(402, "Payment required for this course");
  }

  const existing = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: req.user.id, courseId } },
  });
  if (existing) {
    return res.json({ success: true, enrollment: existing, alreadyEnrolled: true });
  }

  const enrollment = await grantCourseEnrollment(req.user.id, courseId);
  res.status(201).json({ success: true, enrollment });
}

export async function check(req: AuthRequest, res: Response) {
  if (!req.user) return res.json({ success: true, enrolled: false, paid: false });
  const courseId = req.params.courseId;
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { price: true } });
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: req.user.id, courseId } },
  });
  const payment = await prisma.payment.findFirst({
    where: { userId: req.user.id, courseId, status: "completed" },
  });
  const paid = !course || course.price === 0 || !!payment;
  res.json({ success: true, enrolled: !!enrollment, paid });
}

export async function myEnrollments(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { resolveCanonicalUniverseId } = await import("../services/learnerScopeService.js");

  const enrollments = await prisma.enrollment.findMany({
    where: { userId: req.user.id },
    include: {
      course: {
        include: {
          categoryRel: { select: { name: true, slug: true } },
          instructor: { select: { firstName: true, lastName: true } },
          sections: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              order: true,
              lectures: {
                orderBy: { order: "asc" },
                select: { id: true, duration: true, order: true },
              },
            },
          },
          _count: { select: { sections: true, enrollments: true } },
        },
      },
      progress: {
        include: {
          lectureProgress: {
            select: { lectureId: true, completed: true, updatedAt: true, progressPercent: true },
          },
        },
      },
    },
    orderBy: { enrolledAt: "desc" },
  });

  const enriched = await Promise.all(
    enrollments.map(async (e) => {
      const lectures = e.course.sections.flatMap((s) => s.lectures);
      let lessonCount = lectures.length;
      let moduleCount = e.course.sections.length;
      let completedLessons = e.progress?.lectureProgress.filter((lp) => lp.completed).length ?? 0;
      const durationMinutes = lectures.reduce((sum, l) => sum + (l.duration || 0), 0);
      let estimatedHours =
        durationMinutes > 0 ? Math.round((durationMinutes / 60) * 10) / 10 : null;
      let percent = e.progress?.percent ?? 0;
      let isCompleted = e.isCompleted || percent === 100;
      let completedAt = e.completedAt;
      let lastAccessed = e.progress?.lastAccessed ?? null;
      let continueUrl = `/student/course/${e.course.id}/learn`;
      let learningUniverseId: string | null = null;
      let downloadTarget: "course" | "learning-universe" = "course";
      let hasCertificate = false;

      // Architect / premium courses store real curriculum on Learning Universe — prefer that SOT.
      const luId = await resolveCanonicalUniverseId(e.course.id);
      if (luId) {
        learningUniverseId = luId;
        downloadTarget = "learning-universe";
        const { getCanonicalLuProgressForUser } = await import("../services/canonicalLuProgress.js");
        const { ensureLinkedLearningUniverseEnrollment } = await import("../services/enrollmentService.js");
        await ensureLinkedLearningUniverseEnrollment(req.user!.id, e.course.id);

        const lu = await prisma.learningUniverse.findUnique({
          where: { id: luId },
          select: {
            tracks: {
              select: {
                modules: {
                  select: {
                    estimatedHours: true,
                    lessons: { select: { id: true } },
                  },
                },
              },
            },
          },
        });
        if (lu) {
          const modules = lu.tracks.flatMap((t) => t.modules);
          const lessons = modules.flatMap((m) => m.lessons);
          if (lessons.length > 0) {
            moduleCount = modules.length;
            lessonCount = lessons.length;
            const hoursSum = modules.reduce((sum, m) => sum + (m.estimatedHours || 0), 0);
            if (hoursSum > 0) estimatedHours = hoursSum;
          }

          const luProgress = await getCanonicalLuProgressForUser(req.user!.id, luId, {
            courseId: e.course.id,
          });
          if (luProgress) {
            completedLessons = luProgress.completedLessons;
            percent = luProgress.percentComplete;
            isCompleted = luProgress.isCompleted;
            completedAt = luProgress.completedAt || completedAt;
            lastAccessed = luProgress.lastAccessed ?? lastAccessed;
            continueUrl = luProgress.continueUrl;
            hasCertificate = luProgress.hasActiveCertificate;
          } else if (lessons.length > 0) {
            const { buildStudentLuLearnUrl } = await import("../services/canonicalLuProgress.js");
            continueUrl = buildStudentLuLearnUrl(luId, lessons[0].id);
          } else {
            const { buildStudentLuLearnUrl } = await import("../services/canonicalLuProgress.js");
            continueUrl = buildStudentLuLearnUrl(luId);
          }
        }
      } else {
        const lectureOrder = lectures.map((l) => l.id);
        const completedSet = new Set(
          (e.progress?.lectureProgress || []).filter((lp) => lp.completed).map((lp) => lp.lectureId)
        );
        const nextLectureId = lectureOrder.find((id) => !completedSet.has(id)) || null;
        const lastTouched = (e.progress?.lectureProgress || [])
          .slice()
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
        const continueLectureId = isCompleted
          ? lectureOrder[0] || null
          : nextLectureId || lastTouched?.lectureId || lectureOrder[0] || null;
        continueUrl = continueLectureId
          ? `/student/course/${e.course.id}/learn?lecture=${continueLectureId}`
          : `/student/course/${e.course.id}/learn`;
      }

      const { sections: _sections, ...courseRest } = e.course;
      return {
        ...e,
        isCompleted,
        completedAt,
        course: {
          ...courseRest,
          category: e.course.categoryRel,
          moduleCount,
          lessonCount,
          completedLessons,
          estimatedHours,
          durationMinutes,
          learningUniverseId,
          productType: e.course.price > 0 ? "premium-course" : "free-course",
        },
        progress: {
          percent,
          lastAccessed,
          completedLessons,
          totalLessons: lessonCount,
        },
        continueUrl,
        canDownload: isCompleted,
        hasCertificate,
        downloadTarget,
        downloadId: downloadTarget === "learning-universe" && learningUniverseId ? learningUniverseId : e.course.id,
      };
    })
  );

  res.json({ success: true, enrollments: enriched });
}

export async function getProgress(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const courseId = req.params.courseId;
  console.log("Enrollment progress request received:", courseId, "User:", req.user.id);
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: req.user.id, courseId } },
    include: {
      progress: {
        include: {
          lectureProgress: { select: { lectureId: true, completed: true } },
        },
      },
      course: {
        include: {
          sections: {
            orderBy: { order: "asc" },
            include: { lectures: { orderBy: { order: "asc" }, include: { attachments: true } } },
          },
        },
      },
    },
  });
  if (!enrollment) throw new AppError(404, "Not enrolled");

  // LU-backed courses: surface canonical LU percent without deleting CourseProgress history
  const { getCanonicalProgressForCourseEnrollment } = await import("../services/canonicalLuProgress.js");
  const luProgress = await getCanonicalProgressForCourseEnrollment(req.user.id, courseId);
  if (luProgress) {
    return res.json({
      success: true,
      enrollment: {
        ...enrollment,
        isCompleted: luProgress.isCompleted,
        completedAt: luProgress.completedAt,
      },
      progress: {
        ...(enrollment.progress || {}),
        percent: luProgress.percentComplete,
        lastAccessed: luProgress.lastAccessed,
        learningUniverseId: luProgress.learningUniverseId,
        lastLessonId: luProgress.lastLessonId,
        lastStepId: luProgress.lastStepId,
        completedLessons: luProgress.completedLessons,
        totalLessons: luProgress.totalLessons,
      },
      continueUrl: luProgress.continueUrl,
      source: "learning_universe",
    });
  }

  res.json({ success: true, enrollment, progress: enrollment.progress, source: "course" });
}

export async function updateLectureProgress(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const { courseId, lectureId } = req.params;
  const completed = req.body.completed === true;
  const progressPercent = typeof req.body.progressPercent === "number" ? req.body.progressPercent : 0;
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: req.user.id, courseId } },
    include: { progress: true },
  });
  if (!enrollment?.progress) throw new AppError(404, "Not enrolled");
  const lecture = await prisma.lecture.findUnique({ where: { id: lectureId } });
  if (!lecture) throw new AppError(404, "Lecture not found");
  await prisma.lectureProgress.upsert({
    where: {
      courseProgressId_lectureId: { courseProgressId: enrollment.progress.id, lectureId },
    },
    create: {
      courseProgressId: enrollment.progress.id,
      lectureId,
      completed,
      progressPercent,
      ...(completed ? { completedAt: new Date() } : {}),
    },
    update: {
      completed: completed || undefined,
      progressPercent,
      ...(completed ? { completedAt: new Date() } : {}),
    },
  });
  const allLectures = await prisma.lecture.findMany({
    where: { section: { courseId } },
    select: { id: true },
  });
  const completedCount = await prisma.lectureProgress.count({
    where: {
      courseProgressId: enrollment.progress.id,
      completed: true,
    },
  });
  const percent = allLectures.length ? Math.round((completedCount / allLectures.length) * 100) : 0;
  
  await prisma.courseProgress.update({
    where: { id: enrollment.progress.id },
    data: { percent, lastAccessed: new Date() },
  });

  // If 100% completed, update enrollment completion state
  if (percent === 100) {
    console.log(`[PROGRESS] Course ${courseId} completed by user ${req.user.id}. Setting isCompleted=true.`);
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        completedAt: new Date(),
        isCompleted: true
      }
    });
    const { tryAutoIssueCourseCertificate } = await import('../services/certificateEngineService.js');
    await tryAutoIssueCourseCertificate(req.user.id, courseId);
  }

  res.json({ success: true, percent, isCompleted: percent === 100 });
}

export async function getInstructorStudents(req: AuthRequest, res: Response) {
  if (!req.user || req.user.role !== "instructor") throw new AppError(403, "Forbidden");

  const enrollments = await prisma.enrollment.findMany({
    where: { course: { instructorId: req.user.id } },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
      course: {
        select: {
          id: true,
          title: true,
          thumbnail: true,
          status: true,
          averageRating: true,
          reviewCount: true,
        },
      },
      progress: true,
    },
    orderBy: { enrolledAt: "desc" },
  });

  const { getCanonicalProgressForCourseEnrollment, getCanonicalLuProgressForUser } = await import(
    "../services/canonicalLuProgress.js"
  );
  const { readStructuredRecord } = await import("../services/productRoutingService.js");

  const groupedData: Record<string, any> = {};
  const coveredLuUserKeys = new Set<string>();

  for (const en of enrollments) {
    const courseId = en.course.id;
    if (!groupedData[courseId]) {
      groupedData[courseId] = {
        courseTitle: en.course.title,
        courseId: en.course.id,
        courseThumbnail: en.course.thumbnail,
        courseStatus: en.course.status,
        courseRating: en.course.averageRating,
        courseReviewCount: en.course.reviewCount,
        students: [],
      };
    }

    const luProgress = await getCanonicalProgressForCourseEnrollment(en.user.id, courseId);
    const progress = luProgress?.percentComplete ?? en.progress?.percent ?? 0;
    const isCompleted = luProgress?.isCompleted ?? en.isCompleted ?? progress === 100;
    if (luProgress?.learningUniverseId) {
      coveredLuUserKeys.add(`${luProgress.learningUniverseId}:${en.user.id}`);
    }

    groupedData[courseId].students.push({
      id: en.user.id,
      name: `${en.user.firstName} ${en.user.lastName}`,
      email: en.user.email,
      avatar: en.user.avatar,
      enrolledAt: en.enrolledAt,
      progress,
      isCompleted,
      completedLessons: luProgress?.completedLessons ?? null,
      totalLessons: luProgress?.totalLessons ?? null,
      lastAccessed: luProgress?.lastAccessed ?? en.progress?.lastAccessed ?? null,
      hasCertificate: luProgress?.hasActiveCertificate ?? false,
      learningUniverseId: luProgress?.learningUniverseId ?? null,
      progressSource: luProgress ? "learning_universe" : "course",
      enrollmentSource: "course",
    });
  }

  // Include LU-only enrollments for instructor-owned universes (no classic Course row).
  const luEnrollments = await prisma.learningUniverseEnrollment.findMany({
    where: { learningUniverse: { instructorId: req.user.id } },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
      learningUniverse: {
        select: {
          id: true,
          title: true,
          thumbnail: true,
          status: true,
          structuredData: true,
        },
      },
      progress: true,
    },
    orderBy: { enrolledAt: "desc" },
  });

  for (const en of luEnrollments) {
    const key = `${en.learningUniverseId}:${en.userId}`;
    if (coveredLuUserKeys.has(key)) continue;

    const sd = readStructuredRecord(en.learningUniverse.structuredData);
    const linkedCourseId = typeof sd.linkedCourseId === "string" ? sd.linkedCourseId : null;
    // If a Course enrollment already covers this user+course, skip (handled above).
    if (linkedCourseId && groupedData[linkedCourseId]?.students.some((s: { id: string }) => s.id === en.userId)) {
      continue;
    }

    const groupKey = linkedCourseId && groupedData[linkedCourseId] ? linkedCourseId : `lu:${en.learningUniverseId}`;
    if (!groupedData[groupKey]) {
      groupedData[groupKey] = {
        courseTitle: en.learningUniverse.title,
        courseId: linkedCourseId || en.learningUniverse.id,
        courseThumbnail: en.learningUniverse.thumbnail,
        courseStatus: en.learningUniverse.status,
        courseRating: null,
        courseReviewCount: 0,
        learningUniverseId: en.learningUniverse.id,
        students: [],
      };
    }

    const luProgress = await getCanonicalLuProgressForUser(en.userId, en.learningUniverseId);
    const progress = luProgress?.percentComplete ?? en.progress?.percentComplete ?? 0;
    const isCompleted = luProgress?.isCompleted ?? en.isCompleted ?? progress === 100;

    groupedData[groupKey].students.push({
      id: en.user.id,
      name: `${en.user.firstName} ${en.user.lastName}`,
      email: en.user.email,
      avatar: en.user.avatar,
      enrolledAt: en.enrolledAt,
      progress,
      isCompleted,
      completedLessons: luProgress?.completedLessons ?? null,
      totalLessons: luProgress?.totalLessons ?? null,
      lastAccessed: luProgress?.lastAccessed ?? en.progress?.lastAccessed ?? null,
      hasCertificate: luProgress?.hasActiveCertificate ?? false,
      learningUniverseId: en.learningUniverseId,
      progressSource: "learning_universe",
      enrollmentSource: "learning_universe",
    });
  }

  res.json({ success: true, courses: Object.values(groupedData) });
}
