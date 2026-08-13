/**
 * Pre-compile macro validation — scan every editable .tex file before compilation.
 * Single registry: learningCommandRegistry.ts
 */
import type { ProjectFileRecord } from "./luProjectFiles.js";
import { discoverEditableTexFiles } from "./luLessonCompiler.js";
import {
  LEARNING_COMMANDS,
  findUsedLearningCommands,
  validateMacrosInSource,
  type CommandValidationIssue,
} from "../learningCommandRegistry.js";
import type { LuValidationIssue } from "./luProjectValidator.js";
import { lintTexFile } from "./luTexLinter.js";

export interface MacroValidationReport {
  valid: boolean;
  filesScanned: number;
  supportedMacros: readonly string[];
  unsupportedMacros: string[];
  usedMacros: string[];
  issues: LuValidationIssue[];
}

function macroIssueToValidation(issue: CommandValidationIssue): LuValidationIssue {
  return {
    severity: "error",
    code: "UNDEFINED_MACRO",
    message: issue.message,
    file: issue.file,
    line: issue.line ?? undefined,
    column: issue.column,
    suggestedFix: issue.suggestedFix ?? `Replace \\${issue.command} with a registered LMS macro`,
  };
}

/** Validate every instructor-editable .tex file — collect ALL errors before compile. */
export function validateProjectTexMacros(files: ProjectFileRecord[]): MacroValidationReport {
  const editable = discoverEditableTexFiles(files);
  const issues: LuValidationIssue[] = [];
  const unsupported = new Set<string>();
  const used = new Set<string>();

  for (const file of editable) {
    const content = file.content ?? "";
    for (const cmd of findUsedLearningCommands(content)) {
      used.add(cmd);
    }
    for (const macroIssue of validateMacrosInSource(content, file.path)) {
      unsupported.add(macroIssue.command);
      issues.push(macroIssueToValidation(macroIssue));
    }
    for (const lintIssue of lintTexFile(file.path, content).issues) {
      if (lintIssue.severity === "error") {
        issues.push(lintIssue);
      }
    }
  }

  return {
    valid: issues.length === 0,
    filesScanned: editable.length,
    supportedMacros: LEARNING_COMMANDS,
    unsupportedMacros: [...unsupported].sort(),
    usedMacros: [...used].sort(),
    issues,
  };
}

export function macroValidationToBuildIssues(report: MacroValidationReport): LuValidationIssue[] {
  return report.issues;
}
