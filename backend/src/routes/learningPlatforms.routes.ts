import { Router } from "express";
import { optionalAuthenticate } from "../middlewares/auth.js";
import {
  getLearningPlatforms,
  getWaygroundConfig,
  launchWaygroundSession,
} from "../controllers/learningPlatformsController.js";

export const learningPlatformsRouter = Router();

learningPlatformsRouter.get("/platforms", optionalAuthenticate, getLearningPlatforms);
learningPlatformsRouter.get("/wayground/config", optionalAuthenticate, getWaygroundConfig);
learningPlatformsRouter.post("/wayground/launch", optionalAuthenticate, launchWaygroundSession);
