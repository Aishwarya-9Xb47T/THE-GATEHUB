/**
 * V6 Part 4 — Observability (agent timing, costs, quality metrics).
 */
import type { AgentStageId } from "../orchestrator/contracts.js";

export interface AgentExecutionMetric {
  stage: AgentStageId | string;
  durationMs: number;
  attempts: number;
  confidence: number;
  passed: boolean;
  tokenEstimate?: number;
  errors: string[];
  recordedAt: string;
}

export interface ObservabilitySnapshot {
  metrics: AgentExecutionMetric[];
  totalDurationMs: number;
  estimatedTokenUsage: number;
  estimatedCostUsd: number;
  retrievalQuality: number;
  qaScore: number;
  regenerationCount: number;
}

const TOKEN_COST_PER_1K = 0.003;

export class ObservabilityCollector {
  private metrics: AgentExecutionMetric[] = [];
  private regenCount = 0;

  record(stage: AgentStageId | string, durationMs: number, opts: Partial<AgentExecutionMetric> = {}): void {
    this.metrics.push({
      stage,
      durationMs,
      attempts: opts.attempts ?? 1,
      confidence: opts.confidence ?? 0,
      passed: opts.passed ?? true,
      tokenEstimate: opts.tokenEstimate,
      errors: opts.errors ?? [],
      recordedAt: new Date().toISOString(),
    });
  }

  recordRegeneration(): void {
    this.regenCount++;
  }

  snapshot(qaScore = 0, retrievalQuality = 0): ObservabilitySnapshot {
    const totalDurationMs = this.metrics.reduce((n, m) => n + m.durationMs, 0);
    const estimatedTokenUsage = this.metrics.reduce((n, m) => n + (m.tokenEstimate ?? 500), 0);
    return {
      metrics: [...this.metrics],
      totalDurationMs,
      estimatedTokenUsage,
      estimatedCostUsd: Math.round((estimatedTokenUsage / 1000) * TOKEN_COST_PER_1K * 100) / 100,
      retrievalQuality,
      qaScore,
      regenerationCount: this.regenCount,
    };
  }
}

export const globalObservability = new ObservabilityCollector();
