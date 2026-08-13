import { Router } from "express";
import * as analyticsController from "../controllers/analyticsController.js";
import { authenticate } from "../middlewares/auth.js";

export const analyticsRouter = Router();

analyticsRouter.get("/instructor", authenticate, analyticsController.getInstructorAnalytics);
