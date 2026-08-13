/**
 * Interactive Workspace Framework
 * Generic pluggable framework for all interactive workspace types.
 * 
 * This framework provides a unified architecture for:
 * - Coding Workspace
 * - Research Workspace
 * - Data Science Workspace
 * - Electronics Lab
 * - Design Studio
 * - And future interactive environments
 * 
 * Each workspace type extends this base framework with type-specific configuration.
 */

// ============================================================================
// BASE INTERACTIVE WORKSPACE INTERFACE
// ============================================================================

export interface InteractiveWorkspaceBase {
  type: string; // Workspace type discriminator: "coding", "research", "notebook", "electronics", "design", etc.
  id: string;
  title: string;
  description: string;
  
  // Workspace mode
  workspaceMode: "practice" | "assignment" | "interview" | "exam" | "sandbox" | "notebook";
  
  // Difficulty and metadata
  difficulty: "beginner" | "intermediate" | "advanced" | "expert";
  estimatedTimeMinutes: number;
  tags: string[];
  
  // Learning objectives
  learningObjectives?: string[];
  prerequisites?: string[];
  
  // Source configuration (how the workspace was created)
  sourceConfig: WorkspaceSourceConfig;
  
  // Execution environment configuration
  executionConfig: ExecutionEnvironmentConfig;
  
  // Evaluation and grading configuration
  evaluationConfig: EvaluationConfig;
  
  // AI Assistant configuration
  aiAssistant: AIAssistantConfig;
  
  // IDE/UI configuration
  uiConfig: UIConfig;
  
  // Workspace lifecycle
  lifecycleConfig: LifecycleConfig;
}

// ============================================================================
// SOURCE CONFIGURATION (How workspace was created)
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
  
  // For paste/import
  originalSource?: string;
  
  // For upload
  uploadedFiles?: Array<{
    name: string;
    size: number;
    path: string;
    mimeType?: string;
  }>;
  
  // For ZIP upload
  zipStructure?: Array<{
    path: string;
    size: number;
    isDirectory: boolean;
  }>;
  
  // For GitHub import
  githubConfig?: {
    repository: string;
    branch?: string;
    commit?: string;
    path?: string;
  };
  
  // For AI generation
  aiPrompt?: string;
  aiModel?: string;
  aiTemperature?: number;
  
  // For template
  templateId?: string;
  templateVersion?: string;
  
  // Critical: Preserve original exactly
  preserveOriginal: boolean;
  noModification: boolean;
}

// ============================================================================
// EXECUTION ENVIRONMENT CONFIGURATION
// ============================================================================

export interface ExecutionEnvironmentConfig {
  // Resource limits
  timeLimitSeconds?: number;
  memoryLimitMb?: number;
  cpuLimit?: number;
  diskLimitMb?: number;
  
  // Network access
  allowNetworkAccess?: boolean;
  allowedDomains?: string[];
  blockedDomains?: string[];
  
  // File system access
  allowFileAccess?: boolean;
  allowedPaths?: string[];
  readOnlyPaths?: string[];
  writeablePaths?: string[];
  
  // Environment variables
  environmentVariables?: Record<string, string>;
  
  // Container/runtime configuration
  runtimeType?: "docker" | "wasm" | "node" | "browser" | "native";
  runtimeVersion?: string;
  containerImage?: string;
  
  // Compilation configuration
  compileRequired?: boolean;
  compilerFlags?: string[];
  linkerFlags?: string[];
  
  // Execution configuration
  runtimeArguments?: string[];
  workingDirectory?: string;
  entryPoint?: string;
  
  // Security
  sandboxLevel?: "none" | "basic" | "strict" | "isolated";
  allowSystemCalls?: boolean;
  allowProcessFork?: boolean;
}

// ============================================================================
// EVALUATION AND GRADING CONFIGURATION
// ============================================================================

export interface EvaluationConfig {
  // Pass criteria
  passCriteria: "all-tests" | "public-tests-only" | "percentage" | "manual" | "none";
  passPercentage?: number;
  
  // Scoring
  scoring: "binary" | "partial-credit" | "test-weighted" | "rubric" | "manual";
  maxPoints?: number;
  rubric?: RubricItem[];
  
  // Test case visibility
  showHiddenTestResults?: boolean;
  showTestCasesDuringExecution?: boolean;
  
  // Grading
  autoGrade?: boolean;
  manualReviewRequired?: boolean;
  allowRegrade?: boolean;
  maxAttempts?: number;
  
  // Feedback
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
  
  // Capabilities
  explainErrors: boolean;
  generateHints: boolean;
  generateExplanations: boolean;
  provideExamples: boolean;
  suggestImprovements: boolean;
  
  // Solution visibility
  revealSolution: boolean;
  revealPartialSolution?: boolean;
  revealTestCases?: boolean;
  
  // Limits
  maxHints?: number;
  hintCooldown?: number; // seconds
  maxExplanations?: number;
  maxInteractions?: number;
  
  // Hint strategy
  hintStrategy: "progressive" | "adaptive" | "on-demand" | "none";
  hintLevel: "minimal" | "moderate" | "detailed";
  
  // AI behavior
  aiModel?: string;
  aiTemperature?: number;
  aiMaxTokens?: number;
  
  // Privacy
  logInteractions?: boolean;
  shareCodeWithAI?: boolean;
}

// ============================================================================
// UI/IDE CONFIGURATION
// ============================================================================

export interface UIConfig {
  // Theme
  theme: "light" | "dark" | "high-contrast" | "auto";
  
  // Editor
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
  
  // Layout
  layoutMode: "split-horizontal" | "split-vertical" | "tabs" | "notebook";
  showFileTree?: boolean;
  showOutputPanel?: boolean;
  showTestPanel?: boolean;
  showHintPanel?: boolean;
  
  // Features
  allowDownload?: boolean;
  allowUpload?: boolean;
  allowFullscreen?: boolean;
  enableAutosave?: boolean;
  autosaveInterval?: number; // seconds
  enableVersionHistory?: boolean;
  enableCollaboration?: boolean;
  
  // Toolbar
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
  // Availability
  availableFrom?: Date;
  availableUntil?: Date;
  
  // Time limits
  maxSessionTime?: number; // seconds
  maxExecutionTime?: number; // seconds
  
  // Attempts
  maxAttempts?: number;
  attemptCooldown?: number; // seconds
  
  // Reset
  allowReset?: boolean;
  resetPreservesProgress?: boolean;
  
  // Progress
  saveProgress?: boolean;
  resumeFromLastState?: boolean;
  
  // Completion
  autoSubmitOnTimeout?: boolean;
  allowLateSubmission?: boolean;
  lateSubmissionPenalty?: number; // percentage
  
  // Review
  allowReviewAfterCompletion?: boolean;
  reviewMode?: "full" | "limited" | "none";
}

// ============================================================================
// WORKSPACE TYPE DISCRIMINATOR
// ============================================================================

export type InteractiveWorkspace = 
  | CodingWorkspaceBlock
  | ResearchWorkspaceBlock
  | NotebookWorkspaceBlock
  | ElectronicsWorkspaceBlock
  | DesignWorkspaceBlock;

export function isInteractiveWorkspace(obj: any): obj is InteractiveWorkspace {
  return obj && typeof obj === 'object' && obj.type && obj.id && obj.title;
}

// ============================================================================
// WORKSPACE EXECUTION RESULT (Generic)
// ============================================================================

export interface WorkspaceExecutionResult {
  success: boolean;
  exitCode?: number;
  executionTimeMs?: number;
  memoryUsageMb?: number;
  
  // Output streams
  stdin?: string;
  stdout: string;
  stderr: string;
  
  // Diagnostics
  diagnostics?: Diagnostic[];
  stackTrace?: StackFrame[];
  
  // Test results
  testResults?: TestCaseResult[];
  
  // Errors
  errors?: ExecutionError[];
  
  // Metadata
  timestamp: Date;
  workspaceId: string;
  attemptNumber?: number;
}

export interface Diagnostic {
  severity: "error" | "warning" | "info" | "hint";
  line?: number;
  column?: number;
  message: string;
  code?: string;
  source?: string;
}

export interface StackFrame {
  function?: string;
  file?: string;
  line?: number;
  column?: number;
}

export interface TestCaseResult {
  id: string;
  name: string;
  passed: boolean;
  output: string;
  expectedOutput?: string;
  executionTimeMs?: number;
  memoryUsageMb?: number;
  error?: string;
}

export interface ExecutionError {
  type: "compilation" | "runtime" | "timeout" | "memory" | "network" | "system" | "unknown";
  message: string;
  line?: number;
  column?: number;
  stackTrace?: string;
  recoverable: boolean;
}
