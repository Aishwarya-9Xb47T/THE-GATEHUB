import { Router } from "express";
import { authenticate, requireRole } from "../middlewares/auth.js";
import * as bannerController from "../controllers/bannerController.js";

export const bannersRouter = Router();

bannersRouter.get("/config", authenticate, requireRole("instructor", "admin"), bannerController.providerStatus);
bannersRouter.get("/health", authenticate, requireRole("instructor", "admin"), bannerController.bannerHealth);
bannersRouter.post("/search", authenticate, requireRole("instructor", "admin"), bannerController.searchImages);
bannersRouter.post("/generate", authenticate, requireRole("instructor", "admin"), bannerController.generateBanner);
bannersRouter.post("/import", authenticate, requireRole("instructor", "admin"), bannerController.importBanner);
bannersRouter.post("/category-fallback", authenticate, requireRole("instructor", "admin"), bannerController.categoryFallback);
bannersRouter.post("/suggest-keywords", authenticate, requireRole("instructor", "admin"), bannerController.suggestKeywords);
bannersRouter.post(
  "/upload",
  authenticate,
  requireRole("instructor", "admin"),
  bannerController.bannerUploadMiddleware,
  bannerController.uploadBanner
);
