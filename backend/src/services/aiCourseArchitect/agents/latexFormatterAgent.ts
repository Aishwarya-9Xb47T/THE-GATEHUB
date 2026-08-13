/**
 * V4 Agent 10 — LaTeX Formatter AI
 */
import type { ArchitectBlueprint, AICourseArchitectInterview } from "../types.js";
import type { LatexFormatterOutput } from "../orchestrator/contracts.js";
import type { ArchitectQualityReport } from "../types.js";
import { buildProjectFromBlueprint } from "../aiArchitectLaTeXEmitter.js";
import { runAgent } from "../orchestrator/agentRunner.js";

function validateLatex(output: LatexFormatterOutput): ArchitectQualityReport {
  return {
    score: output.compileReady ? 92 : 40,
    passed: output.compileReady && output.lessonCount > 0,
    checks: [
      { id: "files", label: "LaTeX files", status: output.fileCount > 0 ? "pass" : "fail", detail: `${output.fileCount} files` },
      { id: "lessons", label: "Lesson files", status: output.lessonCount > 0 ? "pass" : "fail", detail: `${output.lessonCount} lessons` },
      { id: "quizzes", label: "Quiz files", status: output.quizCount > 0 ? "pass" : "warn", detail: `${output.quizCount} quizzes` },
    ],
    suggestions: output.compileReady ? [] : ["LaTeX project structure incomplete"],
  };
}

export async function runLatexFormatterAgent(blueprint: ArchitectBlueprint, interview: AICourseArchitectInterview) {
  return runAgent({
    stage: "latex-formatter",
    input: { blueprint, interview },
    execute: async ({ blueprint: bp, interview: iv }) => {
      const { project, files } = buildProjectFromBlueprint(bp, iv);
      const latex: LatexFormatterOutput = {
        fileCount: files.length,
        lessonCount: bp.modules.reduce((n, m) => n + m.lessons.length, 0),
        quizCount: files.filter((f) => /quiz-q-\d+\.tex$/i.test(f.name)).length,
        labCount: files.filter((f) => /coding-lab/i.test(f.name)).length,
        compileReady: files.length > 0 && project.tracks.length > 0,
        warnings: [],
      };
      return { project, files, latex };
    },
    validate: ({ latex }) => validateLatex(latex),
    maxAttempts: 1,
    minConfidence: 85,
  });
}
