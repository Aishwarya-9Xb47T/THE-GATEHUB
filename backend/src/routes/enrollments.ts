import { Router } from "express";
import * as enrollmentsController from "../controllers/enrollmentsController.js";
import { authenticate } from "../middlewares/auth.js";

export const enrollmentRouter = Router({ mergeParams: true });

enrollmentRouter.post("/:courseId", authenticate, enrollmentsController.enroll);
enrollmentRouter.get("/:courseId/check", authenticate, enrollmentsController.check);
enrollmentRouter.get("/my", authenticate, enrollmentsController.myEnrollments);
enrollmentRouter.get("/:courseId/progress", authenticate, enrollmentsController.getProgress);
enrollmentRouter.patch("/:courseId/lectures/:lectureId/progress", authenticate, enrollmentsController.updateLectureProgress);
enrollmentRouter.get("/instructor/students", authenticate, enrollmentsController.getInstructorStudents);
