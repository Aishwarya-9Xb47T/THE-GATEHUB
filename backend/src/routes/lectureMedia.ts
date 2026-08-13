import { Router } from "express";
import {
  uploadMedia,
  listMedia,
  deleteMedia,
} from "../controllers/lectureMediaController.js";
import { authenticate, requireRole } from "../middlewares/auth.js";

export const lectureMediaRouter = Router();

lectureMediaRouter.use(authenticate);

lectureMediaRouter.post("/:lectureId", requireRole("instructor", "admin"), uploadMedia);
lectureMediaRouter.get("/:lectureId", listMedia);
lectureMediaRouter.delete("/:mediaId", requireRole("instructor", "admin"), deleteMedia);
