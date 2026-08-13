import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import {
  duplicateLibraryTemplate,
  favoriteLibraryTemplate,
  generateLibraryAiTemplate,
  fillRemainingLibraryAiTemplate,
  getLibraryTemplate,
  getTemplateCategories,
  listLibraryTemplates,
  removeLibraryTemplate,
  saveLibraryTemplate,
  useLibraryTemplate,
} from "../controllers/templateLibraryController.js";

export const templateLibraryRouter = Router();

templateLibraryRouter.use(authenticate);

templateLibraryRouter.get("/categories", getTemplateCategories);
templateLibraryRouter.post("/ai/generate", generateLibraryAiTemplate);
templateLibraryRouter.post("/ai/fill-remaining", fillRemainingLibraryAiTemplate);
templateLibraryRouter.get("/", listLibraryTemplates);
templateLibraryRouter.get("/:id", getLibraryTemplate);
templateLibraryRouter.post("/:id/use", useLibraryTemplate);
templateLibraryRouter.post("/:id/duplicate", duplicateLibraryTemplate);
templateLibraryRouter.post("/:id/favorite", favoriteLibraryTemplate);
templateLibraryRouter.post("/save", saveLibraryTemplate);
templateLibraryRouter.delete("/:id", removeLibraryTemplate);
