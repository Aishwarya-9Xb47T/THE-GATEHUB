/**
 * DSL enforcement — only registered LMS commands may appear in rendered .tex.
 */
import {
  LEARNING_COMMANDS,
  findUnsupportedLmsCommands,
} from "../learningCommandRegistry.js";
import type { LuValidationIssue } from "./luProjectValidator.js";

export interface DslEnforcementResult {
  valid: boolean;
  issues: LuValidationIssue[];
  unsupportedCommands: string[];
}

function lineAt(content: string, cmd: string): number | undefined {
  const idx = content.search(new RegExp(`\\\\${cmd}\\{`));
  if (idx < 0) return undefined;
  return content.slice(0, idx).split(/\r?\n/).length;
}

/** Scan a single .tex file for unregistered LMS commands. */
export function enforceDslOnTex(path: string, content: string): DslEnforcementResult {
  const unsupported = findUnsupportedLmsCommands(content);
  const issues: LuValidationIssue[] = unsupported.map((cmd) => ({
    severity: "error",
    code: "UNDEFINED_MACRO",
    message: `Unknown LMS command \\${cmd}. Only the course renderer may emit DSL commands.`,
    file: path,
    line: lineAt(content, cmd),
    suggestedFix: `Re-render from course JSON. Supported: ${LEARNING_COMMANDS.join(", ")}`,
  }));
  return { valid: issues.length === 0, issues, unsupportedCommands: unsupported };
}

/** Scan all project .tex files — block compile if any unregistered command exists. */
export function enforceDslOnFiles(
  files: Map<string, string> | Array<{ path: string; content: string }>
): DslEnforcementResult {
  const entries =
    files instanceof Map
      ? [...files.entries()].map(([path, content]) => ({ path, content }))
      : files;

  const allIssues: LuValidationIssue[] = [];
  const allUnsupported = new Set<string>();

  for (const { path, content } of entries) {
    if (!path.endsWith(".tex")) continue;
    const result = enforceDslOnTex(path, content);
    allIssues.push(...result.issues);
    for (const cmd of result.unsupportedCommands) allUnsupported.add(cmd);
  }

  return {
    valid: allIssues.length === 0,
    issues: allIssues,
    unsupportedCommands: [...allUnsupported],
  };
}

export function isRegisteredDslCommand(command: string): boolean {
  return (LEARNING_COMMANDS as readonly string[]).includes(command);
}
