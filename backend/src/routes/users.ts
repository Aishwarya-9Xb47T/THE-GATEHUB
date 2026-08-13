import { Router } from "express";
import * as usersController from "../controllers/usersController.js";
import { authenticate } from "../middlewares/auth.js";

export const userRouter = Router();

userRouter.use(authenticate);
userRouter.get("/me", usersController.getProfile);
userRouter.patch("/me", usersController.updateProfile);
