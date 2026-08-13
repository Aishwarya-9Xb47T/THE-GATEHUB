/**
 * V6 Part 3 — Code execution sandbox with expected output comparison.
 */
import { executeCodeSnippet, type CodeExecutionResult } from "../codeExecutor.js";

export interface SandboxTestCase {
  name: string;
  input?: string;
  expectedOutput?: string;
  hidden?: boolean;
  timeoutMs?: number;
}

export interface SandboxResult {
  passed: boolean;
  compileSuccess: boolean;
  testsRun: number;
  testsPassed: number;
  execution: CodeExecutionResult;
  failures: string[];
  performanceMs: number;
}

export async function runCodeSandbox(
  code: string,
  language?: string,
  tests: SandboxTestCase[] = []
): Promise<SandboxResult> {
  const execution = await executeCodeSnippet(code, language);
  const failures: string[] = [];
  let testsPassed = 0;

  if (!execution.success) {
    failures.push(execution.stderr || "Execution failed");
  }

  for (const test of tests) {
    const testCode = test.input ? wrapWithInput(code, test.input, language) : code;
    const result = await executeCodeSnippet(testCode, language);
    if (test.expectedOutput) {
      const normalized = normalizeOutput(result.stdout);
      const expected = normalizeOutput(test.expectedOutput);
      if (normalized.includes(expected) || expected.includes(normalized)) {
        testsPassed++;
      } else {
        failures.push(`${test.name}: expected "${expected}", got "${normalized}"`);
      }
    } else if (result.success) {
      testsPassed++;
    } else {
      failures.push(`${test.name}: ${result.stderr}`);
    }
  }

  const testsRun = tests.length || (execution.success ? 1 : 0);
  if (!tests.length && execution.success) testsPassed = 1;

  return {
    passed: execution.success && failures.length === 0,
    compileSuccess: execution.exitCode !== null,
    testsRun,
    testsPassed,
    execution,
    failures,
    performanceMs: execution.durationMs,
  };
}

function normalizeOutput(s: string): string {
  return s.trim().replace(/\r\n/g, "\n");
}

function wrapWithInput(code: string, input: string, language?: string): string {
  const lang = (language ?? "").toLowerCase();
  if (lang.includes("python") || /\bdef\s+/.test(code)) {
    return `${code}\nimport sys\nsys.stdin = open(0)\n${input}`;
  }
  return code;
}
