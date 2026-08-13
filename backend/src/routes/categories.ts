import { Router } from "express";
import * as categoriesController from "../controllers/categoriesController.js";
import { authenticate, requireRole, Role } from "../middlewares/auth.js";

export const categoryRouter = Router();

categoryRouter.get("/", categoriesController.list);
categoryRouter.get("/:id", categoriesController.getOne);

categoryRouter.post("/", authenticate, requireRole("admin" as Role), categoriesController.create);
categoryRouter.patch("/:id", authenticate, requireRole("admin" as Role), categoriesController.update);
