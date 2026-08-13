import { Router } from "express";
import multer from "multer";
import { authenticate, requireRole } from "../middlewares/auth.js";
import { lazyHandler } from "../utils/lazyHandler.js";

const studioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const ctrl = () => import("../controllers/assessmentStudioController.js");
const aiCtrl = () => import("../controllers/aiAssessmentController.js");
const copilotCtrl = () => import("../controllers/aiCopilotController.js");
const contentCtrl = () => import("../controllers/contentAnalysisController.js");

export const assessmentStudioRouter = Router();

assessmentStudioRouter.use(authenticate);
assessmentStudioRouter.use(requireRole("instructor", "admin", "super_admin"));

assessmentStudioRouter.get("/dashboard", lazyHandler(ctrl, "dashboard"));
assessmentStudioRouter.get("/questions", lazyHandler(ctrl, "listQuestions"));
assessmentStudioRouter.post("/questions", lazyHandler(ctrl, "createQuestion"));
assessmentStudioRouter.get("/questions/:id", lazyHandler(ctrl, "getQuestion"));
assessmentStudioRouter.patch("/questions/:id", lazyHandler(ctrl, "updateQuestion"));
assessmentStudioRouter.delete("/questions/:id", lazyHandler(ctrl, "removeQuestion"));
assessmentStudioRouter.post("/questions/bulk-status", lazyHandler(ctrl, "bulkStatus"));
assessmentStudioRouter.post("/questions/:id/submit-review", lazyHandler(ctrl, "submitReview"));
assessmentStudioRouter.post("/questions/:id/approve", lazyHandler(ctrl, "approve"));
assessmentStudioRouter.post("/migrate", lazyHandler(ctrl, "migrate"));
assessmentStudioRouter.post("/materialize-quiz", lazyHandler(ctrl, "materializeQuiz"));
assessmentStudioRouter.post("/ai/generate", lazyHandler(ctrl, "generateAI"));
assessmentStudioRouter.get("/collections", lazyHandler(ctrl, "listCollections"));
assessmentStudioRouter.post("/collections", lazyHandler(ctrl, "createCollection"));
assessmentStudioRouter.get("/collections/:id", lazyHandler(ctrl, "getCollection"));
assessmentStudioRouter.post("/collections/:id/items", lazyHandler(ctrl, "addToCollection"));

// AI Assessment Studio
assessmentStudioRouter.post("/ai/generate-assessment", studioUpload.single("file"), lazyHandler(aiCtrl, "generateAssessment"));
assessmentStudioRouter.get("/ai/jobs/:jobId", lazyHandler(aiCtrl, "getAiJobStatus"));
assessmentStudioRouter.post("/ai/jobs/:jobId/commit-quiz", lazyHandler(aiCtrl, "commitAiToQuiz"));
assessmentStudioRouter.post("/ai/jobs/:jobId/fill-remaining", lazyHandler(aiCtrl, "fillRemaining"));
assessmentStudioRouter.post("/ai/jobs/:jobId/copilot", lazyHandler(copilotCtrl, "runCopilotCommand"));
assessmentStudioRouter.post("/ai/jobs/:jobId/copilot/action", lazyHandler(copilotCtrl, "runCopilotAction"));

// Content Analysis (Build from Content)
assessmentStudioRouter.post("/content/analyze", studioUpload.single("file"), lazyHandler(contentCtrl, "analyzeContent"));
assessmentStudioRouter.post("/content/analyze-with-document-intelligence", studioUpload.single("file"), lazyHandler(contentCtrl, "analyzeWithDocumentIntelligence"));
assessmentStudioRouter.get("/content/supported-sources", lazyHandler(contentCtrl, "getSupportedSources"));
