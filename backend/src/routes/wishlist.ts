import { Router } from "express";
import * as wishlistController from "../controllers/wishlistController.js";
import { authenticate } from "../middlewares/auth.js";

export const wishlistRouter = Router();

wishlistRouter.use(authenticate);
wishlistRouter.get("/", wishlistController.list);
wishlistRouter.post("/:courseId", wishlistController.add);
wishlistRouter.delete("/:courseId", wishlistController.remove);
wishlistRouter.post("/learning-universe/:learningUniverseId", wishlistController.addLearningUniverse);
wishlistRouter.delete("/learning-universe/:learningUniverseId", wishlistController.removeLearningUniverse);
wishlistRouter.post("/items/:itemId/cart", wishlistController.moveToCart);
