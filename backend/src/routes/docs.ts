import { Router } from "express";
import * as docsController from "../controllers/docsController.js";

export const docsRouter = Router();

docsRouter.get("/", docsController.listDocs);
docsRouter.get("/search", docsController.search);
docsRouter.get("/assistant/stats", docsController.assistantStats);
docsRouter.post("/assistant/chat", docsController.chat);
docsRouter.post("/assistant/stream", docsController.chatStream);
docsRouter.get("/pdf/:manual", docsController.downloadPdf);
