import { Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";

export async function getMyNotifications(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: req.user.id, read: false },
  });

  res.json({ success: true, notifications, unreadCount });
}

export async function markNotificationRead(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notification || notification.userId !== req.user.id) {
    throw new AppError(404, "Notification not found");
  }

  const updated = await prisma.notification.update({
    where: { id: req.params.id },
    data: { read: true },
  });

  res.json({ success: true, notification: updated });
}

export async function markAllNotificationsRead(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");

  await prisma.notification.updateMany({
    where: { userId: req.user.id, read: false },
    data: { read: true },
  });

  res.json({ success: true });
}
