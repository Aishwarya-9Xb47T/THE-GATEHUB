import { Router } from "express";
import { authenticate } from "../../middlewares/auth.js";
import * as ctrl from "../controllers/assessmentController.js";

export const assessmentsV2Router = Router();

assessmentsV2Router.use(authenticate as any);

assessmentsV2Router.post("/", ctrl.create as any);
assessmentsV2Router.get("/", ctrl.list as any);
assessmentsV2Router.get("/:id", ctrl.getById as any);
assessmentsV2Router.patch("/:id", ctrl.update as any);
assessmentsV2Router.post("/:id/lifecycle", ctrl.transition as any);
assessmentsV2Router.post("/:id/publish", ctrl.publish as any);
assessmentsV2Router.post("/:id/archive", ctrl.archive as any);
assessmentsV2Router.get("/:id/versions", ctrl.listVersions as any);
assessmentsV2Router.get("/:id/versions/:versionId", ctrl.getVersion as any);
