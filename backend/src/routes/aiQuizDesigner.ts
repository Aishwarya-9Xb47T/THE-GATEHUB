import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import { postDesignerAnalytics, validateDesigner } from "../controllers/aiQuizDesignerController.js";

export const aiQuizDesignerRouter = Router();

aiQuizDesignerRouter.use(authenticate);
aiQuizDesignerRouter.post("/analytics", postDesignerAnalytics);
aiQuizDesignerRouter.post("/validate", validateDesigner);
