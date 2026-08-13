import { Router } from "express";
import { authenticate, requireRole } from "../middlewares/auth.js";
import * as reviewController from "../controllers/instructorProjectReviewController.js";
import * as notificationController from "../controllers/notificationController.js";

export const projectReviewRouter = Router();

projectReviewRouter.get(
  "/instructor/submissions",
  authenticate,
  requireRole("instructor", "admin"),
  reviewController.listInstructorSubmissions
);

projectReviewRouter.get(
  "/instructor/filters",
  authenticate,
  requireRole("instructor", "admin"),
  reviewController.getInstructorReviewFilters
);

projectReviewRouter.patch(
  "/instructor/submissions/:id",
  authenticate,
  requireRole("instructor", "admin"),
  reviewController.reviewSubmission
);

export const notificationRouter = Router();

notificationRouter.get("/my", authenticate, notificationController.getMyNotifications);
notificationRouter.patch("/:id/read", authenticate, notificationController.markNotificationRead);
notificationRouter.post("/read-all", authenticate, notificationController.markAllNotificationsRead);
