/**
 * Pre-compile LaTeX linter — structural checks before pdflatex.
 */
import { validateLearningCommands } from "../learningCommandRegistry.js";
import type { LuValidationIssue } from "./luProjectValidator.js";

const KNOWN_ENVIRONMENTS = new Set([
  "document",
  "itemize",
  "enumerate",
  "description",
  "figure",
  "table",
  "tabular",
  "equation",
  "align",
  "align*",
  "center",
  "minipage",
  "verbatim",
  "tikzpicture",
]);

export interface TexLintResult {
  file: string;
  issues: LuValidationIssue[];
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

function checkBraceBalance(content: string, file: string): LuValidationIssue[] {
  const issues: LuValidationIssue[] = [];
  let depth = 0;
  let bracketDepth = 0;
  let inComment = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const prev = content[i - 1];

    if (ch === "%" && prev !== "\\") {
      inComment = true;
      continue;
    }
    if (ch === "\n") {
      inComment = false;
      continue;
    }
    if (inComment) continue;

    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < 0) {
        issues.push({
          severity: "error",
          code: "UNMATCHED_BRACE",
          message: "Unmatched closing brace `}`",
          file,
          line: lineAt(content, i),
          suggestedFix: "Remove extra `}` or add missing `{`",
        });
        depth = 0;
      }
    } else if (ch === "[") bracketDepth++;
    else if (ch === "]") {
      bracketDepth--;
      if (bracketDepth < 0) {
        issues.push({
          severity: "error",
          code: "UNMATCHED_BRACKET",
          message: "Unmatched closing bracket `]`",
          file,
          line: lineAt(content, i),
          suggestedFix: "Fix optional argument brackets",
        });
        bracketDepth = 0;
      }
    }
  }

  if (depth > 0) {
    issues.push({
      severity: "error",
      code: "MISSING_BRACE",
      message: `${depth} unclosed brace(s) — missing closing \`}\``,
      file,
      suggestedFix: "Add missing `}` to close all `{` blocks",
    });
  }
  if (bracketDepth > 0) {
    issues.push({
      severity: "warning",
      code: "MISSING_BRACKET",
      message: `${bracketDepth} unclosed bracket(s)`,
      file,
    });
  }
  return issues;
}

function checkEnvironments(content: string, file: string): LuValidationIssue[] {
  const issues: LuValidationIssue[] = [];
  const beginRe = /\\begin\{([^}]+)\}/g;
  const endRe = /\\end\{([^}]+)\}/g;
  const stack: { env: string; line: number }[] = [];

  let m: RegExpExecArray | null;
  while ((m = beginRe.exec(content)) !== null) {
    const env = m[1];
    if (KNOWN_ENVIRONMENTS.has(env) || env.startsWith("lu")) {
      stack.push({ env, line: lineAt(content, m.index) });
    }
  }

  while ((m = endRe.exec(content)) !== null) {
    const env = m[1];
    const last = stack[stack.length - 1];
    if (!last || last.env !== env) {
      issues.push({
        severity: "error",
        code: "BROKEN_ENVIRONMENT",
        message: `\\end{${env}} without matching \\begin{${env}}`,
        file,
        line: lineAt(content, m.index),
        suggestedFix: `Add \\begin{${env}} or remove stray \\end{${env}}`,
      });
    } else {
      stack.pop();
    }
  }

  for (const open of stack) {
    issues.push({
      severity: "error",
      code: "UNCLOSED_ENVIRONMENT",
      message: `\\begin{${open.env}} never closed`,
      file,
      line: open.line,
      suggestedFix: `Add \\end{${open.env}}`,
    });
  }
  return issues;
}

function checkBrokenInputs(content: string, file: string): LuValidationIssue[] {
  const issues: LuValidationIssue[] = [];
  const brokenInput = /\\input\s*\{[^}]*\.\.[^}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = brokenInput.exec(content)) !== null) {
    issues.push({
      severity: "error",
      code: "BROKEN_INPUT",
      message: "Invalid \\input path (parent directory reference)",
      file,
      line: lineAt(content, m.index),
      suggestedFix: "Use relative paths within the project only",
    });
  }
  return issues;
}

function checkUtf8(content: string, file: string): LuValidationIssue[] {
  const issues: LuValidationIssue[] = [];
  if (content.includes("\uFFFD")) {
    issues.push({
      severity: "warning",
      code: "BROKEN_UTF8",
      message: "File contains invalid UTF-8 replacement characters",
      file,
      suggestedFix: "Re-save the file as UTF-8",
    });
  }
  return issues;
}

export function lintTexFile(path: string, content: string): TexLintResult {
  const issues: LuValidationIssue[] = [
    ...checkBraceBalance(content, path),
    ...checkEnvironments(content, path),
    ...checkBrokenInputs(content, path),
    ...checkUtf8(content, path),
  ];
  return { file: path, issues };
}

export function lintAllTexFiles(
  contentMap: Map<string, string>
): LuValidationIssue[] {
  const all: LuValidationIssue[] = [];
  for (const [path, content] of contentMap.entries()) {
    if (!path.endsWith(".tex")) continue;
    all.push(...lintTexFile(path, content).issues);
  }
  return all;
}

export function lintMergedDsl(mergedTex: string): LuValidationIssue[] {
  const cmdValidation = validateLearningCommands(mergedTex);
  return cmdValidation.issues.map((issue) => ({
    severity: "error" as const,
    code: "UNDEFINED_MACRO",
    message: issue.message,
    line: issue.line ?? undefined,
    column: issue.column,
    suggestedFix: issue.suggestedFix ?? `Use a supported LMS command instead of \\${issue.command}`,
  }));
}
