import { Router } from "express";
import * as notesController from "../controllers/notesController.js";
import { authenticate } from "../middlewares/auth.js";

export const notesRouter = Router({ mergeParams: true });

notesRouter.get("/", authenticate, notesController.getNote);
notesRouter.put("/", authenticate, notesController.saveNote);
