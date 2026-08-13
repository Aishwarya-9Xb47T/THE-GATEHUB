import { Router } from "express";
import * as coursesController from "../controllers/coursesController.js";
import {
  publishCourseFromDsl,
  rehydrateProjectFromCourse,
} from "../controllers/coursePublishController.js";
import { parseCourseDslLatex } from "../controllers/course-dsl-parser.js";
import { authenticate, optionalAuthenticate, requireRole, Role, AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { downloadCompleteCourse } from "../controllers/enhancedCourseDownloadController.js";

export const courseRouter = Router();

courseRouter.get("/", optionalAuthenticate, coursesController.list);
courseRouter.get("/my-instructor", authenticate, requireRole("instructor", "admin" as Role), coursesController.listMyInstructor);

courseRouter.post("/publish-from-dsl", authenticate, requireRole("instructor", "admin" as Role), async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError(401, "Unauthorized");

    const { dslSource, projectId, courseId } = req.body as {
      dslSource?: string;
      projectId?: string;
      courseId?: string;
    };

    if (!dslSource?.trim()) {
      return res.status(400).json({ success: false, error: "dslSource is required" });
    }

    const course = await publishCourseFromDsl(dslSource, userId, { projectId, courseId });
    res.status(courseId ? 200 : 201).json({ success: true, course });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: (err as Error).message || "Failed to publish course from DSL" });
  }
});

courseRouter.post("/parse-dsl-preview", authenticate, requireRole("instructor", "admin" as Role), async (req: AuthRequest, res) => {
  try {
    const { dslSource } = req.body as { dslSource?: string };
    if (!dslSource?.trim()) {
      return res.status(400).json({ success: false, error: "dslSource is required" });
    }
    const parsed = parseCourseDslLatex(dslSource);
    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: (err as Error).message || "Failed to parse course DSL" });
  }
});

courseRouter.post("/:id/rehydrate-project", authenticate, requireRole("instructor", "admin" as Role), async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError(401, "Unauthorized");
    const project = await rehydrateProjectFromCourse(req.params.id, userId, req.user?.role);
    res.json({ success: true, data: project });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: (err as Error).message || "Failed to rehydrate project" });
  }
});

courseRouter.get("/:id", optionalAuthenticate, coursesController.getOne);
courseRouter.get("/:id/learn", optionalAuthenticate, coursesController.getStudentCourse);
courseRouter.get("/:id/download", authenticate, coursesController.downloadCourse);
courseRouter.get("/:id/download-complete", authenticate, downloadCompleteCourse);
courseRouter.post(
  "/:id/preview-certificate",
  authenticate,
  requireRole("instructor", "admin" as Role),
  coursesController.previewCourseCertificate
);
courseRouter.get("/:id/ai-details", optionalAuthenticate, coursesController.getAIDetails);

courseRouter.post("/", authenticate, requireRole("instructor", "admin" as Role), coursesController.create);
courseRouter.post("/ai-authoring-preview", authenticate, requireRole("instructor", "admin" as Role), coursesController.previewAICourseAuthoring);
courseRouter.post("/create-with-authoring", authenticate, requireRole("instructor", "admin" as Role), coursesController.createCourseWithAuthoring);
courseRouter.post("/generate-ai", authenticate, requireRole("instructor", "admin" as Role), coursesController.generateAICourse);
courseRouter.post("/:id/generate-landing", authenticate, requireRole("instructor", "admin" as Role), coursesController.generateAILandingPage);
courseRouter.patch("/:id", authenticate, coursesController.update);
courseRouter.delete("/:id", authenticate, coursesController.remove);
