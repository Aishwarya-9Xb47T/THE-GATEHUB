/**
 * V6 — Student Simulation Agent
 * Simulates a learner walking through the course before publish. Never creates content.
 */
import type { ArchitectBlueprint, AICourseArchitectInterview } from "../types.js";
import type { ArchitectQualityReport } from "../types.js";
import type { StudentSimulationOutput } from "../orchestrator/contracts.js";
import { runAgent } from "../orchestrator/agentRunner.js";
import { runVirtualStudentSimulation } from "../engines/studentSimulationEngine.js";

function validateSimulation(output: StudentSimulationOutput): ArchitectQualityReport {
  return {
    score: output.score,
    passed: output.passed,
    checks: [
      {
        id: "navigable",
        label: "Navigable lessons",
        status: output.navigableLessons / Math.max(1, output.lessonCount) >= 0.85 ? "pass" : "fail",
        detail: `${output.navigableLessons}/${output.lessonCount}`,
      },
      {
        id: "friction",
        label: "Friction points",
        status: output.frictionPoints.length <= 5 ? "pass" : "warn",
        detail: `${output.frictionPoints.length} issues`,
      },
    ],
    suggestions: output.frictionPoints,
  };
}

export async function runStudentSimulationAgent(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
) {
  return runAgent({
    stage: "student-simulation",
    input: { blueprint, interview },
    execute: async ({ blueprint: bp, interview: iv }) => runVirtualStudentSimulation(bp, iv),
    validate: validateSimulation,
    maxAttempts: 1,
    minConfidence: 80,
  });
}

export function buildStudentSimulationOutput(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): StudentSimulationOutput {
  return runVirtualStudentSimulation(blueprint, interview);
}
