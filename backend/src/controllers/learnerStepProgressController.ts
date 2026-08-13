import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import { requireLearnerScope } from "../services/learnerScopeService.js";
import {
  loadStepProgressTree,
  upsertStepProgress,
  updateResumePosition,
  recalculateCourseProgressFromSteps,
} from "../services/learnerStepProgressService.js";

export async function getStepProgress(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const scope = await requireLearnerScope(req.user.id, req.params.id);
  const steps = await loadStepProgressTree(scope);
  res.json({
    success: true,
    publishVersionId: scope.publishVersionId,
    steps,
  });
}

export async function patchStepProgress(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const learningUniverseId = req.params.id;
  const scope = await requireLearnerScope(req.user.id, learningUniverseId);

  const { lessonId, stepId, completed, visited, progress, timeSpentDelta, componentState } =
    req.body as {
      lessonId: string;
      stepId: string;
      completed?: boolean;
      visited?: boolean;
      progress?: number;
      timeSpentDelta?: number;
      componentState?: Record<string, unknown>;
    };

  if (!lessonId || !stepId) throw new AppError(400, "lessonId and stepId are required");

  await upsertStepProgress(scope, {
    lessonId,
    stepId,
    completed,
    visited,
    progress,
    timeSpentDelta,
    componentState,
  });

  await updateResumePosition(scope, lessonId, stepId);

  const percentComplete = await recalculateCourseProgressFromSteps(scope);

  res.json({ success: true, percentComplete });
}

export async function bulkSyncStepProgress(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const scope = await requireLearnerScope(req.user.id, req.params.id);
  const { steps } = req.body as {
    steps: Array<{
      lessonId: string;
      stepId: string;
      completed?: boolean;
      visited?: boolean;
      progress?: number;
      timeSpent?: number;
      componentState?: Record<string, unknown>;
      lastVisited?: string | null;
    }>;
  };

  if (!Array.isArray(steps)) throw new AppError(400, "steps array required");

  for (const s of steps) {
    await upsertStepProgress(scope, {
      lessonId: s.lessonId,
      stepId: s.stepId,
      completed: s.completed,
      visited: s.visited,
      progress: s.progress,
      componentState: s.componentState,
    });
  }

  const percentComplete = await recalculateCourseProgressFromSteps(scope);

  res.json({ success: true, synced: steps.length, percentComplete });
}
