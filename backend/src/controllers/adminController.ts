import { Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { isSuperAdminRole, ROLES } from "../utils/roles.js";
import { logAuditEvent, AUDIT_ACTIONS, getClientIp } from "../services/auditLogService.js";

const updateUserSchema = z.object({
  role: z.enum(["student", "instructor", "admin"]).optional(),
  suspended: z.boolean().optional(),
});

const updateCourseStatusSchema = z.object({
  status: z.enum(["draft", "published", "archived"]),
});

const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

function assertCanManageUser(actor: AuthRequest["user"], targetRole: string, newRole?: string) {
  if (!actor) throw new AppError(401, "Authentication required");

  if (targetRole === ROLES.SUPER_ADMIN) {
    throw new AppError(403, "Cannot modify super admin accounts");
  }

  if (!isSuperAdminRole(actor.role)) {
    if (targetRole === ROLES.ADMIN || newRole === ROLES.ADMIN) {
      throw new AppError(403, "Only super admins can manage admin accounts");
    }
  }
}

export async function dashboard(_req: AuthRequest, res: Response) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    totalStudents,
    totalInstructors,
    totalAdmins,
    totalCourses,
    publishedCourses,
    draftCourses,
    archivedCourses,
    totalLearningUniverses,
    publishedLearningUniverses,
    draftLearningUniverses,
    totalEnrollments,
    totalLuEnrollments,
    totalPayments,
    totalRevenue,
    platformRevenue,
    instructorRevenue,
    monthlyRevenue,
    courseSales,
    luSales,
    projectSubmissions,
    projectsReviewed,
    certificatesIssued,
    luCertificatesIssued,
    dailyActiveUsers,
    weeklyActiveUsers,
    reviewCount,
    recentUsers,
    recentCourses,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { role: "student", deletedAt: null } }),
    prisma.user.count({ where: { role: "instructor", deletedAt: null } }),
    prisma.user.count({ where: { role: { in: ["admin", "super_admin"] }, deletedAt: null } }),
    prisma.course.count(),
    prisma.course.count({ where: { status: "published" } }),
    prisma.course.count({ where: { status: "draft" } }),
    prisma.course.count({ where: { status: "archived" } }),
    prisma.learningUniverse.count(),
    prisma.learningUniverse.count({ where: { status: "published" } }),
    prisma.learningUniverse.count({ where: { status: "draft" } }),
    prisma.enrollment.count(),
    prisma.learningUniverseEnrollment.count(),
    prisma.payment.count({ where: { status: "completed" } }),
    prisma.payment.aggregate({ where: { status: "completed" }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { status: "completed" }, _sum: { platformFee: true } }),
    prisma.payment.aggregate({ where: { status: "completed" }, _sum: { instructorEarning: true } }),
    prisma.payment.aggregate({ where: { status: "completed", createdAt: { gte: startOfMonth } }, _sum: { amount: true } }),
    prisma.payment.count({ where: { status: "completed", productType: "course" } }),
    prisma.payment.count({ where: { status: "completed", productType: "learning_universe" } }),
    prisma.learningUniverseProjectSubmission.count(),
    prisma.learningUniverseProjectSubmission.count({ where: { status: { not: "pending" } } }),
    prisma.certificate.count(),
    prisma.learningUniverseCertificate.count(),
    prisma.user.count({ where: { lastLoginAt: { gte: oneDayAgo }, deletedAt: null } }),
    prisma.user.count({ where: { lastLoginAt: { gte: sevenDaysAgo }, deletedAt: null } }),
    prisma.review.count(),
    prisma.user.findMany({
      take: 5,
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true },
    }),
    prisma.course.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { instructor: { select: { firstName: true, lastName: true } }, categoryRel: { select: { name: true } } },
    }),
  ]);

  res.json({
    success: true,
    stats: {
      userCount: totalUsers,
      totalStudents,
      totalInstructors,
      totalAdmins,
      courseCount: totalCourses,
      publishedCourses,
      draftCourses,
      archivedCourses,
      totalLearningUniverses,
      publishedLearningUniverses,
      draftLearningUniverses,
      enrollmentCount: totalEnrollments + totalLuEnrollments,
      totalPayments,
      totalRevenue: totalRevenue._sum.amount ?? 0,
      platformRevenue: platformRevenue._sum.platformFee ?? 0,
      instructorRevenue: instructorRevenue._sum.instructorEarning ?? 0,
      monthlyRevenue: monthlyRevenue._sum.amount ?? 0,
      activeUsers: weeklyActiveUsers,
      dailyActiveUsers,
      weeklyActiveUsers,
      courseSales,
      learningUniverseSales: luSales,
      projectSubmissions,
      projectsReviewed,
      certificatesIssued: certificatesIssued + luCertificatesIssued,
      reviewCount,
    },
    recentUsers,
    recentCourses,
  });
}

export async function listUsers(req: AuthRequest, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const roleFilter = typeof req.query.role === "string" ? req.query.role : undefined;
  const includeDeleted = req.query.includeDeleted === "true" && isSuperAdminRole(req.user?.role);
  const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;

  const where: Record<string, unknown> = {};
  if (!includeDeleted) where.deletedAt = null;
  if (roleFilter && ["student", "instructor", "admin", "super_admin"].includes(roleFilter)) {
    where.role = roleFilter;
  }
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        suspended: true,
        deletedAt: true,
        createdAt: true,
        lastLoginAt: true,
        _count: {
          select: {
            enrollments: true,
            luEnrollments: true,
            payments: true,
            certificates: true,
            luCertificates: true,
            luProjectSubmissions: true,
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ success: true, users, total, page, limit });
}

export async function getUserDetail(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      suspended: true,
      deletedAt: true,
      createdAt: true,
      lastLoginAt: true,
      enrollments: {
        include: { course: { select: { id: true, title: true } } },
        orderBy: { enrolledAt: "desc" },
        take: 20,
      },
      luEnrollments: {
        include: { learningUniverse: { select: { id: true, title: true } } },
        orderBy: { enrolledAt: "desc" },
        take: 20,
      },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, amount: true, status: true, productType: true, createdAt: true },
      },
      certificates: {
        include: { course: { select: { title: true } } },
        take: 10,
      },
      luCertificates: {
        include: { learningUniverse: { select: { title: true } } },
        take: 10,
      },
      luProjectSubmissions: {
        orderBy: { submittedAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          grade: true,
          submittedAt: true,
          reviewedAt: true,
          project: { select: { title: true } },
        },
      },
      quizAttempts: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, score: true, totalMarks: true, createdAt: true, quiz: { select: { title: true } } },
      },
    },
  });

  if (!user) throw new AppError(404, "User not found");
  res.json({ success: true, user });
}

export async function updateUser(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const data = updateUserSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "User not found");

  assertCanManageUser(req.user, existing.role, data.role);

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, firstName: true, lastName: true, role: true, suspended: true },
  });

  if (data.suspended !== undefined && req.user) {
    await logAuditEvent({
      adminId: req.user.id,
      action: data.suspended ? AUDIT_ACTIONS.USER_SUSPENDED : AUDIT_ACTIONS.USER_UNSUSPENDED,
      targetId: id,
      targetType: "user",
      ipAddress: getClientIp(req),
    });
  }

  if (data.role && data.role !== existing.role && req.user) {
    const action =
      data.role === "instructor"
        ? AUDIT_ACTIONS.INSTRUCTOR_PROMOTED
        : data.role === "student" && existing.role === "instructor"
          ? AUDIT_ACTIONS.INSTRUCTOR_DEMOTED
          : data.role === "admin"
            ? AUDIT_ACTIONS.ADMIN_PROMOTED
            : AUDIT_ACTIONS.ADMIN_DEMOTED;
    await logAuditEvent({
      adminId: req.user.id,
      action,
      targetId: id,
      targetType: "user",
      details: { from: existing.role, to: data.role },
      ipAddress: getClientIp(req),
    });
  }

  res.json({ success: true, user });
}

export async function deleteUser(req: AuthRequest, res: Response) {
  if (!isSuperAdminRole(req.user?.role)) throw new AppError(403, "Super admin access required");

  const id = req.params.id;
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "User not found");
  if (existing.role === ROLES.SUPER_ADMIN) throw new AppError(403, "Cannot delete super admin");

  await prisma.user.update({ where: { id }, data: { deletedAt: new Date(), suspended: true } });

  if (req.user) {
    await logAuditEvent({
      adminId: req.user.id,
      action: AUDIT_ACTIONS.USER_DELETED,
      targetId: id,
      targetType: "user",
      ipAddress: getClientIp(req),
    });
  }

  res.json({ success: true, message: "User deleted (soft)" });
}

export async function restoreUser(req: AuthRequest, res: Response) {
  if (!isSuperAdminRole(req.user?.role)) throw new AppError(403, "Super admin access required");

  const id = req.params.id;
  const user = await prisma.user.update({
    where: { id },
    data: { deletedAt: null, suspended: false },
    select: { id: true, email: true, role: true, deletedAt: true },
  });

  if (req.user) {
    await logAuditEvent({
      adminId: req.user.id,
      action: AUDIT_ACTIONS.USER_RESTORED,
      targetId: id,
      targetType: "user",
      ipAddress: getClientIp(req),
    });
  }

  res.json({ success: true, user });
}

export async function listCoursesAdmin(req: AuthRequest, res: Response) {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const where = status ? { status: status as "draft" | "published" | "archived" } : {};
  const courses = await prisma.course.findMany({
    where,
    include: {
      instructor: { select: { id: true, firstName: true, lastName: true, email: true } },
      categoryRel: { select: { name: true } },
      product: {
        select: {
          id: true,
          displayName: true,
          published: true,
          visible: true,
          price: true,
          learningUniverseId: true,
        },
      },
      _count: { select: { enrollments: true, sections: true } },
      sections: { select: { id: true, _count: { select: { lectures: true } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const courseIds = courses.map((c) => c.id);
  const { resolveCanonicalUniverseId } = await import("../services/learnerScopeService.js");
  const luIdsByCourse = new Map<string, string | null>();
  await Promise.all(
    courseIds.map(async (cid) => {
      luIdsByCourse.set(cid, await resolveCanonicalUniverseId(cid));
    })
  );
  const luIds = [...new Set([...luIdsByCourse.values()].filter(Boolean))] as string[];
  const lus = luIds.length
    ? await prisma.learningUniverse.findMany({
        where: { id: { in: luIds } },
        select: {
          id: true,
          title: true,
          status: true,
          _count: { select: { enrollments: true } },
          tracks: { select: { modules: { select: { lessons: { select: { id: true } } } } } },
        },
      })
    : [];
  const luMap = new Map(lus.map((u) => [u.id, u]));

  const [paymentStats, completedCounts] = await Promise.all([
    prisma.payment.groupBy({
      by: ["courseId"],
      where: { courseId: { in: courseIds }, status: "completed" },
      _sum: { amount: true, platformFee: true, instructorEarning: true },
      _count: true,
    }),
    prisma.enrollment.groupBy({
      by: ["courseId"],
      where: { courseId: { in: courseIds }, isCompleted: true },
      _count: true,
    }),
  ]);

  const paymentMap = new Map(paymentStats.map((p) => [p.courseId, p]));
  const completedMap = new Map(completedCounts.map((c) => [c.courseId, c._count]));

  const enriched = courses.map((c) => {
    const payments = paymentMap.get(c.id);
    const completed = completedMap.get(c.id) ?? 0;
    const enrollments = c._count.enrollments;
    const luId = luIdsByCourse.get(c.id);
    const lu = luId ? luMap.get(luId) : null;
    const lessonCount =
      lu?.tracks.flatMap((t) => t.modules.flatMap((m) => m.lessons)).length ??
      c.sections.reduce((sum, s) => sum + s._count.lectures, 0);
    const moduleCount = lu?.tracks.flatMap((t) => t.modules).length ?? c._count.sections;
    const { sections: _sections, ...rest } = c;
    return {
      ...rest,
      revenue: payments?._sum.amount ?? 0,
      platformFee: payments?._sum.platformFee ?? 0,
      instructorEarning: payments?._sum.instructorEarning ?? 0,
      paymentCount: payments?._count ?? 0,
      completedEnrollments: completed,
      completionRate: enrollments > 0 ? Math.round((completed / enrollments) * 100) : 0,
      learningUniverseId: luId,
      learningUniverse: lu
        ? { id: lu.id, title: lu.title, status: lu.status, enrollments: lu._count.enrollments }
        : null,
      moduleCount,
      lessonCount,
      createdAt: (c as { createdAt: Date }).createdAt,
      updatedAt: (c as { updatedAt: Date }).updatedAt,
      certificateAvailability: Boolean(luId),
    };
  });

  res.json({ success: true, courses: enriched });
}

export async function listLearningUniversesAdmin(_req: AuthRequest, res: Response) {
  const status = typeof _req.query.status === "string" ? _req.query.status : undefined;
  const where = status ? { status } : {};
  const universes = await prisma.learningUniverse.findMany({
    where,
    include: {
      instructor: { select: { id: true, firstName: true, lastName: true, email: true } },
      categoryRel: { select: { name: true } },
      _count: { select: { enrollments: true, certificates: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const luIds = universes.map((u) => u.id);
  const [paymentStats, progressStats] = await Promise.all([
    prisma.payment.groupBy({
      by: ["learningUniverseId"],
      where: { learningUniverseId: { in: luIds }, status: "completed" },
      _sum: { amount: true, platformFee: true, instructorEarning: true },
      _count: true,
    }),
    prisma.learningUniverseProgress.findMany({
      where: { enrollment: { learningUniverseId: { in: luIds } } },
      select: { percentComplete: true, enrollment: { select: { learningUniverseId: true } } },
    }),
  ]);

  const paymentMap = new Map(paymentStats.map((p) => [p.learningUniverseId, p]));

  const avgProgressMap = new Map<string, { total: number; count: number }>();
  for (const p of progressStats) {
    const luId = p.enrollment.learningUniverseId;
    const entry = avgProgressMap.get(luId) ?? { total: 0, count: 0 };
    entry.total += p.percentComplete;
    entry.count += 1;
    avgProgressMap.set(luId, entry);
  }

  const enriched = universes.map((u) => {
    const payments = paymentMap.get(u.id);
    const progress = avgProgressMap.get(u.id);
    const avgProgress = progress && progress.count > 0 ? Math.round(progress.total / progress.count) : 0;
    return {
      ...u,
      revenue: payments?._sum.amount ?? 0,
      platformFee: payments?._sum.platformFee ?? 0,
      instructorEarning: payments?._sum.instructorEarning ?? 0,
      paymentCount: payments?._count ?? 0,
      avgProgress,
    };
  });

  res.json({ success: true, learningUniverses: enriched });
}

const updateLearningUniverseStatusSchema = z.object({
  status: z.enum(["draft", "published", "archived"]),
});

export async function updateLearningUniverseStatus(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const { status } = updateLearningUniverseStatusSchema.parse(req.body);
  const existing = await prisma.learningUniverse.findUnique({
    where: { id },
    select: { id: true, status: true, structuredData: true },
  });
  if (!existing) throw new AppError(404, "Learning Universe not found");

  const universe = await prisma.learningUniverse.update({
    where: { id },
    data: {
      status,
      ...(status === "published" ? { publishedAt: new Date() } : {}),
      ...(status !== "published" ? { publishedAt: null } : {}),
    },
    select: { id: true, title: true, status: true, publishedAt: true },
  });

  // Keep Product (+ linked Course when applicable) in sync with catalog rules.
  const { syncCatalogOnPublish, syncCatalogOnUnpublish, readStructuredRecord } = await import(
    "../services/productRoutingService.js"
  );
  const { syncProductFromLearningUniverse, syncProductOnUnpublish } = await import(
    "../services/productCatalogService.js"
  );
  if (status === "published") {
    await syncCatalogOnPublish(id).catch(() => {});
    await syncProductFromLearningUniverse(id).catch(() => {});
  } else {
    await syncCatalogOnUnpublish(id).catch(() => {});
    await syncProductOnUnpublish({ learningUniverseId: id }).catch(() => {});
    const linkedCourseId = readStructuredRecord(existing.structuredData).linkedCourseId;
    if (typeof linkedCourseId === "string" && (status === "draft" || status === "archived")) {
      await prisma.course
        .updateMany({
          where: { id: linkedCourseId, status: "published" },
          data: { status: status === "archived" ? "archived" : "draft", publishedAt: null },
        })
        .catch(() => {});
      await syncProductOnUnpublish({ courseId: linkedCourseId }).catch(() => {});
    }
  }

  res.json({ success: true, learningUniverse: universe });
}

export async function updateCourseStatus(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const { status } = updateCourseStatusSchema.parse(req.body);
  const existing = await prisma.course.findUnique({
    where: { id },
    select: { id: true, instructorId: true, status: true },
  });
  if (!existing) throw new AppError(404, "Course not found");

  const course = await prisma.course.update({
    where: { id },
    data: {
      status,
      ...(status === "published" ? { publishedAt: new Date() } : {}),
      ...(status !== "published" ? { publishedAt: null } : {}),
    },
  });

  const { syncPremiumUniverseStatusFromCourse } = await import("../services/productRoutingService.js");
  const { syncProductFromCourse, syncProductOnUnpublish } = await import(
    "../services/productCatalogService.js"
  );
  if (status === "published" || status === "draft") {
    await syncPremiumUniverseStatusFromCourse(id, status, existing.instructorId).catch(() => {});
  }
  if (status === "published") {
    await syncProductFromCourse(id).catch(() => {});
  } else {
    // draft + archived both hide from student catalog
    await syncProductOnUnpublish({ courseId: id }).catch(() => {});
    if (status === "archived") {
      await syncPremiumUniverseStatusFromCourse(id, "draft", existing.instructorId).catch(() => {});
    }
  }

  res.json({ success: true, course });
}

/** Impact preview before archive/delete — never destroys certificates or historical results. */
export async function getCourseDeletionImpact(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const course = await prisma.course.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      instructor: { select: { firstName: true, lastName: true, email: true } },
      product: { select: { id: true, displayName: true, published: true, visible: true } },
      _count: { select: { enrollments: true, reviews: true, certificates: true } },
    },
  });
  if (!course) throw new AppError(404, "Course not found");

  const { resolveCanonicalUniverseId } = await import("../services/learnerScopeService.js");
  const luId = await resolveCanonicalUniverseId(id);
  let learningUniverse: {
    id: string;
    title: string;
    status: string;
    enrollments: number;
    certificates: number;
  } | null = null;
  if (luId) {
    const lu = await prisma.learningUniverse.findUnique({
      where: { id: luId },
      select: {
        id: true,
        title: true,
        status: true,
        _count: { select: { enrollments: true, certificates: true } },
      },
    });
    if (lu) {
      learningUniverse = {
        id: lu.id,
        title: lu.title,
        status: lu.status,
        enrollments: lu._count.enrollments,
        certificates: lu._count.certificates,
      };
    }
  }

  const hasLearners =
    course._count.enrollments > 0 ||
    course._count.certificates > 0 ||
    (learningUniverse?.enrollments ?? 0) > 0 ||
    (learningUniverse?.certificates ?? 0) > 0;

  res.json({
    success: true,
    impact: {
      course: {
        id: course.id,
        title: course.title,
        status: course.status,
        instructor: course.instructor,
        enrollments: course._count.enrollments,
        reviews: course._count.reviews,
        certificates: course._count.certificates,
      },
      product: course.product,
      learningUniverse,
      canHardDelete: !hasLearners,
      recommendedAction: hasLearners ? "archive" : "archive_or_delete",
      warning: hasLearners
        ? "This course has student enrollments and/or certificates. Hard delete is blocked to preserve historical records. Use Archive instead."
        : "No student enrollments or certificates found. Archive is still preferred; hard delete removes the catalog record permanently.",
    },
  });
}

export async function getLearningUniverseDeletionImpact(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const lu = await prisma.learningUniverse.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      structuredData: true,
      instructor: { select: { firstName: true, lastName: true, email: true } },
      product: { select: { id: true, displayName: true, published: true, visible: true, courseId: true } },
      _count: { select: { enrollments: true, certificates: true } },
    },
  });
  if (!lu) throw new AppError(404, "Learning Universe not found");

  const { readStructuredRecord } = await import("../services/productRoutingService.js");
  const linkedCourseId = readStructuredRecord(lu.structuredData).linkedCourseId;
  let linkedCourse: { id: string; title: string; status: string; enrollments: number } | null = null;
  if (typeof linkedCourseId === "string") {
    const course = await prisma.course.findUnique({
      where: { id: linkedCourseId },
      select: { id: true, title: true, status: true, _count: { select: { enrollments: true } } },
    });
    if (course) {
      linkedCourse = {
        id: course.id,
        title: course.title,
        status: course.status,
        enrollments: course._count.enrollments,
      };
    }
  }

  const hasLearners = lu._count.enrollments > 0 || lu._count.certificates > 0;
  res.json({
    success: true,
    impact: {
      learningUniverse: {
        id: lu.id,
        title: lu.title,
        status: lu.status,
        instructor: lu.instructor,
        enrollments: lu._count.enrollments,
        certificates: lu._count.certificates,
      },
      product: lu.product,
      linkedCourse,
      canHardDelete: !hasLearners,
      recommendedAction: hasLearners ? "archive" : "archive_or_delete",
      warning: hasLearners
        ? "This Learning Universe has student enrollments and/or certificates. Hard delete is blocked. Use Archive instead. Issued certificates are never deleted."
        : "No student enrollments or certificates found. Archive is preferred over hard delete.",
    },
  });
}

export async function deleteCourseAdmin(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const force = req.query.force === "true";
  const course = await prisma.course.findUnique({
    where: { id },
    select: {
      id: true,
      _count: { select: { enrollments: true, certificates: true } },
    },
  });
  if (!course) throw new AppError(404, "Course not found");

  const { resolveCanonicalUniverseId } = await import("../services/learnerScopeService.js");
  const luId = await resolveCanonicalUniverseId(id);
  const luCounts = luId
    ? await prisma.learningUniverse.findUnique({
        where: { id: luId },
        select: { _count: { select: { enrollments: true, certificates: true } } },
      })
    : null;

  const hasLearners =
    course._count.enrollments > 0 ||
    course._count.certificates > 0 ||
    (luCounts?._count.enrollments ?? 0) > 0 ||
    (luCounts?._count.certificates ?? 0) > 0;

  if (hasLearners || !force) {
    // Safe default: archive + hide product (never wipe certificates / enrollments).
    const archived = await prisma.course.update({
      where: { id },
      data: { status: "archived", publishedAt: null },
    });
    const { syncProductOnUnpublish } = await import("../services/productCatalogService.js");
    const { syncPremiumUniverseStatusFromCourse } = await import("../services/productRoutingService.js");
    await syncProductOnUnpublish({ courseId: id }).catch(() => {});
    if (archived.instructorId) {
      await syncPremiumUniverseStatusFromCourse(id, "draft", archived.instructorId).catch(() => {});
    }

    if (req.user) {
      await logAuditEvent({
        adminId: req.user.id,
        action: AUDIT_ACTIONS.COURSE_DELETED,
        targetId: id,
        targetType: "course",
        ipAddress: getClientIp(req),
        details: { action: "archived_instead_of_delete", hasLearners },
      });
    }

    return res.json({
      success: true,
      action: "archived",
      message: hasLearners
        ? "Course archived instead of deleted to preserve student enrollments and certificates."
        : "Course archived. Pass ?force=true only when you intentionally want a hard delete with no learner history.",
      course: archived,
    });
  }

  await prisma.course.delete({ where: { id } });
  if (req.user) {
    await logAuditEvent({
      adminId: req.user.id,
      action: AUDIT_ACTIONS.COURSE_DELETED,
      targetId: id,
      targetType: "course",
      ipAddress: getClientIp(req),
      details: { action: "hard_delete" },
    });
  }
  res.json({ success: true, action: "deleted", message: "Course deleted" });
}

export async function deleteLearningUniverseAdmin(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const force = req.query.force === "true";
  const lu = await prisma.learningUniverse.findUnique({
    where: { id },
    select: {
      id: true,
      instructorId: true,
      structuredData: true,
      _count: { select: { enrollments: true, certificates: true } },
    },
  });
  if (!lu) throw new AppError(404, "Learning Universe not found");

  const hasLearners = lu._count.enrollments > 0 || lu._count.certificates > 0;
  if (hasLearners || !force) {
    const archived = await prisma.learningUniverse.update({
      where: { id },
      data: { status: "archived", publishedAt: null },
    });
    const { syncCatalogOnUnpublish } = await import("../services/productRoutingService.js");
    const { syncProductOnUnpublish } = await import("../services/productCatalogService.js");
    await syncCatalogOnUnpublish(id).catch(() => {});
    await syncProductOnUnpublish({ learningUniverseId: id }).catch(() => {});

    if (req.user) {
      await logAuditEvent({
        adminId: req.user.id,
        action: AUDIT_ACTIONS.LU_DELETED,
        targetId: id,
        targetType: "learning_universe",
        ipAddress: getClientIp(req),
        details: { action: "archived_instead_of_delete", hasLearners },
      });
    }

    return res.json({
      success: true,
      action: "archived",
      message: hasLearners
        ? "Learning Universe archived instead of deleted. Certificates and enrollments were preserved."
        : "Learning Universe archived. Pass ?force=true only for intentional hard delete with no learner history.",
      learningUniverse: archived,
    });
  }

  await prisma.learningUniverse.delete({ where: { id } });
  if (req.user) {
    await logAuditEvent({
      adminId: req.user.id,
      action: AUDIT_ACTIONS.LU_DELETED,
      targetId: id,
      targetType: "learning_universe",
      ipAddress: getClientIp(req),
      details: { action: "hard_delete" },
    });
  }
  res.json({ success: true, action: "deleted", message: "Learning universe deleted" });
}

export async function listReviews(req: AuthRequest, res: Response) {
  const reviews = await prisma.review.findMany({
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      course: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ success: true, reviews });
}

export async function hideReview(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const review = await prisma.review.update({ where: { id }, data: { hidden: true } });
  res.json({ success: true, review: { id: review.id, hidden: review.hidden } });
}

/** Complementary action for hide — backend already stores Review.hidden. */
export async function unhideReview(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const existing = await prisma.review.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new AppError(404, "Review not found");
  const review = await prisma.review.update({ where: { id }, data: { hidden: false } });
  res.json({ success: true, review: { id: review.id, hidden: review.hidden } });
}

export async function listCategories(req: AuthRequest, res: Response) {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { courses: true, learningUniverses: true } } },
  });
  res.json({ success: true, categories });
}

export async function createCategory(req: AuthRequest, res: Response) {
  const body = z.object({ name: z.string().min(1), slug: z.string().min(1), description: z.string().optional() }).parse(req.body);
  const category = await prisma.category.create({ data: body });
  res.status(201).json({ success: true, category });
}

export async function updateCategory(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const body = z.object({ name: z.string().min(1).optional(), slug: z.string().min(1).optional(), description: z.string().optional() }).parse(req.body);
  const category = await prisma.category.update({ where: { id }, data: body });
  res.json({ success: true, category });
}

export async function adminAnalytics(_req: AuthRequest, res: Response) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  function dateKey(d: Date) {
    return d.toISOString().slice(0, 10);
  }

  function lastNDays(n: number) {
    const days: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      days.push(dateKey(d));
    }
    return days;
  }

  function lastNWeeks(n: number) {
    const weeks: { name: string; start: Date; end: Date }[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const end = new Date(now);
      end.setDate(end.getDate() - i * 7);
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      weeks.push({ name: `W${n - i}`, start, end });
    }
    return weeks;
  }

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const [
    recentUsers,
    recentCourses,
    recentLUs,
    recentEnrollments,
    recentLuEnrollments,
    monthlyPayments,
    topCoursesRaw,
    topLUsRaw,
    topRevenueProducts,
    activeStudentsRaw,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { createdAt: { gte: thirtyDaysAgo }, deletedAt: null },
      select: { createdAt: true },
    }),
    prisma.course.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true },
    }),
    prisma.learningUniverse.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true },
    }),
    prisma.enrollment.findMany({
      where: { enrolledAt: { gte: thirtyDaysAgo } },
      select: { enrolledAt: true },
    }),
    prisma.learningUniverseEnrollment.findMany({
      where: { enrolledAt: { gte: thirtyDaysAgo } },
      select: { enrolledAt: true },
    }),
    prisma.payment.findMany({
      where: { status: "completed", createdAt: { gte: sixMonthsAgo } },
      select: { amount: true, createdAt: true, productType: true, courseId: true, learningUniverseId: true, course: { select: { title: true } }, learningUniverse: { select: { title: true } } },
    }),
    prisma.course.findMany({
      select: { id: true, title: true, _count: { select: { enrollments: true } } },
      orderBy: { enrollments: { _count: "desc" } },
      take: 5,
    }),
    prisma.learningUniverse.findMany({
      select: { id: true, title: true, _count: { select: { enrollments: true } } },
      orderBy: { enrollments: { _count: "desc" } },
      take: 5,
    }),
    prisma.payment.findMany({
      where: { status: "completed" },
      select: { amount: true, productType: true, course: { select: { title: true } }, learningUniverse: { select: { title: true } } },
    }),
    prisma.user.findMany({
      where: { role: "student", deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        _count: { select: { enrollments: true, luEnrollments: true, quizAttempts: true, luProjectSubmissions: true } },
      },
      take: 100,
    }),
  ]);

  const dailyKeys = lastNDays(7);
  const dailyMap = new Map(dailyKeys.map((k) => [k, 0]));
  recentUsers.forEach((u) => {
    const k = dateKey(u.createdAt);
    if (dailyMap.has(k)) dailyMap.set(k, dailyMap.get(k)! + 1);
  });
  const dailyUsers = dailyKeys.map((name) => ({ name, users: dailyMap.get(name) ?? 0 }));

  const weeklyRanges = lastNWeeks(4);
  const weeklyUsers = weeklyRanges.map(({ name, start, end }) => ({
    name,
    users: recentUsers.filter((u) => u.createdAt >= start && u.createdAt <= end).length,
  }));

  const monthlyMap = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthlyMap.set(d.toLocaleString("default", { month: "short", year: "2-digit" }), 0);
  }
  recentUsers.forEach((u) => {
    const key = u.createdAt.toLocaleString("default", { month: "short", year: "2-digit" });
    if (monthlyMap.has(key)) monthlyMap.set(key, monthlyMap.get(key)! + 1);
  });
  const monthlyUsers = Array.from(monthlyMap.entries()).map(([name, users]) => ({ name, users }));

  const courseGrowthMap = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    courseGrowthMap.set(d.toLocaleString("default", { month: "short" }), 0);
  }
  recentCourses.forEach((c) => {
    const key = c.createdAt.toLocaleString("default", { month: "short" });
    if (courseGrowthMap.has(key)) courseGrowthMap.set(key, courseGrowthMap.get(key)! + 1);
  });
  const courseGrowth = Array.from(courseGrowthMap.entries()).map(([name, count]) => ({ name, count }));

  const luGrowthMap = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    luGrowthMap.set(d.toLocaleString("default", { month: "short" }), 0);
  }
  recentLUs.forEach((u) => {
    const key = u.createdAt.toLocaleString("default", { month: "short" });
    if (luGrowthMap.has(key)) luGrowthMap.set(key, luGrowthMap.get(key)! + 1);
  });
  const learningUniverseGrowth = Array.from(luGrowthMap.entries()).map(([name, count]) => ({ name, count }));

  const enrollmentTrendMap = new Map(dailyKeys.map((k) => [k, 0]));
  [...recentEnrollments, ...recentLuEnrollments].forEach((e) => {
    const k = dateKey(e.enrolledAt);
    if (enrollmentTrendMap.has(k)) enrollmentTrendMap.set(k, enrollmentTrendMap.get(k)! + 1);
  });
  const enrollmentTrend = dailyKeys.map((name) => ({ name, enrollments: enrollmentTrendMap.get(name) ?? 0 }));

  const revenueByMonth = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    revenueByMonth.set(d.toLocaleString("default", { month: "short" }), 0);
  }
  monthlyPayments.forEach((p) => {
    const key = p.createdAt.toLocaleString("default", { month: "short" });
    if (revenueByMonth.has(key)) revenueByMonth.set(key, revenueByMonth.get(key)! + p.amount);
  });
  const revenueGrowth = Array.from(revenueByMonth.entries()).map(([name, revenue]) => ({ name, revenue }));

  const popularity = topCoursesRaw.map((c) => ({
    name: c.title.length > 18 ? c.title.substring(0, 18) + "…" : c.title,
    enrollments: c._count.enrollments,
  }));

  const topLearningUniverses = topLUsRaw.map((u) => ({
    name: u.title.length > 18 ? u.title.substring(0, 18) + "…" : u.title,
    enrollments: u._count.enrollments,
  }));

  const instructorPayments = await prisma.payment.groupBy({
    by: ["instructorId"],
    where: { status: "completed", instructorId: { not: null } },
    _sum: { instructorEarning: true, amount: true },
    _count: true,
    orderBy: { _sum: { instructorEarning: "desc" } },
    take: 5,
  });
  const instructorIds = instructorPayments.map((p) => p.instructorId!).filter(Boolean);
  const instructorUsers = await prisma.user.findMany({
    where: { id: { in: instructorIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const instructorMap = new Map(instructorUsers.map((u) => [u.id, u]));
  const topInstructors = instructorPayments.map((p) => {
    const u = instructorMap.get(p.instructorId!);
    return {
      name: u ? `${u.firstName} ${u.lastName}` : "Unknown",
      revenue: p._sum.instructorEarning ?? 0,
      sales: p._count,
    };
  });

  const productRevenueMap = new Map<string, { name: string; revenue: number; type: string }>();
  topRevenueProducts.forEach((p) => {
    const title = p.course?.title || p.learningUniverse?.title || "Unknown";
    const key = `${p.productType}:${title}`;
    const existing = productRevenueMap.get(key) ?? { name: title, revenue: 0, type: p.productType };
    existing.revenue += p.amount;
    productRevenueMap.set(key, existing);
  });
  const highestRevenueProducts = [...productRevenueMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const mostActiveStudents = activeStudentsRaw
    .map((s) => ({
      name: `${s.firstName} ${s.lastName}`,
      email: s.email,
      activity: s._count.enrollments + s._count.luEnrollments + s._count.quizAttempts + s._count.luProjectSubmissions,
    }))
    .sort((a, b) => b.activity - a.activity)
    .slice(0, 5);

  const [courseSales, luSales, monthlyRevenue] = await Promise.all([
    prisma.payment.count({ where: { status: "completed", productType: "course", createdAt: { gte: startOfMonth } } }),
    prisma.payment.count({ where: { status: "completed", productType: "learning_universe", createdAt: { gte: startOfMonth } } }),
    prisma.payment.aggregate({ where: { status: "completed", createdAt: { gte: startOfMonth } }, _sum: { amount: true } }),
  ]);

  res.json({
    success: true,
    dailyUsers,
    weeklyUsers,
    monthlyUsers,
    userGrowth: dailyUsers,
    courseGrowth,
    learningUniverseGrowth,
    enrollmentTrend,
    revenueData: revenueGrowth,
    revenueGrowth,
    popularity,
    topCourses: popularity,
    topLearningUniverses,
    topInstructors,
    highestRevenueProducts,
    mostActiveStudents,
    courseSales,
    learningUniverseSales: luSales,
    monthlyRevenue: monthlyRevenue._sum.amount ?? 0,
  });
}

export async function adminReports(_req: AuthRequest, res: Response) {
  const [userCount, courseCount, luCount, paymentCount, reviewCount, hiddenReviewCount] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.course.count(),
    prisma.learningUniverse.count(),
    prisma.payment.count({ where: { status: "completed" } }),
    prisma.review.count(),
    prisma.review.count({ where: { hidden: true } }),
  ]);

  const revenue = await prisma.payment.aggregate({
    where: { status: "completed" },
    _sum: { amount: true, platformFee: true, instructorEarning: true },
  });

  res.json({
    success: true,
    report: {
      generatedAt: new Date().toISOString(),
      users: userCount,
      courses: courseCount,
      learningUniverses: luCount,
      completedPayments: paymentCount,
      totalRevenue: revenue._sum.amount ?? 0,
      platformRevenue: revenue._sum.platformFee ?? 0,
      instructorRevenue: revenue._sum.instructorEarning ?? 0,
      reviews: reviewCount,
      hiddenReviews: hiddenReviewCount,
    },
  });
}

// --- Super Admin: Admin Management ---

export async function listAdmins(req: AuthRequest, res: Response) {
  const admins = await prisma.user.findMany({
    where: { role: { in: ["admin", "super_admin"] }, deletedAt: null },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      suspended: true,
      createdAt: true,
      lastLoginAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ success: true, admins });
}

export async function createAdmin(req: AuthRequest, res: Response) {
  const data = createAdminSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new AppError(400, "Email already registered");

  const passwordHash = await bcrypt.hash(data.password, 12);
  const admin = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      role: ROLES.ADMIN,
    },
    select: { id: true, email: true, firstName: true, lastName: true, role: true, suspended: true, createdAt: true },
  });

  if (req.user) {
    await logAuditEvent({
      adminId: req.user.id,
      action: AUDIT_ACTIONS.ADMIN_CREATED,
      targetId: admin.id,
      targetType: "user",
      ipAddress: getClientIp(req),
    });
  }

  res.status(201).json({ success: true, admin });
}

export async function updateAdmin(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const body = z
    .object({
      role: z.enum(["admin"]).optional(),
      suspended: z.boolean().optional(),
    })
    .parse(req.body);

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Admin not found");
  if (existing.role === ROLES.SUPER_ADMIN) throw new AppError(403, "Cannot modify super admin");
  if (existing.role !== ROLES.ADMIN && existing.role !== ROLES.SUPER_ADMIN) {
    throw new AppError(400, "User is not an admin");
  }

  const admin = await prisma.user.update({
    where: { id },
    data: body,
    select: { id: true, email: true, firstName: true, lastName: true, role: true, suspended: true },
  });

  if (req.user) {
    let action: string = AUDIT_ACTIONS.ADMIN_ENABLED;
    if (body.suspended === true) action = AUDIT_ACTIONS.ADMIN_DISABLED;
    else if (body.role === "admin") action = AUDIT_ACTIONS.ADMIN_PROMOTED;
    await logAuditEvent({
      adminId: req.user.id,
      action,
      targetId: id,
      targetType: "user",
      ipAddress: getClientIp(req),
    });
  }

  res.json({ success: true, admin });
}

export async function removeAdmin(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Admin not found");
  if (existing.role === ROLES.SUPER_ADMIN) throw new AppError(403, "Cannot remove super admin");

  const admin = await prisma.user.update({
    where: { id },
    data: { role: ROLES.STUDENT },
    select: { id: true, email: true, role: true },
  });

  if (req.user) {
    await logAuditEvent({
      adminId: req.user.id,
      action: AUDIT_ACTIONS.ADMIN_REMOVED,
      targetId: id,
      targetType: "user",
      ipAddress: getClientIp(req),
    });
  }

  res.json({ success: true, admin, message: "Admin demoted to student" });
}

export async function listAuditLogs(req: AuthRequest, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const skip = (page - 1) * limit;
  const adminId = typeof req.query.adminId === "string" ? req.query.adminId : undefined;

  const where = adminId ? { adminId } : {};

  const [logs, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        admin: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
      },
    }),
    prisma.adminAuditLog.count({ where }),
  ]);

  res.json({ success: true, logs, total, page, limit });
}

export async function getAdminActivity(req: AuthRequest, res: Response) {
  const id = req.params.id;
  const logs = await prisma.adminAuditLog.findMany({
    where: { adminId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ success: true, logs });
}
