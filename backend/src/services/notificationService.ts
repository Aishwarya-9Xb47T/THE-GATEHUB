import { prisma } from "../utils/prisma.js";

export type NotificationType =
  | "project_approved"
  | "project_rejected"
  | "project_feedback"
  | "certificate_earned"
  | "certificate_issued"
  | "certificate_revoked";

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

export async function createNotification(input: CreateNotificationInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}

export function normalizeSubmissionStatus(status: string): string {
  return status === "submitted" ? "pending" : status;
}

export const SUBMISSION_STATUSES = [
  "pending",
  "under_review",
  "approved",
  "rejected",
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
