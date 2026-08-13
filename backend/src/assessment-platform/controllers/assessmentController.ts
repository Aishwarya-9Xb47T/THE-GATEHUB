import type { Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.js";
import * as assessmentService from "../services/assessmentService.js";
import type { LifecycleTransition } from "../domain/lifecycle.js";

function actor(req: AuthRequest) {
  return { userId: req.user!.id, role: req.user!.role };
}

export async function create(req: AuthRequest, res: Response) {
  const data = await assessmentService.createAssessment(req.user!.id, req.body);
  res.status(201).json({ success: true, data });
}

export async function list(req: AuthRequest, res: Response) {
  const { lifecycle, kind, q } = req.query as Record<string, string | undefined>;
  const data = await assessmentService.listAssessments(req.user!.id, req.user!.role, {
    lifecycle,
    kind,
    q,
  });
  res.json({ success: true, data });
}

export async function getById(req: AuthRequest, res: Response) {
  const data = await assessmentService.getAssessment(req.params.id!, actor(req).userId, actor(req).role);
  res.json({ success: true, data });
}

export async function update(req: AuthRequest, res: Response) {
  const data = await assessmentService.updateAssessment(
    req.params.id!,
    actor(req).userId,
    actor(req).role,
    req.body
  );
  res.json({ success: true, data });
}

export async function transition(req: AuthRequest, res: Response) {
  const { action } = req.body as { action: LifecycleTransition };
  const data = await assessmentService.transitionAssessmentLifecycle(
    req.params.id!,
    actor(req).userId,
    actor(req).role,
    action
  );
  res.json({ success: true, data });
}

export async function publish(req: AuthRequest, res: Response) {
  const { changeLog } = req.body as { changeLog?: string };
  const data = await assessmentService.publishAssessment(
    req.params.id!,
    actor(req).userId,
    actor(req).role,
    changeLog
  );
  res.json({ success: true, data });
}

export async function listVersions(req: AuthRequest, res: Response) {
  const data = await assessmentService.listAssessmentVersions(
    req.params.id!,
    actor(req).userId,
    actor(req).role
  );
  res.json({ success: true, data });
}

export async function getVersion(req: AuthRequest, res: Response) {
  const data = await assessmentService.getAssessmentVersion(
    req.params.id!,
    req.params.versionId!,
    actor(req).userId,
    actor(req).role
  );
  res.json({ success: true, data });
}

export async function archive(req: AuthRequest, res: Response) {
  const data = await assessmentService.archiveAssessment(
    req.params.id!,
    actor(req).userId,
    actor(req).role
  );
  res.json({ success: true, data });
}
