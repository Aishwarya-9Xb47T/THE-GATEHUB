import { Router } from "express";
import * as sectionsController from "../controllers/sectionsController.js";
import { authenticate } from "../middlewares/auth.js";

export const sectionRouter = Router({ mergeParams: true });

sectionRouter.get("/", authenticate, sectionsController.listByCourse);
sectionRouter.post("/", authenticate, sectionsController.create);
sectionRouter.patch("/:id", authenticate, sectionsController.update);
sectionRouter.delete("/:id", authenticate, sectionsController.remove);
sectionRouter.post("/reorder", authenticate, sectionsController.reorder);
