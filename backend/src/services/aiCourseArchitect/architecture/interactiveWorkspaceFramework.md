# Interactive Workspace Framework Architecture

## Overview

The Interactive Workspace Framework is a generic, pluggable architecture for all interactive learning environments in THE GATEHUB. It provides a unified foundation for:

- **Coding Workspace** - Interactive programming environment
- **Research Workspace** - Literature review and data analysis
- **Notebook Workspace** - Jupyter-style interactive notebooks
- **Electronics Workspace** - Circuit simulation and hardware programming
- **Design Workspace** - Graphic design and 3D modeling
- **Future workspaces** - Any new interactive environment

## Design Principles

### 1. Single Framework, Multiple Implementations

All workspaces extend `InteractiveWorkspaceBase` with type-specific configuration. This ensures:

- Consistent validation across all workspace types
- Unified execution and evaluation pipelines
- Shared UI components and IDE features
- Reusable AI assistant integration
- Common lifecycle management

### 2. Workspace Type Discriminator

Each workspace type has a unique `type` field that acts as a discriminator:

```typescript
export type InteractiveWorkspace = 
  | CodingWorkspaceBlock
  | ResearchWorkspaceBlock
  | NotebookWorkspaceBlock
  | ElectronicsWorkspaceBlock
  | DesignWorkspaceBlock;
```

### 3. Layered Configuration

The framework uses layered configuration:

1. **Base Layer** (`InteractiveWorkspaceBase`) - Common to all workspaces
2. **Type Layer** (e.g., `CodingWorkspaceBlock`) - Type-specific configuration
3. **Instance Layer** - Per-workspace overrides

## Core Components

### 1. InteractiveWorkspaceBase

The base interface that all workspaces must implement:

```typescript
export interface InteractiveWorkspaceBase {
  type: string;                    // Workspace type discriminator
  id: string;                      // Unique identifier
  title: string;                   // Display title
  description: string;             // Workspace description
  
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
```

### 2. Workspace Modes

Different modes for different learning contexts:

- **Practice** - Unlimited attempts, full hints, learning-focused
- **Assignment** - Limited attempts, partial grading, deadline-based
- **Interview** - Time-limited, no hints, performance tracking
- **Exam** - Strict time limits, no AI assistance, locked environment
- **Sandbox** - No evaluation, free experimentation
- **Notebook** - Cell-based execution, progressive disclosure

### 3. Source Configuration

How the workspace was created:

```typescript
export type WorkspaceSourceType = 
  | "paste"           // Direct code paste
  | "upload"          // Single file upload
  | "upload-zip"      // Multi-file ZIP project
  | "github-import"   // Import from GitHub repository
  | "ai-generated"    // AI-generated starter code
  | "import-latex"    // Import from LaTeX
  | "import-markdown" // Import from Markdown
  | "import-docx"     // Import from DOCX
  | "import-pdf"      // Import from PDF
  | "manual"          // Manual creation
  | "template";       // From template
```

**Critical**: All source configurations preserve the original content exactly:
- No formatting changes
- No code rewriting
- No indentation fixes
- No sanitization
- Byte-for-byte preservation

### 4. Execution Environment Configuration

Resource limits and security:

```typescript
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
  
  // Environment
  environmentVariables?: Record<string, string>;
  runtimeType?: "docker" | "wasm" | "node" | "browser" | "native";
  sandboxLevel?: "none" | "basic" | "strict" | "isolated";
}
```

### 5. Evaluation Configuration

Grading and feedback:

```typescript
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
}
```

### 6. AI Assistant Configuration

AI capabilities and limits:

```typescript
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
  hintCooldown?: number;
  maxExplanations?: number;
  maxInteractions?: number;
  
  // Hint strategy
  hintStrategy: "progressive" | "adaptive" | "on-demand" | "none";
  hintLevel: "minimal" | "moderate" | "detailed";
  
  // Privacy
  logInteractions?: boolean;
  shareCodeWithAI?: boolean;
}
```

### 7. UI Configuration

IDE and display settings:

```typescript
export interface UIConfig {
  theme: "light" | "dark" | "high-contrast" | "auto";
  
  editorConfig: {
    fontSize?: number;
    fontFamily?: string;
    tabSize?: number;
    showLineNumbers?: boolean;
    enableAutocomplete?: boolean;
    enableBracketMatching?: boolean;
    // ... more editor settings
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
  enableVersionHistory?: boolean;
  enableCollaboration?: boolean;
}
```

### 8. Lifecycle Configuration

Availability and session management:

```typescript
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
```

## Workspace Type Examples

### Coding Workspace

Extends base with coding-specific configuration:

```typescript
export interface CodingWorkspaceBlock extends InteractiveWorkspaceBase {
  type: "coding-workspace";
  
  language: string;
  challengeType: "complete-missing" | "fix-buggy" | "implement-algorithm" | ...;
  starterCodeMode: "full-program" | "partial-code" | "buggy-code" | ...;
  
  isMultiFileProject: boolean;
  files: Array<{
    path: string;
    content: string;  // Preserved exactly
    language?: string;
    isEntry?: boolean;
    isReadOnly?: boolean;
  }>;
  
  publicTestCases: Array<{...}>;
  hiddenTestCases?: Array<{...}>;
  performanceTestCases?: Array<{...}>;
  
  languageConfig: LanguageExecutionConfig;
}
```

### Research Workspace

Extends base with research-specific configuration:

```typescript
export interface ResearchWorkspaceBlock extends InteractiveWorkspaceBase {
  type: "research-workspace";
  
  researchTopic: string;
  researchMethodology: "literature-review" | "experimental" | "case-study" | ...;
  
  dataSources: Array<{
    type: "database" | "api" | "file" | "survey" | "experiment";
    config: Record<string, unknown>;
  }>;
  
  analysisTools: Array<{...}>;
  deliverables: Array<{...}>;
}
```

### Notebook Workspace

Extends base with notebook-specific configuration:

```typescript
export interface NotebookWorkspaceBlock extends InteractiveWorkspaceBase {
  type: "notebook-workspace";
  
  notebookFormat: "jupyter" | "observable" | "r-markdown" | "custom";
  
  cells: Array<{
    id: string;
    type: "markdown" | "code" | "output" | "visualization";
    content: string;
    language?: string;
    editable?: boolean;
    executable?: boolean;
  }>;
  
  kernelConfig: {
    language: string;
    kernelName?: string;
    kernelVersion?: string;
  };
  
  visualizationLibraries: string[];
}
```

## Execution Pipeline

### 1. Language-Specific Execution

Each language has its own configuration:

```typescript
export interface LanguageExecutionConfig {
  language: string;
  languageVersion?: string;
  
  compileCommand?: string;
  compileFlags?: string[];
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
  
  features: {
    supportsCompilation: boolean;
    supportsInterpretation: boolean;
    supportsREPL: boolean;
    supportsNotebook: boolean;
    supportsHotReload: boolean;
  };
}
```

### 2. Execution Actions

Separate actions for different purposes:

- **Run** - Execute code normally
- **Compile** - Compile without running
- **Debug** - Execute with debugging enabled
- **Test** - Run test suite
- **Submit** - Full evaluation including hidden tests

### 3. Execution Result

Detailed output for all actions:

```typescript
export interface WorkspaceExecutionResult {
  success: boolean;
  exitCode?: number;
  executionTimeMs?: number;
  memoryUsageMb?: number;
  
  stdin?: string;
  stdout: string;
  stderr: string;
  
  diagnostics?: Diagnostic[];
  stackTrace?: StackFrame[];
  
  testResults?: TestCaseResult[];
  errors?: ExecutionError[];
  
  timestamp: Date;
  workspaceId: string;
  attemptNumber?: number;
}
```

## Adding a New Workspace Type

To add a new workspace type:

1. **Create the interface** extending `InteractiveWorkspaceBase`
2. **Add type-specific configuration** for your domain
3. **Add to the union type** in `interactiveWorkspaceFramework.ts`
4. **Implement type-specific validator** in `lessonValidator.ts`
5. **Create dedicated renderer** in frontend
6. **Add type-specific execution service** if needed

Example:

```typescript
// 1. Create interface
export interface DataScienceWorkspaceBlock extends InteractiveWorkspaceBase {
  type: "data-science-workspace";
  
  datasetConfig: {
    source: string;
    format: "csv" | "json" | "parquet" | "database";
    size: number;
  };
  
  analysisTools: Array<{
    tool: "pandas" | "scikit-learn" | "tensorflow" | "pytorch";
    version?: string;
  }>;
  
  visualizationConfig: {
    libraries: string[];
    defaultChartType: string;
  };
}

// 2. Add to union type
export type InteractiveWorkspace = 
  | CodingWorkspaceBlock
  | ResearchWorkspaceBlock
  | NotebookWorkspaceBlock
  | ElectronicsWorkspaceBlock
  | DesignWorkspaceBlock
  | DataScienceWorkspaceBlock;  // Add here
```

## Benefits of This Architecture

### 1. Code Reuse

- Shared validation logic
- Common execution pipeline
- Unified AI integration
- Reusable UI components

### 2. Consistency

- All workspaces follow the same patterns
- Consistent user experience across types
- Uniform data structures
- Standardized APIs

### 3. Extensibility

- Easy to add new workspace types
- Pluggable components
- Modular architecture
- Clear extension points

### 4. Maintainability

- Single source of truth for common logic
- Type-safe throughout
- Clear separation of concerns
- Well-documented interfaces

### 5. Future-Proof

- Designed for long-term platform growth
- No need for major refactors when adding new types
- Scalable architecture
- Industry-standard patterns

## Migration Path

Existing single-file coding exercises can be migrated to the new framework:

1. Convert legacy `codingLab` to `CodingWorkspaceBlock`
2. Set `isMultiFileProject: false`
3. Map legacy test cases to new structure
4. Use `sourceConfig.type: "import-markdown"` for legacy imports
5. Preserve all original content exactly

## Conclusion

The Interactive Workspace Framework provides a robust, extensible foundation for all interactive learning environments in THE GATEHUB. By using a generic base with type-specific extensions, we achieve:

- **Consistency** across all workspace types
- **Efficiency** through code reuse
- **Flexibility** for future additions
- **Maintainability** with clear architecture

This architecture eliminates the need for separate implementations for each workspace type and provides a unified platform for interactive learning experiences.
