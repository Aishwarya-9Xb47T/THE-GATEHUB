import { Router } from "express";
import { authenticate } from "../../middlewares/auth.js";
import {
  getAssessmentFeatureFlags,
  getAssessmentFeatureFlagDefinitions,
} from "../../services/assessmentFeatureFlagService.js";

export const assessmentFeatureFlagsRouter = Router();

assessmentFeatureFlagsRouter.get("/", authenticate as any, async (_req, res) => {
  const [flags, definitions] = await Promise.all([
    getAssessmentFeatureFlags(),
    Promise.resolve(getAssessmentFeatureFlagDefinitions()),
  ]);
  res.json({ success: true, data: { flags, definitions } });
});
