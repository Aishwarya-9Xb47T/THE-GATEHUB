/**
 * V6 Agent 5 — Code Validation
 * Executes and verifies generated code. Regenerates code only — never lessons.
 */
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import type { ArchitectLessonBlueprint, ArchitectQualityReport, CodeValidationMeta } from "../types.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { executeCodeSnippet, syntaxLooksValid } from "../codeExecutor.js";
import { runCodeGeneratorAgent, applyCodeToLesson } from "./codeGeneratorAgent.js";
import { getAgentSpec } from "../agentSpecifications.js";
import { getCachedVerification, setCachedVerification } from "../retrieval/cache.js";

export interface CodeValidationOutput {
  meta: CodeValidationMeta;
  lesson: ArchitectLessonBlueprint;
}

function cacheKey(lessonId: string, code: string): string {
  return `codeval:${lessonId}:${code.length}:${code.slice(0, 64)}`;
}

export async function validateAndFixLessonCode(
  lesson: ArchitectLessonBlueprint,
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan
): Promise<CodeValidationOutput> {
  const lang = ctx.interview.courseInfo.language;
  let current = lesson;
  let regenerated = false;

  for (let attempt = 1; attempt <= AGENT_MAX_ATTEMPTS; attempt++) {
    const code = current.codeExample ?? "";
    if (!code) {
      return {
        meta: {
          passed: false,
          executionSuccess: false,
          syntaxValid: false,
          stderr: "No code to validate",
          language: lang,
          validatedAt: new Date().toISOString(),
        },
        lesson: current,
      };
    }

    const key = cacheKey(current.id, code);
    const cached = getCachedVerification(key);
    if (cached === true) {
      return {
        meta: {
          passed: true,
          executionSuccess: true,
          syntaxValid: true,
          stdout: "(cached)",
          language: lang,
          validatedAt: new Date().toISOString(),
        },
        lesson: { ...current, codeValidation: { passed: true, executionSuccess: true, syntaxValid: true, validatedAt: new Date().toISOString() } },
      };
    }

    const syntaxValid = syntaxLooksValid(code, lang);
    const exec = await executeCodeSnippet(code, lang);
    const passed = syntaxValid && exec.success;

    if (passed) {
      setCachedVerification(key, true);
      const meta: CodeValidationMeta = {
        passed: true,
        executionSuccess: true,
        syntaxValid: true,
        stdout: exec.stdout,
        stderr: exec.stderr,
        durationMs: exec.durationMs,
        language: exec.language,
        validatedAt: new Date().toISOString(),
      };
      return { meta, lesson: { ...current, codeValidation: meta } };
    }

    if (attempt < AGENT_MAX_ATTEMPTS) {
      const regen = await runCodeGeneratorAgent(ctx, plan, {
        ...current,
        theory: `${current?.theory ?? ""}\n\n[CODE FIX REQUIRED: ${exec.stderr || "invalid syntax"}]`,
      });
      if (regen.output) {
        current = applyCodeToLesson(current, regen.output);
      }
      regenerated = true;
      continue;
    }

    const meta: CodeValidationMeta = {
      passed: false,
      executionSuccess: exec.success,
      syntaxValid,
      stdout: exec.stdout,
      stderr: exec.stderr,
      durationMs: exec.durationMs,
      language: exec.language,
      validatedAt: new Date().toISOString(),
    };
    return { meta, lesson: { ...current, codeValidation: meta } };
  }

  return {
    meta: {
      passed: false,
      executionSuccess: false,
      syntaxValid: false,
      validatedAt: new Date().toISOString(),
    },
    lesson: current,
  };
}

function validateOutput(output: CodeValidationOutput): ArchitectQualityReport {
  const m = output.meta;
  const checks = [
    { id: "syntax", label: "Syntax valid", status: m.syntaxValid ? ("pass" as const) : ("fail" as const), detail: m.language ?? "" },
    { id: "execution", label: "Code executes", status: m.executionSuccess ? ("pass" as const) : ("fail" as const), detail: (m.stderr ?? "").slice(0, 80) },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return {
    score: Math.max(0, 100 - fail * 45),
    passed: m.passed,
    checks,
    suggestions: m.passed ? [] : [getAgentSpec("code-validation")],
  };
}

export async function runCodeValidationAgent(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  lesson: ArchitectLessonBlueprint
) {
  return runAgent({
    stage: "code-validation",
    input: { ctx, plan, lesson },
    execute: async ({ ctx: c, plan: p, lesson: l }) => validateAndFixLessonCode(l, c, p),
    validate: validateOutput,
    maxAttempts: 1,
    minConfidence: 80,
  });
}
