/**
 * V4 Agent 11 — Student Experience Builder
 */
import type { ArchitectBlueprint, AICourseArchitectInterview } from "../types.js";
import type { LatexFormatterOutput, StudentExperienceManifest } from "../orchestrator/contracts.js";
import type { ArchitectQualityReport } from "../types.js";
import { hasLearningComponent } from "../types.js";
import { runAgent } from "../orchestrator/agentRunner.js";

function buildExperienceManifest(blueprint: ArchitectBlueprint, latex: LatexFormatterOutput): StudentExperienceManifest {
  const blocks = ["hero", "progress", "objectives", "video", "theory", "expandable-concepts", "checkpoint"];
  if (latex.quizCount > 0) blocks.push("quiz-cards");
  if (latex.labCount > 0) blocks.push("coding-lab", "code-playground");
  if (blueprint.modules.some((m) => m.project || m.lessons.some((l) => l.miniProject))) {
    blocks.push("project-section");
  }
  blocks.push("discussion", "revision-notes", "completion-badge", "next-lesson");

  return {
    lessonCount: latex.lessonCount,
    stepsPerLessonAvg: blocks.length,
    interactiveBlocks: blocks,
    heroBanners: true,
    quizCards: latex.quizCount > 0,
    codingLabs: latex.labCount > 0,
    checkpointCards: true,
  };
}

function validateExperience(manifest: StudentExperienceManifest): ArchitectQualityReport {
  return {
    score: manifest.interactiveBlocks.length >= 8 ? 95 : 75,
    passed: manifest.lessonCount > 0 && manifest.interactiveBlocks.length >= 6,
    checks: [
      { id: "blocks", label: "Interactive blocks", status: manifest.interactiveBlocks.length >= 6 ? "pass" : "fail", detail: manifest.interactiveBlocks.join(", ") },
      { id: "lessons", label: "Lessons mapped", status: manifest.lessonCount > 0 ? "pass" : "fail", detail: `${manifest.lessonCount}` },
    ],
    suggestions: [],
  };
}

export async function runStudentExperienceAgent(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview,
  latex: LatexFormatterOutput
) {
  return runAgent({
    stage: "student-experience",
    input: { blueprint, interview, latex },
    execute: async ({ blueprint: bp, latex: lx }) => ({
      manifest: buildExperienceManifest(bp, lx),
      hasVideo: bp.modules.some((m) => m.lessons.some((l) => (l.videos?.length ?? 0) > 0)),
      hasQuiz: hasLearningComponent(interview, "Quiz") && lx.quizCount > 0,
    }),
    validate: ({ manifest }) => validateExperience(manifest),
    maxAttempts: 1,
    minConfidence: 85,
  });
}
