import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.js";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../middlewares/errorHandler.js";

// GET /api/auth/me - Return full user including avatar
export async function getCurrentUser(req: AuthRequest, res: Response) {
  try {
    if (!req.user) throw new AppError(401, "Unauthorized");

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) throw new AppError(404, "User not found");

    console.log("GET CURRENT USER - Database result:", {
      userId: user.id,
      avatar: user.avatar,
      avatarIsNull: user.avatar === null,
      avatarType: typeof user.avatar
    });

    res.json({ success: true, user });
  } catch (error: any) {
    console.error("Get current user error:", error);
    throw error;
  }
}

// PATCH /api/users/avatar - Update avatar URL
export async function updateAvatar(req: AuthRequest, res: Response) {
  try {
    if (!req.user) throw new AppError(401, "Unauthorized");

    const { avatar } = req.body;

    if (!avatar || typeof avatar !== "string") {
      throw new AppError(400, "Avatar URL is required");
    }

    console.log("UPDATE AVATAR - Request:", {
      userId: req.user.id,
      avatar: avatar
    });

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatar },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
      },
    });

    console.log("UPDATE AVATAR - Database result:", {
      userId: user.id,
      avatar: user.avatar,
      avatarIsNull: user.avatar === null
    });

    res.json({ success: true, user });
  } catch (error: any) {
    console.error("Update avatar error:", error);
    throw error;
  }
}

// DELETE /api/users/avatar - Remove avatar (set to null)
export async function deleteAvatar(req: AuthRequest, res: Response) {
  try {
    if (!req.user) throw new AppError(401, "Unauthorized");

    console.log("DELETE AVATAR - Request:", {
      userId: req.user.id
    });

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatar: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
      },
    });

    console.log("DELETE AVATAR - Database result:", {
      userId: user.id,
      avatar: user.avatar,
      avatarIsNull: user.avatar === null
    });

    // Verify the update was written
    const verifyUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { avatar: true }
    });

    console.log("DELETE AVATAR - Verification:", {
      userId: req.user.id,
      avatarFromDB: verifyUser?.avatar,
      avatarIsNull: verifyUser?.avatar === null
    });

    res.json({ success: true, user });
  } catch (error: any) {
    console.error("Delete avatar error:", error);
    throw error;
  }
}
