/**
 * V4 — Generic agent runner: validate → retry failed stage only → confidence score.
 */
import type { AgentResult, AgentStageId } from "./contracts.js";
import type { ArchitectQualityReport } from "../types.js";
import { GeminiRequestError } from "../geminiClient.js";

export type AgentValidator<T> = (output: T) => ArchitectQualityReport;

export type AgentExecutor<TIn, TOut> = (input: TIn, attempt: number, priorErrors: string[]) => Promise<TOut>;

export interface RunAgentOptions<TIn, TOut> {
  stage: AgentStageId;
  input: TIn;
  execute: AgentExecutor<TIn, TOut>;
  validate: AgentValidator<TOut>;
  maxAttempts?: number;
  minConfidence?: number;
}

function confidenceFromReport(report: ArchitectQualityReport): number {
  return Math.max(0, Math.min(100, report.score));
}

export async function runAgent<TIn, TOut>(opts: RunAgentOptions<TIn, TOut>): Promise<AgentResult<TOut>> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const minConfidence = opts.minConfidence ?? 85;
  const errors: string[] = [];
  let lastOutput!: TOut;
  let lastValidation: ArchitectQualityReport = {
    score: 0,
    passed: false,
    checks: [],
    suggestions: ["No attempt completed"],
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      lastOutput = await opts.execute(opts.input, attempt, errors);
      lastValidation = opts.validate(lastOutput);
      const confidence = confidenceFromReport(lastValidation);

      if (lastValidation.passed && confidence >= minConfidence) {
        return {
          stage: opts.stage,
          success: true,
          output: lastOutput,
          confidence,
          validation: lastValidation,
          attempts: attempt,
          errors,
        };
      }

      errors.push(
        ...lastValidation.suggestions,
        ...lastValidation.checks.filter((c) => c.status === "fail").map((c) => c.detail)
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Attempt ${attempt}: ${msg}`);
      if (err instanceof GeminiRequestError && !err.retryable) {
        throw err;
      }
      if (err instanceof GeminiRequestError && attempt === maxAttempts) {
        throw err;
      }
    }
  }

  return {
    stage: opts.stage,
    success: lastValidation.passed,
    output: lastOutput,
    confidence: confidenceFromReport(lastValidation),
    validation: lastValidation,
    attempts: maxAttempts,
    errors,
  };
}
