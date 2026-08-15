/**
 * Isolated educational code execution.
 * Untrusted source runs in a temp workspace with timeout, output, and size limits.
 * Does not use a shell. Does not log secrets.
 */
import { spawn } from "child_process";
import { existsSync } from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

export type SandboxStatus =
  | "success"
  | "compile_error"
  | "runtime_error"
  | "timeout"
  | "unsupported"
  | "limit";

export interface SandboxResult {
  success: boolean;
  status: SandboxStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 256 * 1024;
const TIMEOUT_MS = 8000;

export function findExecutable(names: string[]): string | null {
  const pathEnv = process.env.PATH || "";
  const seps = process.platform === "win32" ? ";" : ":";
  const exts = process.platform === "win32" ? [".exe", ""] : [""];
  for (const name of names) {
    if (path.isAbsolute(name) && existsSync(name)) return name;
    for (const dir of pathEnv.split(seps)) {
      if (!dir) continue;
      for (const ext of exts) {
        const candidate = path.join(dir, name + ext);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

function truncate(text: string): string {
  if (Buffer.byteLength(text, "utf8") <= MAX_OUTPUT_BYTES) return text;
  return text.slice(0, MAX_OUTPUT_BYTES) + "\n[output truncated]";
}

function unsupported(language: string, needed: string): SandboxResult {
  return {
    success: false,
    status: "unsupported",
    stdout: "",
    stderr: `Unsupported language on this server: ${language}. Required runtime not found (${needed}).`,
    exitCode: null,
    timedOut: false,
  };
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = TIMEOUT_MS
): Promise<SandboxResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const child = spawn(command, args, {
      cwd,
      env: {
        PATH: process.env.PATH,
        LANG: process.env.LANG || "C.UTF-8",
        HOME: cwd,
        TMPDIR: cwd,
        TEMP: cwd,
        TMP: cwd,
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, timeoutMs);

    const onChunk = (kind: "stdout" | "stderr") => (chunk: Buffer) => {
      const next = kind === "stdout" ? stdout + chunk.toString() : stderr + chunk.toString();
      if (kind === "stdout") stdout = next;
      else stderr = next;
    };
    child.stdout?.on("data", onChunk("stdout"));
    child.stderr?.on("data", onChunk("stderr"));

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        status: "runtime_error",
        stdout: truncate(stdout),
        stderr: truncate(stderr || err.message),
        exitCode: null,
        timedOut: false,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      stdout = truncate(stdout);
      stderr = truncate(stderr);
      if (timedOut) {
        resolve({
          success: false,
          status: "timeout",
          stdout,
          stderr: stderr || `Execution timed out (limit: ${Math.round(timeoutMs / 1000)} seconds)`,
          exitCode: code,
          timedOut: true,
        });
        return;
      }
      if (code === 0) {
        resolve({ success: true, status: "success", stdout, stderr, exitCode: code, timedOut: false });
        return;
      }
      resolve({
        success: false,
        status: "runtime_error",
        stdout,
        stderr,
        exitCode: code,
        timedOut: false,
      });
    });
  });
}

function wrapJava(code: string, className: string): string {
  if (/\bclass\s+\w+/.test(code)) return code;
  return `public class ${className} {\n  public static void main(String[] args) {\n${code
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n")}\n  }\n}\n`;
}

export async function executeSandboxed(language: string, source: string): Promise<SandboxResult> {
  const lang = (language || "").toLowerCase().trim();
  if (!source?.trim()) {
    return {
      success: false,
      status: "runtime_error",
      stdout: "",
      stderr: "Code is required",
      exitCode: null,
      timedOut: false,
    };
  }
  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
    return {
      success: false,
      status: "limit",
      stdout: "",
      stderr: "Source exceeds maximum size (64KB)",
      exitCode: null,
      timedOut: false,
    };
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-exec-"));
  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  try {
    if (lang === "python" || lang === "py") {
      const python = findExecutable(["python3", "python"]);
      if (!python) return unsupported("python", "python3");
      const file = path.join(dir, "main.py");
      await fs.writeFile(file, source, "utf8");
      console.log("[CODE_EXEC] language=python runtime=" + path.basename(python));
      return await runCommand(python, ["main.py"], dir);
    }

    if (lang === "javascript" || lang === "js" || lang === "node") {
      const node = findExecutable(["node"]);
      if (!node) return unsupported("javascript", "node");
      const file = path.join(dir, "main.js");
      await fs.writeFile(file, source, "utf8");
      console.log("[CODE_EXEC] language=javascript runtime=node");
      return await runCommand(node, ["main.js"], dir);
    }

    if (lang === "typescript" || lang === "ts") {
      const node = findExecutable(["node"]);
      if (!node) return unsupported("typescript", "node");
      const file = path.join(dir, "main.ts");
      await fs.writeFile(file, source, "utf8");
      const tsx = findExecutable(["tsx"]);
      if (tsx) {
        console.log("[CODE_EXEC] language=typescript runtime=tsx");
        return await runCommand(tsx, [file], dir);
      }
      const tsNode = findExecutable(["ts-node"]);
      if (tsNode) {
        console.log("[CODE_EXEC] language=typescript runtime=ts-node");
        return await runCommand(tsNode, ["--transpile-only", file], dir);
      }
      const jsFile = path.join(dir, "main.js");
      const stripped = source
        .replace(/:\s*[\w[\]|&<>,\s]+(?=[,)=;])/g, "")
        .replace(/\bas\s+[\w[\]|.]+/g, "")
        .replace(/^import\s.+?;$/gm, "")
        .replace(/^export\s+/gm, "");
      await fs.writeFile(jsFile, stripped, "utf8");
      console.log("[CODE_COMPILE] language=typescript fallback=strip-types");
      return await runCommand(node, ["main.js"], dir);
    }

    if (lang === "java") {
      const javac = findExecutable(["javac"]);
      const java = findExecutable(["java"]);
      if (!javac || !java) return unsupported("java", "javac + java");
      const className = `Main${id}`;
      const file = path.join(dir, `${className}.java`);
      await fs.writeFile(file, wrapJava(source, className), "utf8");
      console.log("[CODE_COMPILE] language=java");
      const compiled = await runCommand(javac, [file], dir);
      if (!compiled.success) {
        return { ...compiled, status: "compile_error" };
      }
      console.log("[CODE_EXEC] language=java");
      return await runCommand(java, ["-cp", dir, className], dir);
    }

    if (lang === "c") {
      const gcc = findExecutable(["gcc"]);
      if (!gcc) return unsupported("c", "gcc");
      const src = path.join(dir, "main.c");
      const exe = path.join(dir, process.platform === "win32" ? "main.exe" : "main");
      await fs.writeFile(src, source, "utf8");
      console.log("[CODE_COMPILE] language=c");
      const compiled = await runCommand(gcc, [src, "-O0", "-o", exe], dir);
      if (!compiled.success) return { ...compiled, status: "compile_error" };
      console.log("[CODE_EXEC] language=c");
      return await runCommand(exe, [], dir);
    }

    if (lang === "cpp" || lang === "c++" || lang === "cplusplus") {
      const gxx = findExecutable(["g++"]);
      if (!gxx) return unsupported("cpp", "g++");
      const src = path.join(dir, "main.cpp");
      const exe = path.join(dir, process.platform === "win32" ? "main.exe" : "main");
      await fs.writeFile(src, source, "utf8");
      console.log("[CODE_COMPILE] language=cpp");
      const compiled = await runCommand(gxx, [src, "-O0", "-o", exe], dir);
      if (!compiled.success) return { ...compiled, status: "compile_error" };
      console.log("[CODE_EXEC] language=cpp");
      return await runCommand(exe, [], dir);
    }

    return unsupported(language || "(none)", "python3, node, gcc, g++, javac");
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
