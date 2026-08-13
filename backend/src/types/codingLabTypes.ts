export type CodingAuthoringMode = "starter-code" | "problem-statement";

export type CodingChallengeMode =
  | "complete-code"
  | "debug-code"
  | "build-from-scratch"
  | "predict-output"
  | "drag-blocks"
  | "algorithm-challenge"
  | "sql-lab"
  | "html-css-lab"
  | "javascript-lab"
  | "react-lab"
  | "api-lab"
  | "data-science-notebook"
  | "ai-prompt-engineering-lab";

export interface CodingLabTestCase {
  id: string;
  name?: string;
  input: string;
  expectedOutput: string;
  description?: string;
  isHidden: boolean;
  weight?: number;
}

export interface CodingMissionStep {
  id: string;
  stepNumber: number;
  title: string;
  instructions: string;
  starterCode?: string;
  publicTestCases: CodingLabTestCase[];
  hiddenTestCases: CodingLabTestCase[];
}

export interface LockedLineRange {
  startLine: number;
  endLine: number;
}

export interface CodingLabExecutionLimits {
  memoryLimitMb?: number;
  cpuLimitSec?: number;
  timeoutMs?: number;
}

export interface CodingLabConfig {
  id?: string;
  title: string;
  description: string;
  learningObjective?: string;
  difficulty?: "Easy" | "Medium" | "Hard";
  estimatedTimeMins?: number;
  authoringMode?: CodingAuthoringMode;
  challengeMode?: CodingChallengeMode;
  language: string;
  starterCode: string;
  hiddenSolution?: string;
  explanation?: string;
  hints?: string[];
  constraints?: string;
  sampleInput?: string;
  sampleOutput?: string;
  edgeCases?: string[];
  publicTestCases: CodingLabTestCase[];
  hiddenTestCases: CodingLabTestCase[];
  missionSteps?: CodingMissionStep[];
  lockedLineRanges?: LockedLineRange[];
  enableLockedLines?: boolean;
  blockPalette?: string[];
  executionLimits?: CodingLabExecutionLimits;
}

export interface EducationalErrorPayload {
  errorType: string;
  rawError: string;
  line: number | null;
  explanation: string;
  suggestedFix?: string;
  correctedCode?: string;
  hints: string[];
}

export interface TestCaseExecutionResult {
  id: string;
  name: string;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  passed: boolean;
  isHidden: boolean;
  executionTimeMs: number;
  memoryMb?: number;
  error?: string;
}

export interface CodingLabExecutionResult {
  success: boolean;
  output: string;
  exitCode: number;
  executionTimeMs: number;
  memoryMb?: number;
  testResults: TestCaseExecutionResult[];
  passCount: number;
  totalCount: number;
  scorePercent: number;
  educationalError?: EducationalErrorPayload;
  variableState?: Record<string, string | number | boolean | null | Array<unknown> | Record<string, unknown>>;
  unlockedNextStep?: boolean;
}
