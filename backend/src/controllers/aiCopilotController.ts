import { Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../middlewares/auth.js";
import { AppError } from "../middlewares/errorHandler.js";
import * as aiService from "../services/assessmentStudio/aiAssessment/aiAssessmentService.js";
import {
  executeCopilotCommand,
  type CopilotProgressEvent,
} from "../services/assessmentStudio/aiAssessment/aiCopilotService.js";
import type { CopilotIntent } from "../services/assessmentStudio/aiAssessment/aiCopilotCommandParser.js";
import type { AiGeneratedQuestion } from "../services/assessmentStudio/aiAssessment/types.js";

const commandSchema = z.object({
  command: z.string().min(1).max(2000),
  questionIds: z.array(z.string()).optional(),
  intent: z.string().optional(),
  stream: z.boolean().optional(),
});

const actionSchema = z.object({
  intent: z.string(),
  questionIds: z.array(z.string()).optional(),
  language: z.string().optional(),
});

async function loadJobPreview(jobId: string, userId: string, role: string) {
  const data = await aiService.getAiJobStatus(jobId, userId, role);
  if (data.status !== "ready" || !data.preview) {
    throw new AppError(400, "Assessment preview not ready");
  }
  return data.preview;
}

function sendSse(res: Response, payload: CopilotProgressEvent) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function runCopilotCommand(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const body = commandSchema.parse(req.body ?? {});
  const preview = await loadJobPreview(req.params.jobId, req.user.id, req.user.role);

  if (body.stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const result = await executeCopilotCommand({
      command: body.command,
      questions: preview.questions,
      config: preview.config,
      questionIds: body.questionIds,
      intent: body.intent as CopilotIntent | undefined,
      onProgress: (e) => sendSse(res, e),
    });

    await aiService.updateAiJobPreview(req.params.jobId, req.user.id, {
      ...preview,
      questions: result.questions,
    });

    sendSse(res, { type: "done", summary: result.message, modifiedIds: result.modifiedIds });
    res.end();
    return;
  }

  const result = await executeCopilotCommand({
    command: body.command,
    questions: preview.questions,
    config: preview.config,
    questionIds: body.questionIds,
    intent: body.intent as CopilotIntent | undefined,
  });

  await aiService.updateAiJobPreview(req.params.jobId, req.user.id, {
    ...preview,
    questions: result.questions,
  });

  res.json({
    success: true,
    data: {
      questions: result.questions,
      message: result.message,
      modifiedIds: result.modifiedIds,
    },
  });
}

export async function runCopilotAction(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, "Unauthorized");

  const body = actionSchema.parse(req.body ?? {});
  const preview = await loadJobPreview(req.params.jobId, req.user.id, req.user.role);
  const intent = body.intent as CopilotIntent;

  const stream = req.query.stream === "1" || req.query.stream === "true";
  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
  }

  const comparisons: Array<{ questionId: string; original: AiGeneratedQuestion; improved: AiGeneratedQuestion }> = [];

  const result = await executeCopilotCommand({
    command: body.intent,
    questions: preview.questions,
    config: preview.config,
    questionIds: body.questionIds,
    intent,
    onProgress: stream
      ? (e) => {
          if (e.type === "question_updated" && e.original) {
            comparisons.push({ questionId: e.questionId, original: e.original, improved: e.question });
          }
          sendSse(res, e);
        }
      : (e) => {
          if (e.type === "question_updated" && e.original) {
            comparisons.push({ questionId: e.questionId, original: e.original, improved: e.question });
          }
        },
  });

  await aiService.updateAiJobPreview(req.params.jobId, req.user.id, {
    ...preview,
    questions: result.questions,
  });

  if (stream) {
    sendSse(res, {
      type: "done",
      summary: result.message,
      modifiedIds: result.modifiedIds,
    });
    res.end();
    return;
  }

  res.json({
    success: true,
    data: {
      questions: result.questions,
      message: result.message,
      modifiedIds: result.modifiedIds,
      comparisons,
    },
  });
}
