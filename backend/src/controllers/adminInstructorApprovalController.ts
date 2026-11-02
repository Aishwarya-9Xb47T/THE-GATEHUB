import { Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { getClientIp } from "../services/auditLogService.js";
import {
  listInstructors,
  getInstructorApprovalCounts,
  approveInstructor,
  rejectInstructor,
} from "../services/instructorApprovalService.js";

const approveSchema = z.object({
  notes: z.string().trim().max(500).optional(),
});

const rejectSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

/**
 * List instructors with filtering by approval status, search, and pagination.
 */
export async function listInstructorsAdmin(req: AuthRequest, res: Response) {
  const status = typeof req.query.status === "string" ? req.query.status.toUpperCase() : undefined;
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  const result = await listInstructors({
    status,
    search,
    page,
    limit,
  });

  res.json({
    success: true,
    ...result,
  });
}

/**
 * Get summary counts of pending, approved, and rejected instructors.
 */
export async function getInstructorApprovalCountsAdmin(_req: AuthRequest, res: Response) {
  const counts = await getInstructorApprovalCounts();
  res.json({
    success: true,
    counts,
  });
}

/**
 * Approve an instructor for course creation.
 * Idempotent and safe against duplicate requests.
 */
export async function approveInstructorAdmin(req: AuthRequest, res: Response) {
  if (!req.user) {
    throw new AppError(401, "Authentication required");
  }

  const { id } = req.params;
  const { notes } = approveSchema.parse(req.body);

  const updated = await approveInstructor(id, req.user.id, notes, getClientIp(req));

  res.json({
    success: true,
    user: updated,
    message: "Instructor approved successfully for course creation",
  });
}

/**
 * Reject an instructor request for course creation.
 */
export async function rejectInstructorAdmin(req: AuthRequest, res: Response) {
  if (!req.user) {
    throw new AppError(401, "Authentication required");
  }

  const { id } = req.params;
  const { reason } = rejectSchema.parse(req.body);

  const updated = await rejectInstructor(id, req.user.id, reason, getClientIp(req));

  res.json({
    success: true,
    user: updated,
    message: "Instructor request rejected",
  });
}
