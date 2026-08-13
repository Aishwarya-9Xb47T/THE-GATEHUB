import { Router } from "express";
import { authenticate, AuthRequest } from "../middlewares/auth.js";

export const testAuthRouter = Router();

testAuthRouter.get("/status", authenticate, (req: AuthRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: "User not authenticated" });
  }
  res.json({ 
    success: true, 
    authenticated: true, 
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      firstName: req.user.firstName,
      lastName: req.user.lastName
    }
  });
});

testAuthRouter.get("/no-auth", (req, res) => {
  const authHeader = req.headers.authorization;
  res.json({ 
    success: true, 
    authenticated: false,
    authHeader: authHeader ? "Present" : "Missing"
  });
});
