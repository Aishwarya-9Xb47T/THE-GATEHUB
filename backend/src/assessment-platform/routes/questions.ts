import { Router } from "express";
import { authenticate } from "../../middlewares/auth.js";
import * as ctrl from "../controllers/questionController.js";

export const questionsV2Router = Router();

questionsV2Router.use(authenticate as any);

// Questions
questionsV2Router.post("/", ctrl.create as any);
questionsV2Router.get("/", ctrl.list as any);
questionsV2Router.post("/import", ctrl.importBatch as any);
questionsV2Router.get("/collections", ctrl.listCollections as any);
questionsV2Router.post("/collections", ctrl.createCollection as any);
questionsV2Router.get("/collections/:collectionId/questions", ctrl.listCollectionQuestions as any);
questionsV2Router.post("/collections/:collectionId/items", ctrl.addToCollection as any);
questionsV2Router.delete("/collections/:collectionId/items/:questionId", ctrl.removeFromCollection as any);

questionsV2Router.get("/:id", ctrl.getById as any);
questionsV2Router.patch("/:id", ctrl.update as any);
questionsV2Router.post("/:id/publish", ctrl.publish as any);
questionsV2Router.post("/:id/archive", ctrl.archive as any);
questionsV2Router.post("/:id/fork", ctrl.fork as any);
questionsV2Router.post("/:id/validate", ctrl.validate as any);
questionsV2Router.post("/:id/tags", ctrl.tag as any);
questionsV2Router.post("/:id/relations", ctrl.addRelation as any);
questionsV2Router.delete("/relations/:relationId", ctrl.removeRelation as any);
questionsV2Router.post("/:id/media", ctrl.attachMedia as any);
questionsV2Router.delete("/media/:usageId", ctrl.detachMedia as any);
questionsV2Router.get("/:id/versions", ctrl.listVersions as any);
questionsV2Router.get("/:id/versions/:versionId", ctrl.getVersion as any);
questionsV2Router.post("/versions/:versionId/evaluate", ctrl.evaluate as any);
