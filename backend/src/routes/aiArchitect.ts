import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate, requireRole } from "../middlewares/auth.js";
import type { Role } from "../middlewares/auth.js";
import { requireInstructorApproved } from "../middlewares/instructorApproval.js";
import {
  architectBlueprint,
  architectGenerate,
  architectQualityReview,
  architectRegenerate,
  architectBannerSuggestions,
  architectResearch,
  architectValidateCurriculum,
  architectGetAgents,
  architectProviderHealth,
  architectCreateJob,
  architectGetJob,
  architectGetActiveJob,
  architectResumeJob,
  architectRetryFailedStage,
  architectRetryEverything,
  architectCancelJob,
} from "../controllers/aiCourseArchitectController.js";

export const aiArchitectRouter = Router();

const architectHeavyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many AI Architect requests. Please wait and try again." },
});

aiArchitectRouter.get(
  "/provider-health",
  authenticate,
  requireRole("instructor", "admin" as Role),
  architectProviderHealth
);

aiArchitectRouter.get(
  "/agents",
  authenticate,
  requireRole("instructor", "admin" as Role),
  architectGetAgents
);

aiArchitectRouter.get(
  "/jobs/active/me",
  authenticate,
  requireRole("instructor", "admin" as Role),
  architectGetActiveJob
);

aiArchitectRouter.get(
  "/jobs/:jobId",
  authenticate,
  requireRole("instructor", "admin" as Role),
  architectGetJob
);

aiArchitectRouter.post(
  "/jobs",
  authenticate,
  requireInstructorApproved,
  architectHeavyLimiter,
  architectCreateJob
);

aiArchitectRouter.post(
  "/jobs/:jobId/resume",
  authenticate,
  requireInstructorApproved,
  architectResumeJob
);

aiArchitectRouter.post(
  "/jobs/:jobId/retry-stage",
  authenticate,
  requireInstructorApproved,
  architectRetryFailedStage
);

aiArchitectRouter.post(
  "/jobs/:jobId/retry-everything",
  authenticate,
  requireInstructorApproved,
  architectRetryEverything
);

aiArchitectRouter.post(
  "/jobs/:jobId/cancel",
  authenticate,
  requireRole("instructor", "admin" as Role),
  architectCancelJob
);

aiArchitectRouter.post(
  "/research",
  authenticate,
  requireInstructorApproved,
  architectHeavyLimiter,
  architectResearch
);

aiArchitectRouter.post(
  "/validate-curriculum",
  authenticate,
  requireInstructorApproved,
  architectValidateCurriculum
);

aiArchitectRouter.post(
  "/blueprint",
  authenticate,
  requireInstructorApproved,
  architectHeavyLimiter,
  architectBlueprint
);

aiArchitectRouter.post(
  "/generate",
  authenticate,
  requireInstructorApproved,
  architectHeavyLimiter,
  architectGenerate
);

aiArchitectRouter.post(
  "/quality-review",
  authenticate,
  requireInstructorApproved,
  architectHeavyLimiter,
  architectQualityReview
);

aiArchitectRouter.post(
  "/regenerate",
  authenticate,
  requireInstructorApproved,
  architectHeavyLimiter,
  architectRegenerate
);

aiArchitectRouter.post(
  "/banner-suggestions",
  authenticate,
  requireInstructorApproved,
  architectBannerSuggestions
);

