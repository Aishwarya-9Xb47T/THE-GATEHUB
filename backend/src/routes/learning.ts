import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import { getMyLearning } from "../controllers/learningController.js";

const router = Router();

router.get("/my", authenticate, getMyLearning);

export default router;
