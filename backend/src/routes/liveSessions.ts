import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import * as liveSessionController from "../controllers/liveSessionController.js";
import { upload } from "../middlewares/upload.js";

export const liveSessionRouter = Router();

liveSessionRouter.get("/music/list", authenticate, liveSessionController.listMusic);
liveSessionRouter.get("/music/default", authenticate, liveSessionController.listDefaultMusic);
liveSessionRouter.post("/music/upload", authenticate, upload.single("file"), liveSessionController.uploadMusic);
liveSessionRouter.delete("/music/:id", authenticate, liveSessionController.deleteMusic);

liveSessionRouter.post("/", authenticate, liveSessionController.create);
liveSessionRouter.get("/my", authenticate, liveSessionController.mySessions);
liveSessionRouter.get("/history", authenticate, liveSessionController.myHistory);
liveSessionRouter.get("/question-bank", authenticate, liveSessionController.questionBank);
liveSessionRouter.get("/preview", authenticate, liveSessionController.preview);
liveSessionRouter.get("/reports", authenticate, liveSessionController.reports);
liveSessionRouter.get("/templates", authenticate, liveSessionController.templates);
liveSessionRouter.post("/templates", authenticate, liveSessionController.createTemplate);
liveSessionRouter.delete("/templates/:templateId", authenticate, liveSessionController.removeTemplate);
liveSessionRouter.get("/preferences", authenticate, liveSessionController.getPreferences);
liveSessionRouter.put("/preferences", authenticate, liveSessionController.savePreferences);
liveSessionRouter.get("/lookup/:code", authenticate, liveSessionController.lookupByCode);
liveSessionRouter.get("/room/:code", authenticate, liveSessionController.getByRoomCode);
liveSessionRouter.patch("/:id", authenticate, liveSessionController.update);
liveSessionRouter.post("/:id/launch", authenticate, liveSessionController.launch);
liveSessionRouter.post("/:id/duplicate", authenticate, liveSessionController.duplicate);
liveSessionRouter.delete("/:id", authenticate, liveSessionController.remove);
liveSessionRouter.get("/:id", authenticate, liveSessionController.getOne);
liveSessionRouter.get("/:id/state", authenticate, liveSessionController.state);
liveSessionRouter.get("/:id/player-view", authenticate, liveSessionController.playerView);
liveSessionRouter.get("/:id/analytics", authenticate, liveSessionController.analytics);
liveSessionRouter.post("/:id/join", authenticate, liveSessionController.join);
liveSessionRouter.post("/:id/answer", authenticate, liveSessionController.submitAnswer);
liveSessionRouter.get("/:id/export-csv", authenticate, liveSessionController.exportCsv);
liveSessionRouter.get("/:id/export-excel", authenticate, liveSessionController.exportExcel);
liveSessionRouter.get("/:id/export-pdf", authenticate, liveSessionController.exportPdf);
liveSessionRouter.get("/:id/replay-data", authenticate, liveSessionController.replayData);
liveSessionRouter.get("/:id/students", authenticate, liveSessionController.listSessionStudents);
liveSessionRouter.get(
  "/:id/participants/:participantId/review",
  authenticate,
  liveSessionController.getParticipantAttemptReview
);
liveSessionRouter.get(
  "/:id/questions/:questionId/responses",
  authenticate,
  liveSessionController.getQuestionResponses
);
liveSessionRouter.get("/:id/review", authenticate, liveSessionController.getReview);
liveSessionRouter.post("/:id/start", authenticate, liveSessionController.start);
liveSessionRouter.post("/:id/next", authenticate, liveSessionController.nextQuestion);
liveSessionRouter.post("/:id/finish", authenticate, liveSessionController.finish);
liveSessionRouter.get("/:id/validate-quiz", authenticate, liveSessionController.validateQuiz);
liveSessionRouter.post("/:id/auto-fix-quiz", authenticate, liveSessionController.autoFixQuiz);

