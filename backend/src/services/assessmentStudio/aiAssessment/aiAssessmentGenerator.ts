import { randomUUID } from "crypto";
import type { AiAssessmentConfig, AiGeneratedQuestion } from "./types.js";
import { AiRouter, getLastAiRunMeta } from "../../ai/AiRouter.js";

export interface AiGenerationMeta {
  modelNotice?: {
    title: string;
    message: string;
    requestedModel?: string;
    activeModel?: string;
  };
  devMode?: boolean;
}

export async function generateQuestionsFromContent(
  content: string,
  config: AiAssessmentConfig,
  context?: { jobId?: string; requestId?: string; signal?: AbortSignal }
): Promise<{ questions: AiGeneratedQuestion[]; meta?: AiGenerationMeta }> {
  const requestId = context?.requestId || randomUUID();
  const questions = await AiRouter.generateAssessment({
    content,
    config,
    context: { jobId: context?.jobId, requestId },
    options: { signal: context?.signal },
  });

  const runMeta = getLastAiRunMeta();
  const meta: AiGenerationMeta = {};

  if (runMeta?.modelResolution?.fallbackUsed) {
    const r = runMeta.modelResolution;
    meta.modelNotice = {
      title: "Using compatible AI model",
      message: `Automatically switched from ${r.configuredModel} to ${r.activeModel}.`,
      requestedModel: r.configuredModel,
      activeModel: r.activeModel,
    };
  }
  if (runMeta?.devMode) {
    meta.devMode = true;
  }

  return { questions, meta: Object.keys(meta).length ? meta : undefined };
}

export function buildTopicContent(config: AiAssessmentConfig, text?: string): string {
  const lines = [
    `Quiz: ${config.quizName}`,
    config.subject && `Subject: ${config.subject}`,
    config.module && `Module: ${config.module}`,
    config.chapter && `Chapter: ${config.chapter}`,
    config.learningOutcome && `Learning outcomes: ${config.learningOutcome}`,
    config.topic && `Topic: ${config.topic}`,
    config.targetAudience && `Audience: ${config.targetAudience}`,
    config.examType && `Exam type: ${config.examType}`,
    text?.trim() && `\nAdditional notes:\n${text.trim()}`,
  ].filter(Boolean);
  return lines.join("\n");
}
