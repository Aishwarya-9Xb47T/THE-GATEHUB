import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// Set required JWT_SECRET before any imports
process.env.JWT_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  course: {
    count: jest.fn(),
  },
  learningUniverse: {
    count: jest.fn(),
  },
  latexProject: {
    count: jest.fn(),
  },
  adminAuditLog: {
    create: jest.fn(),
  },
  notification: {
    create: jest.fn(),
  },
};

jest.unstable_mockModule("../../utils/prisma.js", () => ({
  prisma: mockPrisma,
}));

const {
  checkInstructorApproved,
  approveInstructor,
  rejectInstructor,
  revokeInstructor,
  getInstructorApprovalCounts,
  listInstructors,
} = await import("../instructorApprovalService.js");

const { requireInstructorApproved, requireApprovedInstructor } = await import(
  "../../middlewares/instructorApproval.js"
);

const { requireSuperAdmin } = await import("../../middlewares/auth.js");

describe("Instructor Admin Approval Workflow Suite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Middleware & Permission Check", () => {
    it("should allow administrators without requiring instructor approval", async () => {
      const req: any = {
        user: { id: "admin-1", role: "admin" },
      };
      const res: any = {};
      const next = jest.fn();

      await requireInstructorApproved(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should allow super administrators without requiring instructor approval", async () => {
      const req: any = {
        user: { id: "super-admin-1", role: "super_admin" },
      };
      const res: any = {};
      const next = jest.fn();

      await requireApprovedInstructor(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("should return HTTP 401 when request is unauthenticated", async () => {
      const req: any = {};
      const res: any = {};
      const next = jest.fn();

      await requireInstructorApproved(req, res, next);
      expect(next).toHaveBeenCalled();
      const err = (next as any).mock.calls[0][0];
      expect(err?.statusCode).toBe(401);
    });

    it("should return HTTP 403 when user is student", async () => {
      const req: any = {
        user: { id: "student-1", role: "student" },
      };
      const res: any = {};
      const next = jest.fn();

      await requireInstructorApproved(req, res, next);
      expect(next).toHaveBeenCalled();
      const err = (next as any).mock.calls[0][0];
      expect(err?.statusCode).toBe(403);
    });

    it("should return HTTP 403 with approvalStatus PENDING for pending instructors", async () => {
      (mockPrisma.user.findUnique as any).mockResolvedValue({
        id: "inst-pending-1",
        role: "instructor",
        instructorApprovalStatus: "PENDING",
      });

      const req: any = {
        user: { id: "inst-pending-1", role: "instructor" },
      };
      const jsonMock = jest.fn();
      const statusMock = jest.fn(() => ({ json: jsonMock }));
      const res: any = { status: statusMock };
      const next = jest.fn();

      await requireInstructorApproved(req, res, next);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          approvalStatus: "PENDING",
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("should return HTTP 403 with rejectionReason for rejected instructors", async () => {
      (mockPrisma.user.findUnique as any).mockResolvedValue({
        id: "inst-rejected-1",
        role: "instructor",
        instructorApprovalStatus: "REJECTED",
        instructorRejectionReason: "Incomplete credentials provided",
      });

      const req: any = {
        user: { id: "inst-rejected-1", role: "instructor" },
      };
      const jsonMock = jest.fn();
      const statusMock = jest.fn(() => ({ json: jsonMock }));
      const res: any = { status: statusMock };
      const next = jest.fn();

      await requireInstructorApproved(req, res, next);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          approvalStatus: "REJECTED",
          rejectionReason: "Incomplete credentials provided",
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("should allow approved instructors to proceed", async () => {
      (mockPrisma.user.findUnique as any).mockResolvedValue({
        id: "inst-approved-1",
        role: "instructor",
        instructorApprovalStatus: "APPROVED",
        instructorApprovedAt: new Date(),
        instructorApprovedById: "admin-1",
      });

      const req: any = {
        user: { id: "inst-approved-1", role: "instructor" },
      };
      const res: any = {};
      const next = jest.fn();

      await requireInstructorApproved(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe("Grandfathering Policy for Existing Instructors", () => {
    it("should automatically grandfather legacy instructors who already authored courses", async () => {
      (mockPrisma.user.findUnique as any).mockResolvedValue({
        id: "legacy-inst-1",
        role: "instructor",
        instructorApprovalStatus: null,
      });
      (mockPrisma.course.count as any).mockResolvedValue(3);
      (mockPrisma.learningUniverse.count as any).mockResolvedValue(0);
      (mockPrisma.latexProject.count as any).mockResolvedValue(0);
      (mockPrisma.user.update as any).mockResolvedValue({});

      const result = await checkInstructorApproved("legacy-inst-1");

      expect(result.approved).toBe(true);
      expect(result.status).toBe("APPROVED");
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "legacy-inst-1" },
          data: expect.objectContaining({
            instructorApprovalStatus: "APPROVED",
            instructorApprovalNotes: expect.stringContaining("grandfathered"),
          }),
        })
      );
    });

    it("should mark unapproved zero-content legacy instructors as PENDING", async () => {
      (mockPrisma.user.findUnique as any).mockResolvedValue({
        id: "legacy-zero-content-1",
        role: "instructor",
        instructorApprovalStatus: null,
      });
      (mockPrisma.course.count as any).mockResolvedValue(0);
      (mockPrisma.learningUniverse.count as any).mockResolvedValue(0);
      (mockPrisma.latexProject.count as any).mockResolvedValue(0);
      (mockPrisma.user.update as any).mockResolvedValue({});

      const result = await checkInstructorApproved("legacy-zero-content-1");

      expect(result.approved).toBe(false);
      expect(result.status).toBe("PENDING");
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "legacy-zero-content-1" },
          data: { instructorApprovalStatus: "PENDING" },
        })
      );
    });
  });

  describe("Admin Workflow Actions: Approve, Reject, Revoke", () => {
    it("should approve an instructor, log audit event, and send in-app notification", async () => {
      (mockPrisma.user.findUnique as any).mockResolvedValue({
        id: "inst-10",
        role: "instructor",
        instructorApprovalStatus: "PENDING",
      });
      (mockPrisma.user.update as any).mockResolvedValue({
        id: "inst-10",
        role: "instructor",
        instructorApprovalStatus: "APPROVED",
        instructorApprovedAt: new Date(),
        instructorApprovedById: "admin-super",
        instructorApprovalNotes: "Verified credentials",
      });
      (mockPrisma.adminAuditLog.create as any).mockResolvedValue({});
      (mockPrisma.notification.create as any).mockResolvedValue({});

      const res = await approveInstructor("inst-10", "admin-super", "Verified credentials", "127.0.0.1");

      expect(res.instructorApprovalStatus).toBe("APPROVED");
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "inst-10" },
          data: expect.objectContaining({
            instructorApprovalStatus: "APPROVED",
            instructorApprovedById: "admin-super",
            instructorApprovalNotes: "Verified credentials",
          }),
        })
      );
      expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            adminId: "admin-super",
            action: "INSTRUCTOR_APPROVED",
            targetId: "inst-10",
          }),
        })
      );
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "inst-10",
            type: "instructor_approved",
          }),
        })
      );
    });

    it("should reject an instructor, record reason, and send notification", async () => {
      (mockPrisma.user.findUnique as any).mockResolvedValue({
        id: "inst-20",
        role: "instructor",
        instructorApprovalStatus: "PENDING",
      });
      (mockPrisma.user.update as any).mockResolvedValue({
        id: "inst-20",
        role: "instructor",
        instructorApprovalStatus: "REJECTED",
        instructorRejectionReason: "Incomplete subject background",
      });
      (mockPrisma.adminAuditLog.create as any).mockResolvedValue({});
      (mockPrisma.notification.create as any).mockResolvedValue({});

      const res = await rejectInstructor("inst-20", "admin-super", "Incomplete subject background", "127.0.0.1");

      expect(res.instructorApprovalStatus).toBe("REJECTED");
      expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            adminId: "admin-super",
            action: "INSTRUCTOR_REJECTED",
            targetId: "inst-20",
          }),
        })
      );
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "inst-20",
            type: "instructor_rejected",
          }),
        })
      );
    });

    it("should revoke previously approved instructor permissions", async () => {
      (mockPrisma.user.findUnique as any).mockResolvedValue({
        id: "inst-30",
        role: "instructor",
        instructorApprovalStatus: "APPROVED",
      });
      (mockPrisma.user.update as any).mockResolvedValue({
        id: "inst-30",
        role: "instructor",
        instructorApprovalStatus: "REJECTED",
        instructorRejectionReason: "Quality policy violation",
      });
      (mockPrisma.adminAuditLog.create as any).mockResolvedValue({});
      (mockPrisma.notification.create as any).mockResolvedValue({});

      const res = await revokeInstructor("inst-30", "admin-super", "Quality policy violation", "127.0.0.1");

      expect(res.instructorApprovalStatus).toBe("REJECTED");
      expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            adminId: "admin-super",
            action: "INSTRUCTOR_REVOKED",
            targetId: "inst-30",
          }),
        })
      );
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "inst-30",
            type: "instructor_revoked",
          }),
        })
      );
    });
  });

  describe("Super Admin Authorization Guards on Approval Mutations", () => {
    it("should allow super_admin to perform approval actions", () => {
      const superAdminReq: any = {
        user: { id: "super-1", role: "super_admin", email: "super@gatehub.com" },
      };
      const res: any = {};
      const next = jest.fn();

      const middleware = requireSuperAdmin();
      middleware(superAdminReq, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it("should return HTTP 403 for normal admin attempting approval actions", () => {
      const normalAdminReq: any = {
        user: { id: "admin-1", role: "admin", email: "admin@gatehub.com" },
      };
      const res: any = {};
      const next = jest.fn();

      const middleware = requireSuperAdmin();
      middleware(normalAdminReq, res, next);

      expect(next).toHaveBeenCalled();
      const err = (next as any).mock.calls[0][0];
      expect(err?.statusCode).toBe(403);
      expect(err?.message).toBe("Super admin access required");
    });

    it("should return HTTP 403 for instructor attempting approval actions", () => {
      const instructorReq: any = {
        user: { id: "inst-1", role: "instructor", email: "inst@gatehub.com" },
      };
      const res: any = {};
      const next = jest.fn();

      const middleware = requireSuperAdmin();
      middleware(instructorReq, res, next);

      expect(next).toHaveBeenCalled();
      const err = (next as any).mock.calls[0][0];
      expect(err?.statusCode).toBe(403);
      expect(err?.message).toBe("Super admin access required");
    });

    it("should return HTTP 403 for student attempting approval actions", () => {
      const studentReq: any = {
        user: { id: "student-1", role: "student", email: "student@gatehub.com" },
      };
      const res: any = {};
      const next = jest.fn();

      const middleware = requireSuperAdmin();
      middleware(studentReq, res, next);

      expect(next).toHaveBeenCalled();
      const err = (next as any).mock.calls[0][0];
      expect(err?.statusCode).toBe(403);
      expect(err?.message).toBe("Super admin access required");
    });

    it("should return HTTP 401 for unauthenticated request attempting approval actions", () => {
      const unauthReq: any = {};
      const res: any = {};
      const next = jest.fn();

      const middleware = requireSuperAdmin();
      middleware(unauthReq, res, next);

      expect(next).toHaveBeenCalled();
      const err = (next as any).mock.calls[0][0];
      expect(err?.statusCode).toBe(401);
      expect(err?.message).toBe("Authentication required");
    });
  });

  describe("Admin Counts and Listing", () => {
    it("should return accurate approval summary counts", async () => {
      (mockPrisma.user.count as any)
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(5)  // pending
        .mockResolvedValueOnce(42) // approved
        .mockResolvedValueOnce(3); // rejected

      const counts = await getInstructorApprovalCounts();

      expect(counts).toEqual({
        total: 50,
        pending: 5,
        approved: 42,
        rejected: 3,
      });
    });

    it("should list instructors with status filtering", async () => {
      (mockPrisma.user.findMany as any).mockResolvedValue([
        { id: "inst-p1", email: "p1@example.com", instructorApprovalStatus: "PENDING" },
      ]);
      (mockPrisma.user.count as any).mockResolvedValue(1);

      const res = await listInstructors({ status: "PENDING", page: 1, limit: 10 });

      expect(res.instructors.length).toBe(1);
      expect(res.total).toBe(1);
      expect(res.totalPages).toBe(1);
    });
  });
});
