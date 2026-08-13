/**
 * Coding Workspace Types
 * Frontend types for CodingWorkspaceBlock (mirrors backend schema)
 * Extends InteractiveWorkspaceBase with coding-specific configuration
 */

// ============================================================================
// BASE INTERACTIVE WORKSPACE INTERFACE
// ============================================================================

export interface InteractiveWorkspaceBase {
  type: string;
  id: string;
  title: string;
  description: string;
  
  workspaceMode: "practice" | "assignment" | "interview" | "exam" | "sandbox" | "notebook";
  difficulty: "beginner" | "intermediate" | "advanced" | "expert";
  estimatedTimeMinutes: number;
  tags: string[];
  
  learningObjectives?: string[];
  prerequisites?: string[];
  
  sourceConfig: WorkspaceSourceConfig;
  executionConfig: ExecutionEnvironmentConfig;
  evaluationConfig: EvaluationConfig;
  aiAssistant: AIAssistantConfig;
  uiConfig: UIConfig;
  lifecycleConfig: LifecycleConfig;
}

// ============================================================================
// CODING WORKSPACE BLOCK
// ============================================================================

export interface CodingWorkspaceBlock extends InteractiveWorkspaceBase {
  type: "coding-workspace";
  
  language: string;
  challengeType: "complete-missing" | "fix-buggy" | "implement-algorithm" | "fill-todo" | "write-solution" | "debugging" | "output-prediction" | "optimise-code" | "sql-query" | "html-css" | "api-challenge" | "code-input";
  starterCodeMode: "full-program" | "partial-code" | "buggy-code" | "skeleton-project" | "from-scratch";
  
  isMultiFileProject: boolean;
  files: Array<{
    path: string;
    content: string;
    language?: string;
    isEntry?: boolean;
    isReadOnly?: boolean;
  }>;
  referenceSolution?: string | Array<{ path: string; content: string }>;
  
  publicTestCases: Array<{
    id: string;
    name: string;
    input: string;
    expectedOutput: string;
    description?: string;
  }>;
  hiddenTestCases?: Array<{
    id: string;
    name: string;
    input: string;
    expectedOutput: string;
    description?: string;
  }>;
  performanceTestCases?: Array<{
    id: string;
    name: string;
    input: string;
    expectedOutput: string;
    maxTimeMs: number;
    maxMemoryMb: number;
  }>;
  
  hints: Array<{
    id: string;
    text: string;
    cost?: number;
    level?: "minimal" | "moderate" | "detailed";
  }>;
  expectedOutput?: string;
  successMessage?: string;
  
  languageConfig: LanguageExecutionConfig;
  
  executionConfig: ExecutionEnvironmentConfig & {
    compileRequired?: boolean;
    compilerFlags?: string[];
    runtimeArguments?: string[];
  };
  
  evaluationConfig: EvaluationConfig & {
    showHiddenTestResults?: boolean;
  };
  
  aiAssistant: AIAssistantConfig & {
    generateHints?: boolean;
    generateExplanations?: boolean;
    explainErrors?: boolean;
  };
  
  uiConfig: UIConfig & {
    theme?: "light" | "dark" | "high-contrast";
    fontSize?: number;
    tabSize?: number;
    showLineNumbers?: boolean;
    enableAutocomplete?: boolean;
    enableBracketMatching?: boolean;
    enableAutoIndentation?: boolean;
    allowDownload?: boolean;
    allowUpload?: boolean;
    enableFullscreen?: boolean;
    enableAutosave?: boolean;
  };
  
  sourceConfig: WorkspaceSourceConfig & {
    type: "paste" | "upload" | "upload-zip" | "github-import" | "ai-generated" | "import-latex" | "import-markdown" | "import-docx" | "import-pdf" | "manual";
    originalSource?: string;
    uploadedFiles?: Array<{ name: string; size: number; path: string }>;
    aiPrompt?: string;
    preserveOriginal?: boolean;
  };
  
  lifecycleConfig: LifecycleConfig & {
    maxAttempts?: number;
    allowReset?: boolean;
  };
}

// ============================================================================
// LANGUAGE EXECUTION CONFIGURATION
// ============================================================================

export interface LanguageExecutionConfig {
  language: string;
  languageVersion?: string;
  
  compileCommand?: string;
  compileFlags?: string[];
  linkCommand?: string;
  linkFlags?: string[];
  
  runCommand?: string;
  runArguments?: string[];
  interpreter?: string;
  
  sourceExtensions: string[];
  compiledExtension?: string;
  
  packageManager?: string;
  dependencyFile?: string;
  installCommand?: string;
  
  testFramework?: string;
  testCommand?: string;
  testArguments?: string[];
  
  displayFormatter?: string;
  
  features: {
    supportsCompilation: boolean;
    supportsInterpretation: boolean;
    supportsREPL: boolean;
    supportsNotebook: boolean;
    supportsHotReload: boolean;
  };
}

// ============================================================================
// SOURCE CONFIGURATION
// ============================================================================

export type WorkspaceSourceType = 
  | "paste" 
  | "upload" 
  | "upload-zip" 
  | "github-import" 
  | "ai-generated" 
  | "import-latex" 
  | "import-markdown" 
  | "import-docx" 
  | "import-pdf" 
  | "manual" 
  | "template";

export interface WorkspaceSourceConfig {
  type: WorkspaceSourceType;
  originalSource?: string;
  uploadedFiles?: Array<{ name: string; size: number; path: string }>;
  zipStructure?: Array<{ path: string; size: number; isDirectory: boolean }>;
  githubConfig?: {
    repository: string;
    branch?: string;
    commit?: string;
    path?: string;
  };
  aiPrompt?: string;
  aiModel?: string;
  aiTemperature?: number;
  templateId?: string;
  templateVersion?: string;
  preserveOriginal: boolean;
  noModification: boolean;
}

// ============================================================================
// EXECUTION ENVIRONMENT CONFIGURATION
// ============================================================================

export interface ExecutionEnvironmentConfig {
  timeLimitSeconds?: number;
  memoryLimitMb?: number;
  cpuLimit?: number;
  diskLimitMb?: number;
  
  allowNetworkAccess?: boolean;
  allowedDomains?: string[];
  blockedDomains?: string[];
  
  allowFileAccess?: boolean;
  allowedPaths?: string[];
  readOnlyPaths?: string[];
  writeablePaths?: string[];
  
  environmentVariables?: Record<string, string>;
  
  runtimeType?: "docker" | "wasm" | "node" | "browser" | "native";
  runtimeVersion?: string;
  containerImage?: string;
  
  compileRequired?: boolean;
  compilerFlags?: string[];
  linkerFlags?: string[];
  
  runtimeArguments?: string[];
  workingDirectory?: string;
  entryPoint?: string;
  
  sandboxLevel?: "none" | "basic" | "strict" | "isolated";
  allowSystemCalls?: boolean;
  allowProcessFork?: boolean;
}

// ============================================================================
// EVALUATION CONFIGURATION
// ============================================================================

export interface EvaluationConfig {
  passCriteria: "all-tests" | "public-tests-only" | "percentage" | "manual" | "none";
  passPercentage?: number;
  
  scoring: "binary" | "partial-credit" | "test-weighted" | "rubric" | "manual";
  maxPoints?: number;
  rubric?: RubricItem[];
  
  showHiddenTestResults?: boolean;
  showTestCasesDuringExecution?: boolean;
  
  autoGrade?: boolean;
  manualReviewRequired?: boolean;
  allowRegrade?: boolean;
  maxAttempts?: number;
  
  showCorrectAnswers?: boolean;
  showExplanations?: boolean;
  showHintsDuringGrading?: boolean;
}

export interface RubricItem {
  id: string;
  criteria: string;
  maxPoints: number;
  weight?: number;
}

// ============================================================================
// AI ASSISTANT CONFIGURATION
// ============================================================================

export interface AIAssistantConfig {
  enabled: boolean;
  
  explainErrors: boolean;
  generateHints: boolean;
  generateExplanations: boolean;
  provideExamples: boolean;
  suggestImprovements: boolean;
  
  revealSolution: boolean;
  revealPartialSolution?: boolean;
  revealTestCases?: boolean;
  
  maxHints?: number;
  hintCooldown?: number;
  maxExplanations?: number;
  maxInteractions?: number;
  
  hintStrategy: "progressive" | "adaptive" | "on-demand" | "none";
  hintLevel: "minimal" | "moderate" | "detailed";
  
  aiModel?: string;
  aiTemperature?: number;
  aiMaxTokens?: number;
  
  logInteractions?: boolean;
  shareCodeWithAI?: boolean;
}

// ============================================================================
// UI CONFIGURATION
// ============================================================================

export interface UIConfig {
  theme: "light" | "dark" | "high-contrast" | "auto";
  
  editorConfig: {
    fontSize?: number;
    fontFamily?: string;
    tabSize?: number;
    insertSpaces?: boolean;
    wordWrap?: boolean;
    showLineNumbers?: boolean;
    showMinimap?: boolean;
    enableAutocomplete?: boolean;
    enableBracketMatching?: boolean;
    enableAutoIndentation?: boolean;
    enableSyntaxHighlighting?: boolean;
    enableCodeFolding?: boolean;
  };
  
  layoutMode: "split-horizontal" | "split-vertical" | "tabs" | "notebook";
  showFileTree?: boolean;
  showOutputPanel?: boolean;
  showTestPanel?: boolean;
  showHintPanel?: boolean;
  
  allowDownload?: boolean;
  allowUpload?: boolean;
  allowFullscreen?: boolean;
  enableAutosave?: boolean;
  autosaveInterval?: number;
  enableVersionHistory?: boolean;
  enableCollaboration?: boolean;
  
  showToolbar?: boolean;
  customToolbarActions?: ToolbarAction[];
}

export interface ToolbarAction {
  id: string;
  label: string;
  icon?: string;
  action: string;
  position?: "left" | "center" | "right";
}

// ============================================================================
// LIFECYCLE CONFIGURATION
// ============================================================================

export interface LifecycleConfig {
  availableFrom?: Date;
  availableUntil?: Date;
  
  maxSessionTime?: number;
  maxExecutionTime?: number;
  
  maxAttempts?: number;
  attemptCooldown?: number;
  
  allowReset?: boolean;
  resetPreservesProgress?: boolean;
  
  saveProgress?: boolean;
  resumeFromLastState?: boolean;
  
  autoSubmitOnTimeout?: boolean;
  allowLateSubmission?: boolean;
  lateSubmissionPenalty?: number;
  
  allowReviewAfterCompletion?: boolean;
  reviewMode?: "full" | "limited" | "none";
}
