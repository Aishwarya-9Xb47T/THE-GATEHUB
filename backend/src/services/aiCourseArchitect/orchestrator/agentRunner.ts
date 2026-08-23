/**
 * V4 — Generic agent runner: validate → retry failed stage only → confidence score.
 *
 * SAFETY: `lastOutput` is initialized to `undefined` (not with `!`).
 * If ALL execute() calls throw, `lastOutput` will genuinely be `undefined`.
 * Callers MUST guard `result.output` before accessing its properties.
 * `result.success === false` is the signal that output may be undefined.
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
  // SAFETY: Do NOT use `!` here — if all attempts throw, this stays undefined.
  // The return path below handles this correctly without accessing undefined.
  let lastOutput: TOut | undefined = undefined;
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
      console.warn(`[AgentRunner] stage=${opts.stage} attempt=${attempt}/${maxAttempts} error: ${msg}`);
      if (err instanceof GeminiRequestError && !err.retryable) {
        // Non-retryable (e.g. 404 model-not-found): do not retry further.
        break;
      }
      if (err instanceof GeminiRequestError && attempt === maxAttempts) {
        // Last attempt and still failing: propagate so delivery pipeline can fall back.
        break;
      }
    }
  }

  // All attempts exhausted or broke early.
  // Return a failure result. `output` may be undefined if every attempt threw.
  // Callers MUST check `result.success` or `result.output != null` before accessing output.
  return {
    stage: opts.stage,
    success: false,
    output: lastOutput as TOut, // May be undefined — callers must guard
    confidence: lastOutput !== undefined ? confidenceFromReport(lastValidation) : 0,
    validation: lastValidation,
    attempts: maxAttempts,
    errors,
  };
}
