import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.js";
import { logDesignerEvent, validateDesignerPayload } from "../services/aiQuizDesigner/aiQuizDesignerService.js";

export async function postDesignerAnalytics(req: AuthRequest, res: Response) {
  const { event, meta } = req.body as { event?: string; meta?: Record<string, unknown> };
  if (!event) {
    res.status(400).json({ success: false, error: "event required" });
    return;
  }
  const data = await logDesignerEvent(req.user!.id, event, meta);
  res.json({ success: true, data });
}

export async function validateDesigner(req: AuthRequest, res: Response) {
  const result = validateDesignerPayload(req.body);
  res.json({ success: true, data: result });
}
