import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.js";
import { AppError } from "./errorHandler.js";
import { isAdminRole } from "../utils/roles.js";
import {
  checkInstructorApproved,
  INSTRUCTOR_APPROVAL_STATUS,
} from "../services/instructorApprovalService.js";

/**
 * Middleware enforcing that the requesting user is an approved instructor or administrator.
 * Unapproved instructors receive HTTP 403 Forbidden with a clear message and status.
 * Approved instructors pass automatically without repeated prompts.
 */
export async function requireInstructorApproved(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return next(new AppError(401, "Authentication required"));
  }

  // Administrators always pass
  if (isAdminRole(req.user.role)) {
    return next();
  }

  // Only instructors can be evaluated for instructor approval
  if (req.user.role !== "instructor") {
    return next(new AppError(403, "Instructor access required"));
  }

  try {
    const result = await checkInstructorApproved(req.user.id);

    if (!result.approved) {
      return res.status(403).json({
        success: false,
        error: result.message,
        message: result.message,
        approvalStatus: result.status,
        rejectionReason: result.rejectionReason,
      });
    }

    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError(500, "Failed to verify instructor course-creation permission"));
  }
}
