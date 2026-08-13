import { Router } from "express";
import {
  compileLatex,
  createLatexDocument,
  getLatexDocument,
  updateLatexDocument,
  uploadLatexImage,
} from "../controllers/latexController.js";
import { authenticate, requireRole } from "../middlewares/auth.js";
import { latexUpload } from "../middlewares/latexUpload.js";
import { recordTimelineEvent } from "../services/latexVersionService.js";

export const latexRouter = Router();

latexRouter.post("/compile", (req, res, next) => {
  const projectId = typeof req.body?.projectId === "string" ? req.body.projectId : "";
  const origJson = res.json.bind(res);
  res.json = (body: unknown) => {
    if (projectId && typeof body === "object" && body !== null && (body as { success?: boolean }).success) {
      recordTimelineEvent(projectId, "compiled", undefined, { success: true }).catch(() => {});
    }
    return origJson(body);
  };
  return compileLatex(req, res, next);
});

latexRouter.use(authenticate, requireRole("instructor", "admin"));

latexRouter.post("/create", createLatexDocument);
latexRouter.post("/upload-image", latexUpload.single("image"), uploadLatexImage);
latexRouter.get("/:id", getLatexDocument);
latexRouter.put("/:id", updateLatexDocument);
