import { Router } from "express";
import * as resourceController from "../controllers/resourceController.js";
import { authenticate, requireRole, Role } from "../middlewares/auth.js";

export const resourceRouter = Router();

// Resource course routes
resourceRouter.post("/courses", authenticate, requireRole("instructor", "admin" as Role), resourceController.createResourceCourse);
resourceRouter.get("/courses", resourceController.getAllResourceCourses);
resourceRouter.get("/courses/instructor", authenticate, requireRole("instructor", "admin" as Role), resourceController.getInstructorResourceCourses);
resourceRouter.get("/courses/:id", resourceController.getResourceCourse);
resourceRouter.patch("/courses/:id", authenticate, requireRole("instructor", "admin" as Role), resourceController.updateResourceCourse);
resourceRouter.post("/courses/:id/toggle-publish", authenticate, requireRole("instructor", "admin" as Role), resourceController.togglePublishCourse);
resourceRouter.delete("/courses/:courseId", authenticate, requireRole("instructor", "admin" as Role), resourceController.deleteCourse);
resourceRouter.delete("/:courseId", authenticate, requireRole("instructor", "admin" as Role), resourceController.deleteCourse);

// Resource content routes
resourceRouter.post("/content/save", authenticate, requireRole("instructor", "admin" as Role), resourceController.saveResourceContent);
resourceRouter.get("/content/:courseId", resourceController.getResourceContent);

// Code execution
resourceRouter.post("/execute", authenticate, resourceController.executeCode);
resourceRouter.post("/coding-lab/execute", authenticate, resourceController.executeCodingLab);
resourceRouter.post("/coding-lab/submit", authenticate, resourceController.submitCodingLab);

