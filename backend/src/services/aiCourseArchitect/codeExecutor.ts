/**
 * V6 — Safe code execution for validation (Python, JavaScript/Node).
 */
import { spawn } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export interface CodeExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  language: string;
}

const EXEC_TIMEOUT_MS = Math.min(
  15000,
  parseInt(process.env.AI_ARCHITECT_CODE_EXEC_TIMEOUT_MS || "8000", 10) || 8000
);

function detectLanguage(code: string, preferred?: string): "python" | "javascript" | "shell" | "unknown" {
  if (preferred) {
    const p = preferred.toLowerCase();
    if (p.includes("python") || p === "py") return "python";
    if (p.includes("javascript") || p.includes("typescript") || p === "js" || p === "ts") return "javascript";
    if (p.includes("shell") || p.includes("bash")) return "shell";
  }
  if (/^\s*#!/m.test(code) && /python/i.test(code)) return "python";
  if (/^\s*#!/m.test(code) && /node|bash/i.test(code)) return /node/i.test(code) ? "javascript" : "shell";
  if (/\bdef\s+\w+|import\s+\w+|print\s*\(/m.test(code)) return "python";
  if (/\b(const|let|var|function|console\.log)\b/.test(code)) return "javascript";
  return "unknown";
}

function runCommand(cmd: string, args: string[], cwd?: string): Promise<CodeExecutionResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, EXEC_TIMEOUT_MS);

    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        success: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code,
        durationMs: Date.now() - start,
        language: cmd,
      });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        stdout: "",
        stderr: err.message,
        exitCode: null,
        durationMs: Date.now() - start,
        language: cmd,
      });
    });
  });
}

export async function executeCodeSnippet(
  code: string,
  preferredLanguage?: string
): Promise<CodeExecutionResult> {
  const lang = detectLanguage(code, preferredLanguage);
  const id = `architect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (lang === "python") {
    const file = join(tmpdir(), `${id}.py`);
    try {
      await writeFile(file, code, "utf8");
      const py = process.env.PYTHON_PATH || "python";
      const result = await runCommand(py, [file]);
      return { ...result, language: "python" };
    } finally {
      await unlink(file).catch(() => {});
    }
  }

  if (lang === "javascript") {
    const file = join(tmpdir(), `${id}.js`);
    try {
      await writeFile(file, code, "utf8");
      const node = process.env.NODE_PATH || "node";
      const result = await runCommand(node, [file]);
      return { ...result, language: "javascript" };
    } finally {
      await unlink(file).catch(() => {});
    }
  }

  return {
    success: false,
    stdout: "",
    stderr: `Unsupported or undetected language for execution: ${preferredLanguage ?? "auto"}`,
    exitCode: null,
    durationMs: 0,
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
