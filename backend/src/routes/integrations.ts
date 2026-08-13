import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import { lazyHandler } from "../utils/lazyHandler.js";

const ctrl = () => import("../controllers/integrationsController.js");

export const integrationsRouter = Router();

integrationsRouter.get("/providers", authenticate, lazyHandler(ctrl, "listProviders"));
integrationsRouter.get("/google/status", authenticate, lazyHandler(ctrl, "googleStatus"));
integrationsRouter.get("/google/connect", authenticate, lazyHandler(ctrl, "googleConnect"));
integrationsRouter.get("/google/callback", lazyHandler(ctrl, "googleCallback"));
integrationsRouter.post("/google/disconnect", authenticate, lazyHandler(ctrl, "googleDisconnect"));
integrationsRouter.post(
  "/learning-universes/:id/lessons/:lessonId/workspaces/:stepId/colab-launch",
  authenticate,
  lazyHandler(ctrl, "launchColabCompanion")
);
integrationsRouter.post("/overleaf/launch", authenticate, lazyHandler(ctrl, "launchOverleafCompanion"));
integrationsRouter.get("/google/colab-url", authenticate, lazyHandler(ctrl, "getColabCompanionUrl"));

integrationsRouter.get(
  "/learning-universes/:id/lessons/:lessonId/workspaces/:stepId",
  authenticate,
  lazyHandler(ctrl, "getWorkspace")
);
integrationsRouter.put(
  "/learning-universes/:id/lessons/:lessonId/workspaces/:stepId",
  authenticate,
  lazyHandler(ctrl, "saveWorkspace")
);
integrationsRouter.post(
  "/learning-universes/:id/lessons/:lessonId/workspaces/:stepId/restore",
  authenticate,
  lazyHandler(ctrl, "restoreWorkspace")
);
