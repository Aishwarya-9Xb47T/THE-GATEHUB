/**
 * Language Execution Service
 * Handles language-specific execution workflows for all supported languages.
 * Provides separate actions: Run, Compile, Debug, Test, Submit.
 * Returns detailed output: stdin, stdout, stderr, diagnostics, stack traces, timing, memory.
 */
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { LanguageExecutionConfig } from '../aiCourseArchitect/schemas/lessonBlockSchemas.js';
import type { WorkspaceExecutionResult } from '../aiCourseArchitect/schemas/interactiveWorkspaceFramework.js';

const execAsync = promisify(exec);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseDiagnostics(stderr: string, language: string): Array<{ severity: 'error' | 'warning' | 'info' | 'hint'; message: string; line?: number; source: string }> {
  const diagnostics: Array<{ severity: 'error' | 'warning' | 'info' | 'hint'; message: string; line?: number; source: string }> = [];
  const lines = stderr.split('\n');
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    // Python error parsing
    if (language === 'python') {
      const match = line.match(/File ".*?", line (\d+)/);
      if (match) {
        diagnostics.push({
          severity: 'error',
          message: line,
          line: parseInt(match[1]),
          source: 'python',
        });
      } else if (line.includes('Error:') || line.includes('SyntaxError')) {
        diagnostics.push({
          severity: 'error',
          message: line,
          source: 'python',
        });
      }
    }
    
    // JavaScript/TypeScript error parsing
    if (language === 'javascript' || language === 'typescript') {
      const match = line.match(/.*?:(\d+):(\d+): (.*)/);
      if (match) {
        diagnostics.push({
          severity: 'error',
          message: match[3],
          line: parseInt(match[1]),
          source: language,
        });
      }
    }
    
    // C/C++ error parsing
    if (language === 'c' || language === 'cpp') {
      const match = line.match(/.*?:(\d+):(\d+): error: (.*)/);
      if (match) {
        diagnostics.push({
          severity: 'error',
          message: match[3],
          line: parseInt(match[1]),
          source: language,
        });
      }
    }
    
    // Java error parsing
    if (language === 'java') {
      const match = line.match(/.*?\.java:(\d+): (.*)/);
      if (match) {
        diagnostics.push({
          severity: 'error',
          message: match[2],
          line: parseInt(match[1]),
          source: 'java',
        });
      }
    }
  }
  
  return diagnostics;
}

// ============================================================================
// LANGUAGE CONFIGURATIONS
// ============================================================================

export const LANGUAGE_CONFIGS: Record<string, LanguageExecutionConfig> = {
  python: {
    language: 'python',
    languageVersion: '3.11',
    compileCommand: undefined,
    compileFlags: [],
    linkCommand: undefined,
    linkFlags: [],
    runCommand: 'python',
    runArguments: [],
    interpreter: 'python3',
    sourceExtensions: ['.py'],
    compiledExtension: undefined,
    packageManager: 'pip',
    dependencyFile: 'requirements.txt',
    installCommand: 'pip install -r requirements.txt',
    testFramework: 'pytest',
    testCommand: 'pytest',
    testArguments: ['-v'],
    displayFormatter: 'black',
    features: {
      supportsCompilation: false,
      supportsInterpretation: true,
      supportsREPL: true,
      supportsNotebook: true,
      supportsHotReload: true,
    },
  },
  
  javascript: {
    language: 'javascript',
    languageVersion: 'ES2022',
    compileCommand: undefined,
    compileFlags: [],
    linkCommand: undefined,
    linkFlags: [],
    runCommand: 'node',
    runArguments: [],
    interpreter: 'node',
    sourceExtensions: ['.js', '.mjs'],
    compiledExtension: undefined,
    packageManager: 'npm',
    dependencyFile: 'package.json',
    installCommand: 'npm install',
    testFramework: 'jest',
    testCommand: 'npm test',
    testArguments: [],
    displayFormatter: 'prettier',
    features: {
      supportsCompilation: false,
      supportsInterpretation: true,
      supportsREPL: true,
      supportsNotebook: true,
      supportsHotReload: true,
    },
  },
  
  typescript: {
    language: 'typescript',
    languageVersion: '5.0',
    compileCommand: 'tsc',
    compileFlags: ['--noEmit'],
    linkCommand: undefined,
    linkFlags: [],
    runCommand: 'ts-node',
    runArguments: [],
    interpreter: 'ts-node',
    sourceExtensions: ['.ts'],
    compiledExtension: '.js',
    packageManager: 'npm',
    dependencyFile: 'package.json',
    installCommand: 'npm install',
    testFramework: 'jest',
    testCommand: 'npm test',
    testArguments: [],
    displayFormatter: 'prettier',
    features: {
      supportsCompilation: true,
      supportsInterpretation: true,
      supportsREPL: true,
      supportsNotebook: true,
      supportsHotReload: true,
    },
  },
  
  java: {
    language: 'java',
    languageVersion: '17',
    compileCommand: 'javac',
    compileFlags: ['-encoding', 'UTF-8'],
    linkCommand: undefined,
    linkFlags: [],
    runCommand: 'java',
    runArguments: [],
    interpreter: undefined,
    sourceExtensions: ['.java'],
    compiledExtension: '.class',
    packageManager: 'maven',
    dependencyFile: 'pom.xml',
    installCommand: 'mvn install',
    testFramework: 'junit',
    testCommand: 'mvn test',
    testArguments: [],
    displayFormatter: 'google-java-format',
    features: {
      supportsCompilation: true,
      supportsInterpretation: false,
      supportsREPL: false,
      supportsNotebook: false,
      supportsHotReload: false,
    },
  },
  
  c: {
    language: 'c',
    languageVersion: 'C17',
    compileCommand: 'gcc',
    compileFlags: ['-Wall', '-Wextra', '-std=c17'],
    linkCommand: 'gcc',
    linkFlags: ['-o'],
    runCommand: undefined,
    runArguments: [],
    interpreter: undefined,
    sourceExtensions: ['.c'],
    compiledExtension: undefined,
    packageManager: undefined,
    dependencyFile: undefined,
    installCommand: undefined,
    testFramework: undefined,
    testCommand: undefined,
    testArguments: [],
    displayFormatter: 'clang-format',
    features: {
      supportsCompilation: true,
      supportsInterpretation: false,
      supportsREPL: false,
      supportsNotebook: false,
      supportsHotReload: false,
    },
  },
  
  cpp: {
    language: 'cpp',
    languageVersion: 'C++20',
    compileCommand: 'g++',
    compileFlags: ['-Wall', '-Wextra', '-std=c++20'],
    linkCommand: 'g++',
    linkFlags: ['-o'],
    runCommand: undefined,
    runArguments: [],
    interpreter: undefined,
    sourceExtensions: ['.cpp', '.cc', '.cxx'],
    compiledExtension: undefined,
    packageManager: undefined,
    dependencyFile: undefined,
    installCommand: undefined,
    testFramework: 'googletest',
    testCommand: undefined,
    testArguments: [],
    displayFormatter: 'clang-format',
    features: {
      supportsCompilation: true,
      supportsInterpretation: false,
      supportsREPL: false,
      supportsNotebook: false,
      supportsHotReload: false,
    },
  },
  
  go: {
    language: 'go',
    languageVersion: '1.21',
    compileCommand: 'go build',
    compileFlags: [],
    linkCommand: undefined,
    linkFlags: [],
    runCommand: 'go run',
    runArguments: [],
    interpreter: undefined,
    sourceExtensions: ['.go'],
    compiledExtension: undefined,
    packageManager: 'go',
    dependencyFile: 'go.mod',
    installCommand: 'go mod download',
    testFramework: 'testing',
    testCommand: 'go test',
    testArguments: ['-v'],
    displayFormatter: 'gofmt',
    features: {
      supportsCompilation: true,
      supportsInterpretation: true,
      supportsREPL: false,
      supportsNotebook: false,
      supportsHotReload: false,
    },
  },
  
  rust: {
    language: 'rust',
    languageVersion: '1.70',
    compileCommand: 'rustc',
    compileFlags: [],
    linkCommand: undefined,
    linkFlags: [],
    runCommand: 'cargo run',
    runArguments: [],
    interpreter: undefined,
    sourceExtensions: ['.rs'],
    compiledExtension: undefined,
    packageManager: 'cargo',
    dependencyFile: 'Cargo.toml',
    installCommand: 'cargo build',
    testFramework: 'cargo test',
    testCommand: 'cargo test',
    testArguments: [],
    displayFormatter: 'rustfmt',
    features: {
      supportsCompilation: true,
      supportsInterpretation: false,
      supportsREPL: false,
      supportsNotebook: false,
      supportsHotReload: false,
    },
  },
  
  sql: {
    language: 'sql',
    languageVersion: 'SQL:2016',
    compileCommand: undefined,
    compileFlags: [],
    linkCommand: undefined,
    linkFlags: [],
    runCommand: undefined,
    runArguments: [],
    interpreter: 'sqlite3',
    sourceExtensions: ['.sql'],
    compiledExtension: undefined,
    packageManager: undefined,
    dependencyFile: undefined,
    installCommand: undefined,
    testFramework: undefined,
    testCommand: undefined,
    testArguments: [],
    displayFormatter: 'sqlformat',
    features: {
      supportsCompilation: false,
      supportsInterpretation: true,
      supportsREPL: true,
      supportsNotebook: false,
      supportsHotReload: false,
    },
  },
  
  html: {
    language: 'html',
    languageVersion: 'HTML5',
    compileCommand: undefined,
    compileFlags: [],
    linkCommand: undefined,
    linkFlags: [],
    runCommand: undefined,
    runArguments: [],
    interpreter: undefined,
    sourceExtensions: ['.html', '.htm'],
    compiledExtension: undefined,
    packageManager: undefined,
    dependencyFile: undefined,
    installCommand: undefined,
    testFramework: undefined,
    testCommand: undefined,
    testArguments: [],
    displayFormatter: 'prettier',
    features: {
      supportsCompilation: false,
      supportsInterpretation: true,
      supportsREPL: false,
      supportsNotebook: false,
      supportsHotReload: true,
    },
  },
  
  css: {
    language: 'css',
    languageVersion: 'CSS3',
    compileCommand: undefined,
    compileFlags: [],
    linkCommand: undefined,
    linkFlags: [],
    runCommand: undefined,
    runArguments: [],
    interpreter: undefined,
    sourceExtensions: ['.css'],
    compiledExtension: undefined,
    packageManager: undefined,
    dependencyFile: undefined,
    installCommand: undefined,
    testFramework: undefined,
    testCommand: undefined,
    testArguments: [],
    displayFormatter: 'prettier',
    features: {
      supportsCompilation: false,
      supportsInterpretation: true,
      supportsREPL: false,
      supportsNotebook: false,
      supportsHotReload: true,
    },
  },
  
  kotlin: {
    language: 'kotlin',
    languageVersion: '1.9',
    compileCommand: 'kotlinc',
    compileFlags: [],
    linkCommand: undefined,
    linkFlags: [],
    runCommand: 'kotlin',
    runArguments: [],
    interpreter: undefined,
    sourceExtensions: ['.kt', '.kts'],
    compiledExtension: '.class',
    packageManager: 'gradle',
    dependencyFile: 'build.gradle.kts',
    installCommand: 'gradle build',
    testFramework: 'junit',
    testCommand: 'gradle test',
    testArguments: [],
    displayFormatter: 'ktlint',
    features: {
      supportsCompilation: true,
      supportsInterpretation: true,
      supportsREPL: false,
      supportsNotebook: false,
      supportsHotReload: false,
    },
  },
  
  swift: {
    language: 'swift',
    languageVersion: '5.9',
    compileCommand: 'swiftc',
    compileFlags: [],
    linkCommand: undefined,
    linkFlags: [],
    runCommand: 'swift',
    runArguments: [],
    interpreter: 'swift',
    sourceExtensions: ['.swift'],
    compiledExtension: undefined,
    packageManager: 'swift',
    dependencyFile: 'Package.swift',
    installCommand: 'swift build',
    testFramework: 'swift testing',
    testCommand: 'swift test',
    testArguments: [],
    displayFormatter: 'swift-format',
    features: {
      supportsCompilation: true,
      supportsInterpretation: true,
      supportsREPL: true,
      supportsNotebook: false,
      supportsHotReload: false,
    },
  },
};

// ============================================================================
// EXECUTION ACTIONS
// ============================================================================

export type ExecutionAction = 'run' | 'compile' | 'debug' | 'test' | 'submit';

export interface ExecutionRequest {
  action: ExecutionAction;
  language: string;
  code: string;
  files?: Array<{ path: string; content: string }>;
  stdin?: string;
  testCases?: Array<{ input: string; expectedOutput: string }>;
  timeLimit?: number;
  memoryLimit?: number;
  workingDirectory?: string;
  environmentVariables?: Record<string, string>;
}

// ============================================================================
// MAIN EXECUTION SERVICE
// ============================================================================

export async function executeCode(request: ExecutionRequest): Promise<WorkspaceExecutionResult> {
  const startTime = Date.now();
  const config = LANGUAGE_CONFIGS[request.language] || getDefaultConfig(request.language);
  
  try {
    switch (request.action) {
      case 'compile':
        return await executeCompile(request, config, startTime);
      case 'run':
        return await executeRun(request, config, startTime);
      case 'debug':
        return await executeDebug(request, config, startTime);
      case 'test':
        return await executeTest(request, config, startTime);
      case 'submit':
        return await executeSubmit(request, config, startTime);
      default:
        throw new Error(`Unknown action: ${request.action}`);
    }
  } catch (error) {
    return createErrorResult(error as Error, request, startTime);
  }
}

async function executeCompile(
  request: ExecutionRequest,
  config: LanguageExecutionConfig,
  startTime: number
): Promise<WorkspaceExecutionResult> {
  if (!config.compileCommand) {
    return createErrorResult(
      new Error(`Language ${config.language} does not support compilation`),
      request,
      startTime
    );
  }
  
  const executionId = uuidv4();
  const tempDir = os.tmpdir();
  const ext = config.sourceExtensions[0] || '.txt';
  const tempFile = path.join(tempDir, `compile_${executionId}${ext}`);
  
  try {
    await fs.writeFile(tempFile, request.code);
    
    const compileCmd = config.compileCommand;
    const compileArgs = [
      ...config.compileFlags || [],
      tempFile,
      ...(config.linkFlags || []),
    ];
    
    const { stdout, stderr } = await execAsync(`${compileCmd} ${compileArgs.join(' ')}`, {
      timeout: request.timeLimit || 10000,
    });
    
    return {
      success: true,
      exitCode: 0,
      executionTimeMs: Date.now() - startTime,
      memoryUsageMb: 0,
      stdout,
      stderr,
      diagnostics: parseDiagnostics(stderr, config.language),
      timestamp: new Date(),
      workspaceId: 'temp',
    };
  } catch (error: any) {
    return {
      success: false,
      exitCode: error.code || 1,
      executionTimeMs: Date.now() - startTime,
      memoryUsageMb: 0,
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
      diagnostics: parseDiagnostics(error.stderr || error.message, config.language),
      errors: [{
        type: 'compilation',
        message: error.message,
        recoverable: false,
      }],
      timestamp: new Date(),
      workspaceId: 'temp',
    };
  } finally {
    try {
      await fs.unlink(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function executeRun(
  request: ExecutionRequest,
  config: LanguageExecutionConfig,
  startTime: number
): Promise<WorkspaceExecutionResult> {
  const { executeSandboxed } = await import("./sandboxExecutor.js");
  const sandboxed = await executeSandboxed(config.language || request.language || "python", request.code);
  const ok = sandboxed.success;
  return {
    success: ok,
    exitCode: sandboxed.exitCode ?? (ok ? 0 : 1),
    executionTimeMs: Date.now() - startTime,
    memoryUsageMb: 0,
    stdin: request.stdin || "",
    stdout: sandboxed.stdout,
    stderr: sandboxed.stderr,
    diagnostics: parseDiagnostics(sandboxed.stderr, config.language),
    errors: ok
      ? undefined
      : [
          {
            type: sandboxed.status === "timeout" ? "timeout" : sandboxed.status === "compile_error" ? "compile" : "runtime",
            message: sandboxed.stderr || sandboxed.stdout || "Execution failed",
            recoverable: false,
          },
        ],
    timestamp: new Date(),
    workspaceId: "temp",
  };
}

async function executeDebug(
  request: ExecutionRequest,
  config: LanguageExecutionConfig,
  startTime: number
): Promise<WorkspaceExecutionResult> {
  // Debug mode - same as run but with additional debug info
  const result = await executeRun(request, config, startTime);
  result.stdout = `Debug mode enabled\n${result.stdout}`;
  return result;
}

async function executeTest(
  request: ExecutionRequest,
  config: LanguageExecutionConfig,
  startTime: number
): Promise<WorkspaceExecutionResult> {
  if (!request.testCases || request.testCases.length === 0) {
    // If no test cases, just run the code
    return await executeRun(request, config, startTime);
  }
  
  const testResults = [];
  let allPassed = true;
  
  for (const testCase of request.testCases) {
    const testRequest: ExecutionRequest = {
      ...request,
      stdin: testCase.input,
    };
    
    const result = await executeRun(testRequest, config, startTime);
    
    const passed = result.stdout.trim() === testCase.expectedOutput.trim();
    if (!passed) allPassed = false;
    
    testResults.push({
      id: `test-${testResults.length}`,
      name: `Test ${testResults.length + 1}`,
      passed,
      output: result.stdout,
      expectedOutput: testCase.expectedOutput,
      executionTimeMs: result.executionTimeMs,
      memoryUsageMb: result.memoryUsageMb,
    });
  }
  
  return {
    success: allPassed,
    exitCode: allPassed ? 0 : 1,
    executionTimeMs: Date.now() - startTime,
    memoryUsageMb: 0,
    stdout: allPassed ? 'All tests passed' : 'Some tests failed',
    stderr: '',
    testResults,
    timestamp: new Date(),
    workspaceId: 'temp',
  };
}

async function executeSubmit(
  request: ExecutionRequest,
  config: LanguageExecutionConfig,
  startTime: number
): Promise<WorkspaceExecutionResult> {
  // Submit includes both public and hidden tests
  return await executeTest(request, config, startTime);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getDefaultConfig(language: string): LanguageExecutionConfig {
  return {
    language,
    sourceExtensions: ['.txt'],
    features: {
      supportsCompilation: false,
      supportsInterpretation: true,
      supportsREPL: false,
      supportsNotebook: false,
      supportsHotReload: false,
    },
  };
}

function createErrorResult(
  error: Error,
  request: ExecutionRequest,
  startTime: number
): WorkspaceExecutionResult {
  return {
    success: false,
    exitCode: 1,
    executionTimeMs: Date.now() - startTime,
    memoryUsageMb: 0,
    stdout: '',
    stderr: error.message,
    diagnostics: [
      {
        severity: 'error',
        message: error.message,
        source: 'execution-service',
      },
    ],
    stackTrace: [],
    errors: [
      {
        type: 'runtime',
        message: error.message,
        recoverable: false,
      },
    ],
    timestamp: new Date(),
    workspaceId: 'temp',
  };
}

export function getLanguageConfig(language: string): LanguageExecutionConfig {
  return LANGUAGE_CONFIGS[language] || getDefaultConfig(language);
}

export function supportsCompilation(language: string): boolean {
  return getLanguageConfig(language).features.supportsCompilation;
}

export function supportsInterpretation(language: string): boolean {
  return getLanguageConfig(language).features.supportsInterpretation;
}
