import { Router } from "express";
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
  architectBlueprint
);

aiArchitectRouter.post(
  "/generate",
  authenticate,
  requireRole("instructor", "admin" as Role),
  architectGenerate
);

aiArchitectRouter.post(
  "/quality-review",
  authenticate,
  requireRole("instructor", "admin" as Role),
  architectQualityReview
);

aiArchitectRouter.post(
  "/regenerate",
  authenticate,
  requireRole("instructor", "admin" as Role),
  architectRegenerate
);

aiArchitectRouter.post(
  "/banner-suggestions",
  authenticate,
  requireRole("instructor", "admin" as Role),
  architectBannerSuggestions
);
