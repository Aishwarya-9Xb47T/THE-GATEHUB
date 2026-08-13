import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import { getCurrentUser, updateAvatar, deleteAvatar } from "../controllers/avatarController.js";

export const avatarRouter = Router();

// GET /api/auth/me - Get current user with avatar
avatarRouter.get("/me", authenticate, getCurrentUser);

// PATCH /api/users/avatar - Update avatar
avatarRouter.patch("/avatar", authenticate, updateAvatar);

// DELETE /api/users/avatar - Delete avatar
avatarRouter.delete("/avatar", authenticate, deleteAvatar);
