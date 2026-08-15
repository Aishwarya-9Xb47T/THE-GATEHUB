/**
 * V6 — Safe code execution for validation (Python, JavaScript/Node).
 * Delegates to sandboxExecutor — no shell, no hardcoded `python` binary.
 */
import { executeSandboxed } from "../codeExecution/sandboxExecutor.js";

export interface CodeExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  language: string;
}

function detectLanguage(code: string, preferred?: string): "python" | "javascript" | "unknown" {
  if (preferred) {
    const p = preferred.toLowerCase();
    if (p.includes("python") || p === "py") return "python";
    if (p.includes("javascript") || p.includes("typescript") || p === "js" || p === "ts") return "javascript";
  }
  if (/^\s*#!/m.test(code) && /python/i.test(code)) return "python";
  if (/^\s*#!/m.test(code) && /node/i.test(code)) return "javascript";
  if (/\bdef\s+\w+|import\s+\w+|print\s*\(/m.test(code)) return "python";
  if (/\b(const|let|var|function|console\.log)\b/.test(code)) return "javascript";
  return "unknown";
}

export async function executeCodeSnippet(
  code: string,
  preferredLanguage?: string
): Promise<CodeExecutionResult> {
  const lang = detectLanguage(code, preferredLanguage);
  if (lang === "unknown") {
    return {
      success: false,
      stdout: "",
      stderr: `Unsupported or undetected language for execution: ${preferredLanguage ?? "auto"}`,
      exitCode: null,
      durationMs: 0,
      language: lang,
    };
  }

  const start = Date.now();
  const sandboxed = await executeSandboxed(lang, code);
  return {
    success: sandboxed.success,
    stdout: sandboxed.stdout,
    stderr: sandboxed.stderr,
    exitCode: sandboxed.exitCode,
    durationMs: Date.now() - start,
    language: lang,
  };
}

export function syntaxLooksValid(code: string, language?: string): boolean {
  if (!code || code.length < 10) return false;
  if (/your (code|solution) here|TODO|FIXME|placeholder/i.test(code)) return false;
  const lang = detectLanguage(code, language);
  if (lang === "python") {
    const opens = (code.match(/\(/g) ?? []).length;
    const closes = (code.match(/\)/g) ?? []).length;
    if (opens !== closes) return false;
  }
  if (lang === "javascript") {
    const braces = code.split("{").length - code.split("}").length;
    if (braces !== 0) return false;
  }
  return true;
}
