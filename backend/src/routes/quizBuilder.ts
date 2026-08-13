import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import * as ctrl from "../controllers/quizBuilderController.js";

export const quizBuilderRouter = Router();

quizBuilderRouter.use(authenticate);

quizBuilderRouter.get("/my-quizzes", ctrl.listMyQuizzes);
quizBuilderRouter.post("/", ctrl.createQuiz);
quizBuilderRouter.patch("/:quizId/identity", ctrl.applyIdentity);
quizBuilderRouter.get("/:quizId", ctrl.getQuiz);
quizBuilderRouter.patch("/:quizId", ctrl.saveQuiz);
quizBuilderRouter.get("/:quizId/validate", ctrl.validateQuiz);
quizBuilderRouter.post("/:quizId/duplicate", ctrl.duplicateQuiz);
quizBuilderRouter.post("/:quizId/archive", ctrl.archiveQuiz);
quizBuilderRouter.delete("/:quizId", ctrl.deleteQuiz);
quizBuilderRouter.get("/:quizId/versions", ctrl.listVersions);
quizBuilderRouter.post("/:quizId/versions/:version/restore", ctrl.restoreVersion);
