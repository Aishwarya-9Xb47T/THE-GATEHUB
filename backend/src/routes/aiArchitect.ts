import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate, requireRole } from "../middlewares/auth.js";
import type { Role } from "../middlewares/auth.js";
import {
  architectBlueprint,
  architectGenerate,
  architectQualityReview,
  architectRegenerate,
  architectBannerSuggestions,
  architectResearch,
  architectValidateCurriculum,
  architectGetAgents,
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
  "/agents",
  authenticate,
  requireRole("instructor", "admin" as Role),
  architectGetAgents
);

aiArchitectRouter.post(
  "/research",
  authenticate,
  requireRole("instructor", "admin" as Role),
  architectHeavyLimiter,
  architectResearch
);

aiArchitectRouter.post(
  "/validate-curriculum",
  authenticate,
  requireRole("instructor", "admin" as Role),
  architectValidateCurriculum
);

aiArchitectRouter.post(
  "/blueprint",
  authenticate,
  requireRole("instructor", "admin" as Role),
  architectHeavyLimiter,
  architectBlueprint
);

aiArchitectRouter.post(
  "/generate",
  authenticate,
  requireRole("instructor", "admin" as Role),
  architectHeavyLimiter,
  architectGenerate
);

aiArchitectRouter.post(
  "/quality-review",
  authenticate,
  requireRole("instructor", "admin" as Role),
  architectHeavyLimiter,
  architectQualityReview
);

aiArchitectRouter.post(
  "/regenerate",
  authenticate,
  requireRole("instructor", "admin" as Role),
  architectHeavyLimiter,
  architectRegenerate
);

aiArchitectRouter.post(
  "/banner-suggestions",
  authenticate,
  requireRole("instructor", "admin" as Role),
  architectBannerSuggestions
);
