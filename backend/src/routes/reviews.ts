import { Router } from "express";
import * as reviewsController from "../controllers/reviewsController.js";
import { authenticate } from "../middlewares/auth.js";

export const reviewRouter = Router();

reviewRouter.get("/", reviewsController.listByCourse);
reviewRouter.get("/public/top", reviewsController.getTopReviews);
reviewRouter.get("/instructor", authenticate, reviewsController.getInstructorReviews);
reviewRouter.post("/", authenticate, reviewsController.create);
reviewRouter.delete("/:id", authenticate, reviewsController.remove);
