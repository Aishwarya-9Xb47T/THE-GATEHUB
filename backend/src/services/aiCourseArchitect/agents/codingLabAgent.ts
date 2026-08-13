/**
 * V4 Agent 7 — Coding Lab AI
 */
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import type { ArchitectCodingLab, ArchitectLessonBlueprint, ArchitectQualityReport } from "../types.js";
import { generateCodingLab } from "./codingLabGenerator.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { scanForLabPlaceholders } from "../pipeline/placeholderGuards.js";

function stepCommentCount(code: string): number {
  return (code.match(/#\s*Step\s+\d+/gi) ?? []).length;
}

function validateLab(lab: ArchitectCodingLab | undefined): ArchitectQualityReport {
  if (!lab) {
    return { score: 0, passed: false, checks: [{ id: "missing", label: "Lab present", status: "fail", detail: "No lab" }], suggestions: ["Generate coding lab"] };
  }
  const stub = /your solution here|your implementation here|NotImplementedError/i.test(lab.starterCode ?? "");
  const placeholder = scanForLabPlaceholders(lab.starterCode + (lab.problemStatement ?? "")).length > 0;
  const steps = stepCommentCount(lab.starterCode ?? "");
  const checks = [
    { id: "starter", label: "Starter code", status: lab.starterCode.length >= 80 && !stub ? ("pass" as const) : ("fail" as const), detail: `${lab.starterCode.length} chars` },
    { id: "problem", label: "Problem statement", status: (lab.problemStatement?.length ?? 0) >= 40 ? ("pass" as const) : ("fail" as const), detail: "" },
    { id: "tests", label: "Test cases", status: (lab.publicTestCases?.length ?? 0) >= 1 ? ("pass" as const) : ("warn" as const), detail: "" },
    { id: "placeholder", label: "No stubs", status: !placeholder ? ("pass" as const) : ("fail" as const), detail: "" },
    {
      id: "guided-steps",
      label: "Guided step scaffolding",
      status: steps >= 3 ? ("pass" as const) : ("fail" as const),
      detail: `${steps} step comments`,
    },
    {
      id: "test-coverage",
      label: "Public and hidden tests",
      status: (lab.publicTestCases?.length ?? 0) >= 2 && (lab.hiddenTestCases?.length ?? 0) >= 2 ? ("pass" as const) : ("fail" as const),
      detail: `${lab.publicTestCases?.length ?? 0} public / ${lab.hiddenTestCases?.length ?? 0} hidden`,
    },
    {
      id: "hands-on-depth",
      label: "Debugging and extension",
      status:
        (lab.debuggingTips?.length ?? 0) >= 2 && (lab.extensionExercise?.length ?? 0) >= 20
          ? ("pass" as const)
          : ("fail" as const),
      detail: `${lab.debuggingTips?.length ?? 0} tips`,
    },
  ];
  const fail = checks.filter((c) => c.status === "fail").length;
  return { score: Math.max(0, 100 - fail * 30), passed: fail === 0, checks, suggestions: fail ? ["Complete runnable lab with tests"] : [] };
}

export async function runCodingLabAgent(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  lesson: ArchitectLessonBlueprint
) {
  return runAgent({
    stage: "coding-lab",
    input: { ctx, plan, lesson },
    execute: async ({ ctx: c, plan: p, lesson: l }) => generateCodingLab(c.skeleton, c.mod, c.interview, p, l),
    validate: (lab) => validateLab(lab),
    maxAttempts: AGENT_MAX_ATTEMPTS,
    minConfidence: 85,
  });
}
