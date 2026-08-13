/**
 * Structured Educational Content Schemas
 * 
 * These schemas define the canonical JSON structure for all lesson blocks.
 * AI generation MUST produce these structured formats, NOT authoring syntax.
 * Renderers convert these to beautiful student-facing UI.
 */

// ============================================================================
// INTERACTIVE LEARNING COMPONENTS
// These are first-class interactive experiences, not lesson content blocks.
// ============================================================================

/**
 * Interactive Workspace Framework
 * Generic pluggable framework for all interactive workspace types.
 */
import type {
  InteractiveWorkspaceBase,
  WorkspaceSourceConfig,
  ExecutionEnvironmentConfig,
  EvaluationConfig,
  AIAssistantConfig,
  UIConfig,
  LifecycleConfig,
} from './interactiveWorkspaceFramework.js';

// ============================================================================
// CODING WORKSPACE (Interactive Coding Environment)
// Extends InteractiveWorkspaceBase with coding-specific configuration
// ============================================================================
export interface CodingWorkspaceBlock extends InteractiveWorkspaceBase {
  type: "coding-workspace";
  
  // Language and challenge configuration
  language: string; // Any language - no restriction
  challengeType: "complete-missing" | "fix-buggy" | "implement-algorithm" | "fill-todo" | "write-solution" | "debugging" | "output-prediction" | "optimise-code" | "sql-query" | "html-css" | "api-challenge" | "code-input";
  
  // Starter code mode
  starterCodeMode: "full-program" | "partial-code" | "buggy-code" | "skeleton-project" | "from-scratch";
  
  // Code provided to student (single file or multi-file)
  isMultiFileProject: boolean;
  files: Array<{
    path: string; // Relative path within project
    content: string; // Exact byte-for-byte content, no modification
    language?: string; // Per-file language override
    isEntry?: boolean; // Main entry point
    isReadOnly?: boolean; // Read-only files (e.g., test files)
  }>;
  referenceSolution?: string | Array<{ path: string; content: string }>; // Hidden from student, used for validation
  
  // Test cases
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
  
  // Learning support
  hints: Array<{
    id: string;
    text: string;
    cost?: number; // Points deducted for using hint
    level?: "minimal" | "moderate" | "detailed";
  }>;
  expectedOutput?: string;
  successMessage?: string;
  
  // Language-specific execution configuration (extends base executionConfig)
  languageConfig: LanguageExecutionConfig;
  
  // Override base executionConfig with coding-specific defaults
  executionConfig: ExecutionEnvironmentConfig & {
    compileRequired?: boolean;
    compilerFlags?: string[];
    runtimeArguments?: string[];
  };
  
  // Override base evaluationConfig with coding-specific defaults
  evaluationConfig: EvaluationConfig & {
    showHiddenTestResults?: boolean;
  };
  
  // Override base aiAssistant with coding-specific defaults
  aiAssistant: AIAssistantConfig & {
    generateHints?: boolean;
    generateExplanations?: boolean;
    explainErrors?: boolean;
  };
  
  // Override base uiConfig with coding-specific defaults
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
  
  // Override base sourceConfig with coding-specific defaults
  sourceConfig: WorkspaceSourceConfig & {
    type: "paste" | "upload" | "upload-zip" | "github-import" | "ai-generated" | "import-latex" | "import-markdown" | "import-docx" | "import-pdf" | "manual";
    originalSource?: string;
    uploadedFiles?: Array<{ name: string; size: number; path: string }>;
    aiPrompt?: string;
    preserveOriginal?: boolean;
  };
  
  // Override base lifecycleConfig with coding-specific defaults
  lifecycleConfig: LifecycleConfig & {
    maxAttempts?: number;
    allowReset?: boolean;
  };
}

// ============================================================================
// LANGUAGE-SPECIFIC EXECUTION CONFIGURATION
// ============================================================================

export interface LanguageExecutionConfig {
  // Language detection
  language: string;
  languageVersion?: string;
  
  // Compilation
  compileCommand?: string;
  compileFlags?: string[];
  linkCommand?: string;
  linkFlags?: string[];
  
  // Execution
  runCommand?: string;
  runArguments?: string[];
  interpreter?: string;
  
  // File extensions
  sourceExtensions: string[];
  compiledExtension?: string;
  
  // Dependencies
  packageManager?: string; // npm, pip, maven, gradle, cargo, etc.
  dependencyFile?: string; // package.json, requirements.txt, pom.xml, Cargo.toml, etc.
  installCommand?: string;
  
  // Testing
  testFramework?: string; // pytest, jest, junit, etc.
  testCommand?: string;
  testArguments?: string[];
  
  // Formatting (for display only, never applied to instructor code)
  displayFormatter?: string;
  
  // Language-specific features
  features: {
    supportsCompilation: boolean;
    supportsInterpretation: boolean;
    supportsREPL: boolean;
    supportsNotebook: boolean;
    supportsHotReload: boolean;
  };
}

// ============================================================================
// FUTURE INTERACTIVE COMPONENTS (Architecture placeholders)
// All extend InteractiveWorkspaceBase with type-specific configuration
// ============================================================================

export interface ResearchWorkspaceBlock extends InteractiveWorkspaceBase {
  type: "research-workspace";
  
  // Research-specific configuration
  researchTopic: string;
  researchMethodology: "literature-review" | "experimental" | "case-study" | "survey" | "mixed-methods";
  
  // Data sources
  dataSources: Array<{
    type: "database" | "api" | "file" | "survey" | "experiment";
    config: Record<string, unknown>;
  }>;
  
  // Analysis tools
  analysisTools: Array<{
    tool: string;
    version?: string;
    parameters?: Record<string, unknown>;
  }>;
  
  // Deliverables
  deliverables: Array<{
    type: "report" | "presentation" | "dataset" | "code" | "visualization";
    template?: string;
    required: boolean;
  }>;
}

export interface SimulationBlock extends InteractiveWorkspaceBase {
  type: "simulation";
  
  // Simulation-specific configuration
  simulationType: "physics" | "chemistry" | "biology" | "economics" | "electronics" | "custom";
  
  // Parameters
  parameters: Record<string, unknown>;
  
  // Interactive elements
  interactiveElements: Array<{
    type: "slider" | "toggle" | "input" | "dropdown";
    parameter: string;
    label: string;
    range?: [number, number];
  }>;
  
  // Visualization
  visualizationConfig: {
    type: "2d" | "3d" | "graph" | "chart";
    libraries?: string[];
  };
}

export interface NotebookWorkspaceBlock extends InteractiveWorkspaceBase {
  type: "notebook-workspace";
  
  // Notebook-specific configuration
  notebookFormat: "jupyter" | "observable" | "r-markdown" | "custom";
  
  // Cells
  cells: Array<{
    id: string;
    type: "markdown" | "code" | "output" | "visualization";
    content: string;
    language?: string;
    editable?: boolean;
    executable?: boolean;
  }>;
  
  // Kernel configuration
  kernelConfig: {
    language: string;
    kernelName?: string;
    kernelVersion?: string;
  };
  
  // Visualization libraries
  visualizationLibraries: string[];
}

export interface ElectronicsWorkspaceBlock extends InteractiveWorkspaceBase {
  type: "electronics-workspace";
  
  // Electronics-specific configuration
  circuitType: "digital" | "analog" | "mixed-signal" | "power";
  
  // Components
  components: Array<{
    type: string;
    value?: string;
    quantity: number;
    package?: string;
  }>;
  
  // Schematic
  schematic?: {
    format: "json" | "xml" | "netlist";
    content: string;
  };
  
  // Simulation
  simulationConfig?: {
    simulator: string;
    simulationType: "dc" | "ac" | "transient" | "monte-carlo";
    parameters?: Record<string, unknown>;
  };
  
  // Hardware interface
  hardwareInterface?: {
    type: "arduino" | "raspberry-pi" | "esp32" | "custom";
    pins?: Array<{ pin: string; mode: string }>;
  };
}

export interface DesignWorkspaceBlock extends InteractiveWorkspaceBase {
  type: "design-workspace";
  
  // Design-specific configuration
  designType: "graphic" | "ui-ux" | "3d-model" | "animation" | "video";
  
  // Canvas/workspace
  canvasConfig: {
    width: number;
    height: number;
    units: "pixels" | "inches" | "centimeters" | "points";
    backgroundColor?: string;
  };
  
  // Tools
  availableTools: Array<{
    tool: string;
    enabled: boolean;
    parameters?: Record<string, unknown>;
  }>;
  
  // Assets
  assets?: Array<{
    type: "image" | "font" | "template" | "component";
    path: string;
    readOnly?: boolean;
  }>;
  
  // Export options
  exportOptions: Array<{
    format: string;
    quality?: number;
    dimensions?: { width: number; height: number };
  }>;
}

export interface WhiteboardBlock {
  type: "whiteboard";
  id: string;
  title: string;
  description: string;
  tools: Array<"pen" | "eraser" | "text" | "shape" | "image">;
  initialContent?: string; // Base64 or reference to template
  collaboration: {
    enabled: boolean;
    realTime?: boolean;
  };
}

export interface DatasetExplorerBlock {
  type: "dataset-explorer";
  id: string;
  title: string;
  description: string;
  dataset: {
    source: string;
    format: "csv" | "json" | "sql" | "api";
    schema: Record<string, string>;
    sampleSize?: number;
  };
  tasks: Array<{
    id: string;
    description: string;
    query?: string;
    expectedResult?: unknown;
  }>;
  tools: Array<"filter" | "sort" | "aggregate" | "visualize">;
}

export interface InterviewPracticeBlock {
  type: "interview-practice";
  id: string;
  title: string;
  description: string;
  interviewType: "technical" | "behavioral" | "system-design" | "case-study";
  questions: Array<{
    id: string;
    question: string;
    timeLimit?: number;
    hints?: string[];
    rubric?: string;
  }>;
  aiInterviewer: {
    enabled: boolean;
    followUpQuestions: boolean;
    feedbackStyle: "immediate" | "end-of-session";
  };
}

export interface AIConversationBlock {
  type: "ai-conversation";
  id: string;
  title: string;
  description: string;
  conversationType: "socratic" | "tutor" | "debate" | "roleplay";
  systemPrompt: string;
  initialMessage?: string;
  constraints: {
    maxTurns?: number;
    topics?: string[];
    forbiddenTopics?: string[];
  };
  learningGoals: string[];
}

// ============================================================================
// CONTENT COMPONENTS
// ============================================================================

// ============================================================================
// THEORY
// ============================================================================
export interface TheoryBlock {
  type: "theory";
  title: string;
  sections: Array<{
    heading?: string;
    content: string;
    type: "paragraph" | "bullet-list" | "numbered-list";
  }>;
}

// ============================================================================
// LEARNING OBJECTIVES
// ============================================================================
export interface LearningObjectivesBlock {
  type: "learning-objectives";
  title: string;
  objectives: Array<{
    id: string;
    text: string;
    bloomLevel: "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
    measurable: boolean;
  }>;
}

// ============================================================================
// VISUAL DIAGRAM
// ============================================================================
export interface VisualDiagramBlock {
  type: "visual-diagram";
  diagramType: "process" | "hierarchy" | "comparison" | "cycle" | "network";
  title: string;
  description?: string;
  nodes: Array<{
    id: string;
    label: string;
    position?: { x: number; y: number };
    color?: string;
    icon?: string;
  }>;
  edges: Array<{
    from: string;
    to: string;
    label?: string;
    type?: "solid" | "dashed" | "arrow";
  }>;
  layout?: "horizontal" | "vertical" | "circular" | "force";
  interactive?: boolean;
}

// ============================================================================
// FLOWCHART
// ============================================================================
export interface FlowchartBlock {
  type: "flowchart";
  title: string;
  description?: string;
  steps: Array<{
    id: string;
    label: string;
    type: "start" | "process" | "decision" | "end" | "connector";
    position?: { x: number; y: number };
    condition?: {
      truePath: string;
      falsePath: string;
    };
  }>;
  connections: Array<{
    from: string;
    to: string;
    label?: string;
  }>;
}

// ============================================================================
// CODE EXAMPLE (Educational, NOT Coding Lab)
// ============================================================================
export interface CodeExampleBlock {
  type: "code-example";
  title: string;
  description?: string;
  language: "python" | "javascript" | "java" | "cpp" | "c" | "typescript" | "go" | "rust" | "sql" | "other";
  filename?: string;
  code: string;
  lineNumbers: boolean;
  syntaxHighlighting: boolean;
  copyButton: boolean;
  explanation?: string;
  output?: string;
  complexity?: {
    time: string;
    space: string;
  };
  bestPractices?: string[];
}

// ============================================================================
// CODING LAB (Separate Exercise System)
// ============================================================================
export interface CodingLabBlock {
  type: "coding-lab";
  title: string;
  description: string;
  language: "python" | "java" | "c" | "cpp" | "javascript" | "typescript" | "go" | "rust" | "sql";
  challengeType: "complete-missing" | "fix-buggy" | "implement-algorithm" | "fill-todo" | "write-solution" | "debugging" | "output-prediction";
  
  // Instructor-provided content
  starterCode: string;
  hiddenSolution?: string;
  
  // Test cases
  publicTestCases: Array<{
    id: string;
    name: string;
    input: string;
    expectedOutput: string;
  }>;
  hiddenTestCases?: Array<{
    id: string;
    name: string;
    input: string;
    expectedOutput: string;
  }>;
  
  // Configuration
  difficulty: "beginner" | "intermediate" | "advanced";
  timeLimitSeconds?: number;
  memoryLimitMb?: number;
  hints?: string[];
  successMessage?: string;
  evaluationRules?: string[];
  
  // Instructions (Markdown)
  instructions: string;
}

// ============================================================================
// SUMMARY
// ============================================================================
export interface SummaryBlock {
  type: "summary";
  title: string;
  sections: Array<{
    heading?: string;
    content: string;
    type: "paragraph" | "bullet-list" | "numbered-list" | "key-points";
  }>;
}

// ============================================================================
// KEY TAKEAWAYS
// ============================================================================
export interface KeyTakeawaysBlock {
  type: "key-takeaways";
  title: string;
  takeaways: Array<{
    id: string;
    text: string;
    importance: "critical" | "important" | "nice-to-know";
    category?: string;
  }>;
}

// ============================================================================
// REVISION NOTES
// ============================================================================
export interface RevisionNotesBlock {
  type: "revision-notes";
  title: string;
  quickSummary: string;
  keyConcepts: Array<{
    term: string;
    definition: string;
    importance: "high" | "medium" | "low";
  }>;
  importantFormulas: Array<{
    formula: string;
    description: string;
    variables?: Array<{ symbol: string; meaning: string }>;
  }>;
  commonMistakes: Array<{
    mistake: string;
    correction: string;
    example?: string;
  }>;
  examTips: Array<{
    tip: string;
    context: string;
  }>;
  practiceQuestions: Array<{
    question: string;
    answer: string;
    difficulty: "easy" | "medium" | "hard";
  }>;
}

// ============================================================================
// FURTHER READING
// ============================================================================
export interface FurtherReadingBlock {
  type: "further-reading";
  title: string;
  resources: Array<{
    id: string;
    title: string;
    type: "book" | "documentation" | "website" | "research-paper" | "video" | "course";
    authors?: string;
    publisher?: string;
    year?: number;
    url: string;
    isbn?: string;
    doi?: string;
    description: string;
    relevance: string;
    difficulty: "beginner" | "intermediate" | "advanced";
    estimatedReadTime?: string;
  }>;
}

// ============================================================================
// RESEARCH PAPERS
// ============================================================================
export interface ResearchPaperBlock {
  type: "research-paper";
  title: string;
  papers: Array<{
    id: string;
    title: string;
    authors: string;
    year: number;
    conference?: string;
    journal?: string;
    volume?: string;
    issue?: string;
    pages?: string;
    doi?: string;
    url?: string;
    abstract: string;
    summary: string;
    importance: string;
    difficulty: "beginner" | "intermediate" | "advanced" | "graduate";
    citationCount?: number;
    openAccess?: boolean;
  }>;
}

// ============================================================================
// QUIZ
// ============================================================================
export interface QuizBlock {
  type: "quiz";
  title: string;
  description?: string;
  questions: Array<{
    id: string;
    type: "mcq" | "true-false" | "fill-blank" | "match-following" | "scenario";
    question: string;
    options?: Array<{
      id: string;
      text: string;
      isCorrect: boolean;
      explanation?: string;
    }>;
    correctAnswer?: string | string[];
    explanation?: string;
    difficulty: "easy" | "medium" | "hard";
    points?: number;
    hints?: string[];
  }>;
  passingScore?: number;
  timeLimit?: number;
}

// ============================================================================
// COMMON MISTAKES
// ============================================================================
export interface CommonMistakesBlock {
  type: "common-mistakes";
  title: string;
  mistakes: Array<{
    id: string;
    mistake: string;
    whyItHappens: string;
    howToAvoid: string;
    example?: string;
    correctedExample?: string;
    severity: "critical" | "major" | "minor";
  }>;
}

// ============================================================================
// BEST PRACTICES
// ============================================================================
export interface BestPracticesBlock {
  type: "best-practices";
  title: string;
  practices: Array<{
    id: string;
    practice: string;
    explanation: string;
    whenToApply: string;
    category?: string;
    priority: "must" | "should" | "could";
  }>;
}

// ============================================================================
// INDUSTRY NOTES
// ============================================================================
export interface IndustryNotesBlock {
  type: "industry-notes";
  title: string;
  notes: Array<{
    id: string;
    topic: string;
    insight: string;
    industryExample?: string;
    companies?: string[];
    relevance: string;
  }>;
}

// ============================================================================
// CHEAT SHEET
// ============================================================================
export interface CheatSheetBlock {
  type: "cheat-sheet";
  title: string;
  sections: Array<{
    heading: string;
    items: Array<{
      concept: string;
      syntax: string;
      description: string;
      example?: string;
    }>;
  }>;
}

// ============================================================================
// REAL WORLD ANALOGY
// ============================================================================
export interface RealWorldAnalogyBlock {
  type: "real-world-analogy";
  title: string;
  analogy: string;
  realWorldConcept: string;
  technicalConcept: string;
  mapping: Array<{
    realWorld: string;
    technical: string;
    explanation: string;
  }>;
  limitations?: string;
}

// ============================================================================
// CONCEPT EXPLANATION
// ============================================================================
export interface ConceptExplanationBlock {
  type: "concept-explanation";
  title: string;
  definition: string;
  corePrinciples: Array<{
    principle: string;
    explanation: string;
  }>;
  howItWorks: string;
  whenToUse: string;
  whenNotToUse: string;
  relatedConcepts?: string[];
  examples?: Array<{
    scenario: string;
    application: string;
  }>;
}

// ============================================================================
// EXECUTION STEPS
// ============================================================================
export interface ExecutionStepsBlock {
  type: "execution-steps";
  title: string;
  description?: string;
  steps: Array<{
    id: string;
    order: number;
    title: string;
    description: string;
    code?: string;
    expectedOutput?: string;
    commonErrors?: string[];
  }>;
}

// ============================================================================
// INTERVIEW QUESTIONS
// ============================================================================
export interface InterviewQuestionsBlock {
  type: "interview-questions";
  title: string;
  questions: Array<{
    id: string;
    question: string;
    answer: string;
    difficulty: "entry" | "junior" | "mid" | "senior" | "lead";
    category: "theoretical" | "practical" | "behavioral" | "system-design" | "hr" | "coding";
    hints?: string[];
    keyPoints?: string[];
    followUp?: string[];
  }>;
}

// ============================================================================
// FLASHCARDS
// ============================================================================
export interface FlashcardsBlock {
  type: "flashcards";
  title: string;
  cards: Array<{
    id: string;
    front: string;
    back: string;
    category?: string;
    difficulty?: "easy" | "medium" | "hard";
  }>;
}

// ============================================================================
// GLOSSARY
// ============================================================================
export interface GlossaryBlock {
  type: "glossary";
  title: string;
  terms: Array<{
    term: string;
    definition: string;
    category?: string;
    relatedTerms?: string[];
    misconceptions?: string[];
    difficulty: "beginner" | "intermediate" | "advanced";
    example?: string;
  }>;
}

// ============================================================================
// PROJECT
// ============================================================================
export interface ProjectBlock {
  type: "project";
  title: string;
  description: string;
  objectives: string[];
  requirements: string[];
  starterFiles?: Array<{
    name: string;
    content: string;
    language: string;
  }>;
  submissionChecklist?: string[];
  rubric?: Array<{
    criterion: string;
    points: number;
    description: string;
  }>;
  hints?: string[];
  estimatedHours?: number;
  difficulty: "beginner" | "intermediate" | "advanced";
}

// ============================================================================
// UNION TYPE FOR ALL BLOCKS
// ============================================================================
export type LessonBlock =
  | LearningObjectivesBlock
  | VisualDiagramBlock
  | FlowchartBlock
  | CodeExampleBlock
  | CodingLabBlock
  | SummaryBlock
  | KeyTakeawaysBlock
  | RevisionNotesBlock
  | FurtherReadingBlock
  | ResearchPaperBlock
  | QuizBlock
  | CommonMistakesBlock
  | BestPracticesBlock
  | IndustryNotesBlock
  | CheatSheetBlock
  | RealWorldAnalogyBlock
  | ConceptExplanationBlock
  | ExecutionStepsBlock
  | InterviewQuestionsBlock
  | FlashcardsBlock
  | GlossaryBlock
  | ProjectBlock;

// ============================================================================
// VALIDATION
// ============================================================================
export function validateLessonBlock(block: unknown): block is LessonBlock {
  if (typeof block !== "object" || block === null) return false;
  const b = block as Record<string, unknown>;
  return typeof b.type === "string" && b.type !== "";
}

export function containsAuthoringSyntax(text: string): boolean {
  const authoringPatterns = [
    /\\theory\{/,
    /\\section\{/,
    /\\title\{/,
    /graph LR/,
    /graph TD/,
    /flowchart TD/,
    /flowchart LR/,
    /\{\{/,
    /\[\[/,
    /title=/,
    /body=/,
    /```mermaid/,
    /```latex/,
    /```markdown/,
  ];
  
  return authoringPatterns.some(pattern => pattern.test(text));
}

export function validateNoAuthoringSyntax(block: LessonBlock): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  function checkString(value: unknown, path: string) {
    if (typeof value === "string" && containsAuthoringSyntax(value)) {
      errors.push(`Authoring syntax detected in ${path}`);
    }
  }
  
  function checkObject(obj: unknown, path: string) {
    if (typeof obj !== "object" || obj === null) return;
    
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (typeof value === "string") {
        checkString(value, currentPath);
      } else if (typeof value === "object" && value !== null) {
        checkObject(value, currentPath);
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          checkObject(item, `${currentPath}[${index}]`);
        });
      }
    }
  }
  
  checkObject(block, "");
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
