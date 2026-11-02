import { prisma } from "../utils/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";
import { isAdminRole } from "../utils/roles.js";
import { logAuditEvent, AUDIT_ACTIONS, getClientIp } from "./auditLogService.js";

export const INSTRUCTOR_APPROVAL_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export type InstructorApprovalStatus =
  (typeof INSTRUCTOR_APPROVAL_STATUS)[keyof typeof INSTRUCTOR_APPROVAL_STATUS];

export interface ApprovalCheckResult {
  approved: boolean;
  status: InstructorApprovalStatus | "NOT_INSTRUCTOR";
  message: string;
  rejectionReason?: string | null;
  approvalNotes?: string | null;
  approvedAt?: Date | null;
  approvedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

/**
 * Checks whether an instructor has one-time course-creation approval.
 * Admins and super-admins always have permission.
 * Existing established instructors with active content are preserved under safe migration policy.
 */
export async function checkInstructorApproved(userId: string): Promise<ApprovalCheckResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      email: true,
      instructorApprovalStatus: true,
      instructorApprovedAt: true,
      instructorApprovalNotes: true,
      instructorRejectionReason: true,
      instructorApprovedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  if (!user) {
    throw new AppError(404, "User not found");
  }

  // Administrators always pass
  if (isAdminRole(user.role)) {
    return {
      approved: true,
      status: INSTRUCTOR_APPROVAL_STATUS.APPROVED,
      message: "Administrator course-creation permission granted",
    };
  }

  // Non-instructors cannot create courses
  if (user.role !== "instructor") {
    return {
      approved: false,
      status: "NOT_INSTRUCTOR",
      message: "Instructor role required to create courses",
    };
  }

  // Explicit approval status
  if (user.instructorApprovalStatus === INSTRUCTOR_APPROVAL_STATUS.APPROVED) {
    return {
      approved: true,
      status: INSTRUCTOR_APPROVAL_STATUS.APPROVED,
      message: "Instructor approved for course creation",
      approvedAt: user.instructorApprovedAt,
      approvalNotes: user.instructorApprovalNotes,
      approvedBy: user.instructorApprovedBy,
    };
  }

  if (user.instructorApprovalStatus === INSTRUCTOR_APPROVAL_STATUS.REJECTED) {
    return {
      approved: false,
      status: INSTRUCTOR_APPROVAL_STATUS.REJECTED,
      message: "Your instructor course-creation request was rejected by an administrator.",
      rejectionReason: user.instructorRejectionReason,
    };
  }

  if (user.instructorApprovalStatus === INSTRUCTOR_APPROVAL_STATUS.PENDING) {
    return {
      approved: false,
      status: INSTRUCTOR_APPROVAL_STATUS.PENDING,
      message: "Your instructor account is awaiting admin approval. You will be able to create courses once your permission is approved.",
    };
  }

  // Safe migration fallback for legacy instructors without approval field set:
  // If they already created legitimate courses, learning universes, or projects, preserve access.
  const [coursesCount, luCount, latexCount] = await Promise.all([
    prisma.course.count({ where: { instructorId: user.id } }),
    prisma.learningUniverse.count({ where: { instructorId: user.id } }),
    prisma.latexProject.count({ where: { ownerId: user.id } }),
  ]);

  if (coursesCount > 0 || luCount > 0 || latexCount > 0) {
    // Grandfather existing instructor
    await prisma.user.update({
      where: { id: user.id },
      data: {
        instructorApprovalStatus: INSTRUCTOR_APPROVAL_STATUS.APPROVED,
        instructorApprovedAt: new Date(),
        instructorApprovalNotes: "Auto-grandfathered existing instructor with active courses",
      },
    }).catch(() => {});

    return {
      approved: true,
      status: INSTRUCTOR_APPROVAL_STATUS.APPROVED,
      message: "Grandfathered instructor approved for course creation",
    };
  }

  // Newly registered or zero-course legacy instructor without approval:
  await prisma.user.update({
    where: { id: user.id },
    data: {
      instructorApprovalStatus: INSTRUCTOR_APPROVAL_STATUS.PENDING,
    },
  }).catch(() => {});

  return {
    approved: false,
    status: INSTRUCTOR_APPROVAL_STATUS.PENDING,
    message: "Your instructor account is awaiting admin approval. You will be able to create courses once your permission is approved.",
  };
}

/**
 * Admin approves an instructor ONCE. Permanent permission is persisted.
 * Safe against duplicate clicks and concurrent calls.
 */
export async function approveInstructor(
  instructorId: string,
  adminId: string,
  notes?: string,
  reqIp?: string
) {
  const target = await prisma.user.findUnique({
    where: { id: instructorId },
    select: { id: true, role: true, email: true, instructorApprovalStatus: true },
  });

  if (!target) {
    throw new AppError(404, "Instructor account not found");
  }

  if (target.role !== "instructor") {
    throw new AppError(400, "Target user is not an instructor");
  }

  const updated = await prisma.user.update({
    where: { id: instructorId },
    data: {
      instructorApprovalStatus: INSTRUCTOR_APPROVAL_STATUS.APPROVED,
      instructorApprovedAt: new Date(),
      instructorApprovedById: adminId,
      instructorApprovalNotes: notes?.trim() || null,
      instructorRejectionReason: null,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      instructorApprovalStatus: true,
      instructorApprovedAt: true,
      instructorApprovalNotes: true,
      instructorApprovedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  await logAuditEvent({
    adminId,
    action: AUDIT_ACTIONS.INSTRUCTOR_APPROVED,
    targetId: instructorId,
    targetType: "user",
    details: {
      previousStatus: target.instructorApprovalStatus,
      newStatus: INSTRUCTOR_APPROVAL_STATUS.APPROVED,
      notes: notes?.trim() || null,
    },
    ipAddress: reqIp,
  });

  return updated;
}

/**
 * Admin rejects an instructor request. Course creation remains blocked until explicitly approved.
 */
export async function rejectInstructor(
  instructorId: string,
  adminId: string,
  reason?: string,
  reqIp?: string
) {
  const target = await prisma.user.findUnique({
    where: { id: instructorId },
    select: { id: true, role: true, email: true, instructorApprovalStatus: true },
  });

  if (!target) {
    throw new AppError(404, "Instructor account not found");
  }

  if (target.role !== "instructor") {
    throw new AppError(400, "Target user is not an instructor");
  }

  const updated = await prisma.user.update({
    where: { id: instructorId },
    data: {
      instructorApprovalStatus: INSTRUCTOR_APPROVAL_STATUS.REJECTED,
      instructorRejectionReason: reason?.trim() || "Course creation access not granted at this time.",
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      instructorApprovalStatus: true,
      instructorRejectionReason: true,
    },
  });

  await logAuditEvent({
    adminId,
    action: AUDIT_ACTIONS.INSTRUCTOR_REJECTED,
    targetId: instructorId,
    targetType: "user",
    details: {
      previousStatus: target.instructorApprovalStatus,
      newStatus: INSTRUCTOR_APPROVAL_STATUS.REJECTED,
      reason: reason?.trim() || null,
    },
    ipAddress: reqIp,
  });

  return updated;
}

/**
 * Query instructors with their approval states, filtering and search.
 */
export async function listInstructors(options: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    role: "instructor",
    deletedAt: null,
  };

  if (options.status && options.status !== "ALL") {
    where.instructorApprovalStatus = options.status;
  }

  if (options.search) {
    const search = options.search.trim();
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
    ];
  }

  const [instructors, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: [
        // Pending approvals prioritized first
        { createdAt: "desc" },
      ],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        createdAt: true,
        suspended: true,
        instructorApprovalStatus: true,
        instructorApprovedAt: true,
        instructorApprovalNotes: true,
        instructorRejectionReason: true,
        instructorApprovedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        _count: {
          select: {
            coursesCreated: true,
            learningUniverses: true,
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    instructors,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Summary counts for Admin Dashboard and Instructor Access Management.
 */
export async function getInstructorApprovalCounts() {
  const [total, pending, approved, rejected] = await Promise.all([
    prisma.user.count({
      where: { role: "instructor", deletedAt: null },
    }),
    prisma.user.count({
      where: {
        role: "instructor",
        deletedAt: null,
        instructorApprovalStatus: INSTRUCTOR_APPROVAL_STATUS.PENDING,
      },
    }),
    prisma.user.count({
      where: {
        role: "instructor",
        deletedAt: null,
        instructorApprovalStatus: INSTRUCTOR_APPROVAL_STATUS.APPROVED,
      },
    }),
    prisma.user.count({
      where: {
        role: "instructor",
        deletedAt: null,
        instructorApprovalStatus: INSTRUCTOR_APPROVAL_STATUS.REJECTED,
      },
    }),
  ]);

  return { total, pending, approved, rejected };
}
