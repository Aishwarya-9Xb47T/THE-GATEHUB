/**
 * V6 Part 4 — Continuous learning system (feedback-driven improvement).
 */
import { recordQualityMetrics, loadRecentMetrics } from "./continuousImprovement.js";

export interface LearningFeedbackSignal {
  type:
    | "completion-rate"
    | "quiz-accuracy"
    | "assignment-outcome"
    | "project-success"
    | "rating"
    | "instructor-edit"
    | "regeneration"
    | "qa-failure";
  value: number;
  anonymizedCourseId: string;
  recordedAt: string;
}

const feedbackBuffer: LearningFeedbackSignal[] = [];

export function recordFeedbackSignal(signal: Omit<LearningFeedbackSignal, "recordedAt">): void {
  feedbackBuffer.push({ ...signal, recordedAt: new Date().toISOString() });
  if (feedbackBuffer.length > 500) feedbackBuffer.shift();
}

export async function aggregateLearningInsights(): Promise<{
  avgQualityScore: number;
  publishRate: number;
  topFailureTypes: string[];
  sampleSize: number;
}> {
  const metrics = await loadRecentMetrics(50);
  const avgQualityScore = metrics.length
    ? Math.round(metrics.reduce((n, m) => n + m.overallScore, 0) / metrics.length)
    : 0;
  const publishRate = metrics.length
    ? metrics.filter((m) => m.publishReady).length / metrics.length
    : 0;
  const failureTypes = feedbackBuffer
    .filter((f) => f.type === "qa-failure" || f.type === "regeneration")
    .map((f) => f.type);

  return {
    avgQualityScore,
    publishRate: Math.round(publishRate * 100),
    topFailureTypes: [...new Set(failureTypes)].slice(0, 5),
    sampleSize: metrics.length,
  };
}

export async function recordGenerationOutcome(opts: {
  subject: string;
  lessonCount: number;
  overallScore: number;
  publishReady: boolean;
  dimensions: Record<string, number>;
}): Promise<void> {
  await recordQualityMetrics(opts);
}
