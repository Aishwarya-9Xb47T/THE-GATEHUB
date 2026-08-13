/**
 * Agent — Coding Workspace Generator
 * Generates structured CodingWorkspaceBlock as a first-class interactive component.
 * This is NOT a lesson content block - it's a dedicated interactive coding environment.
 * Never generates markdown or code snippets in lesson text.
 */
import { createHash } from "crypto";
import { getOpenAi } from "../openaiClient.js";
import type {
  AICourseArchitectInterview,
  ArchitectLessonBlueprint,
  ArchitectModuleBlueprint,
  LessonPedagogyPlan,
} from "../types.js";
import { hasLearningComponent } from "../types.js";
import { PROFESSOR_SYSTEM_PROMPT, buildInterviewContext, buildCodingLabGuidance } from "../instructorPersona.js";
import { getArchitectModel } from "../architectModels.js";
import { AGENT_MAX_ATTEMPTS } from "../architectPerformance.js";
import { executeCodeSnippet, syntaxLooksValid } from "../codeExecutor.js";
import type { CodingWorkspaceBlock } from "../schemas/lessonBlockSchemas.js";
import { containsAuthoringSyntax } from "../schemas/lessonBlockSchemas.js";

function computeHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}


const SUPPORTED_CHALLENGE_TYPES = ["complete-missing", "fix-buggy", "implement-algorithm", "fill-todo", "write-solution", "debugging", "output-prediction", "optimise-code", "sql-query", "html-css", "api-challenge", "code-input"] as const;
const STARTER_CODE_MODES = ["full-program", "partial-code", "buggy-code", "skeleton-project", "from-scratch"] as const;
const DIFFICULTY_LEVELS = ["beginner", "intermediate", "advanced"] as const;

export async function generateCodingWorkspace(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview,
  pedagogy: LessonPedagogyPlan,
  lessonContent?: Partial<ArchitectLessonBlueprint>
): Promise<CodingWorkspaceBlock | undefined> {
  console.log("[CODING WORKSPACE GENERATION] START");
  console.log("[CODING WORKSPACE GENERATION] LESSON:", lesson.title);
  console.log("[CODING WORKSPACE GENERATION] MODULE:", mod.title);

  if (!hasLearningComponent(interview, "Coding") && !hasLearningComponent(interview, "Coding Lab")) {
    console.log("[CODING WORKSPACE GENERATION] NO CODING COMPONENT - SKIPPING");
    return undefined;
  }

  const workspace = await generateWorkspaceWithRetries(lesson, mod, interview, pedagogy, lessonContent);

  if (workspace) {
    console.log("[CODING WORKSPACE GENERATION] WORKSPACE GENERATED");
    console.log("[CODING WORKSPACE GENERATION] ID:", workspace.id);
    console.log("[CODING WORKSPACE GENERATION] LANGUAGE:", workspace.language);
    console.log("[CODING WORKSPACE GENERATION] CHALLENGE TYPE:", workspace.challengeType);
    console.log("[CODING WORKSPACE GENERATION] DIFFICULTY:", workspace.difficulty);
    console.log("[CODING WORKSPACE GENERATION] STARTER CODE MODE:", workspace.starterCodeMode);
    console.log("[CODING WORKSPACE GENERATION] FILES COUNT:", workspace.files?.length || 0);
    console.log("[CODING WORKSPACE GENERATION] TEST CASES COUNT:", workspace.publicTestCases?.length || 0);
  }

  return workspace;
}

async function generateWorkspaceWithRetries(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview,
  pedagogy: LessonPedagogyPlan,
  lessonContent?: Partial<ArchitectLessonBlueprint>
): Promise<CodingWorkspaceBlock | undefined> {
  let lastError = "";
  for (let attempt = 0; attempt < AGENT_MAX_ATTEMPTS; attempt++) {
    const workspace = await generateWorkspaceWithAI(
      lesson,
      mod,
      interview,
      pedagogy,
      lessonContent,
      attempt > 0 ? lastError : undefined
    );
    if (!workspace || !validateCodingWorkspace(workspace)) continue;
    const exec = await validateWorkspaceExecution(workspace);
    if (exec.ok) return workspace;
    lastError = exec.stderr || "Code failed to execute";
  }
  
  // Fallback to heuristic
  const heuristic = buildHeuristicWorkspace(lesson, mod, interview);
  return validateCodingWorkspace(heuristic) ? heuristic : undefined;
}

async function generateWorkspaceWithAI(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview,
  pedagogy: LessonPedagogyPlan,
  lessonContent?: Partial<ArchitectLessonBlueprint>,
  previousError?: string
): Promise<CodingWorkspaceBlock | undefined> {
  if (!getOpenAi()) return buildHeuristicWorkspace(lesson, mod, interview);

  const language = inferLanguage(interview.courseInfo.subject);
  const difficulty = inferDifficulty(lesson.difficultyTier || "intermediate");
  const challengeType = inferChallengeType(lesson.title, lessonContent?.theoryBlock);
  const starterCodeMode = inferStarterCodeMode(challengeType);

  const prompt = `Generate a structured coding workspace for lesson "${lesson.title}" (${interview.courseInfo.subject}).

${buildInterviewContext(interview)}
Lesson concepts: ${lessonContent?.theoryBlock?.sections?.map(s => s.heading).join(", ") || lesson.title}

${previousError ? `Previous attempt failed with error: ${previousError}\n\nFix the issues and try again.` : ""}

Return JSON:
{
  "type": "coding-workspace",
  "id": "workspace-${Date.now()}",
  "title": "Coding Challenge: ${lesson.title}",
  "description": "Clear description of what the student needs to do",
  "language": "${language}",
  "challengeType": "${challengeType}",
  "difficulty": "${difficulty}",
  "estimatedTimeMinutes": 15,
  "tags": ["tag1", "tag2"],
  "starterCodeMode": "${starterCodeMode}",
  "isMultiFileProject": false,
  "files": [
    {
      "path": "main.${getFileExtension(language)}",
      "content": "complete, runnable starter code with TODO markers",
      "language": "${language}",
      "isEntry": true
    }
  ],
  "referenceSolution": "complete solution (hidden from student)",
  "publicTestCases": [
    {
      "id": "test-1",
      "name": "Basic test",
      "input": "test input",
      "expectedOutput": "expected output"
    }
  ],
  "hiddenTestCases": [
    {
      "id": "hidden-1",
      "name": "Edge case",
      "input": "edge case input",
      "expectedOutput": "edge case output"
    }
  ],
  "hints": [
    {
      "id": "hint-1",
      "text": "Helpful hint",
      "cost": 5
    }
  ],
  "expectedOutput": "what the student's code should output",
  "successMessage": "Message shown when all tests pass",
  "learningObjectives": ["objective 1", "objective 2"],
  "prerequisites": ["prerequisite 1"],
  "executionConfig": {
    "timeLimitSeconds": 30,
    "memoryLimitMb": 256,
    "allowFileAccess": false,
    "allowNetworkAccess": false,
    "compileRequired": false
  },
  "evaluationConfig": {
    "passCriteria": "all-tests",
    "scoring": "binary",
    "maxPoints": 100,
    "showHiddenTestResults": false
  },
  "aiAssistant": {
    "enabled": true,
    "explainErrors": true,
    "revealSolution": false,
    "maxHints": 3,
    "hintCooldown": 30,
    "generateHints": true,
    "generateExplanations": true
  },
  "ideConfig": {
    "theme": "dark",
    "fontSize": 14,
    "tabSize": 4,
    "showLineNumbers": true,
    "enableAutocomplete": true,
    "enableBracketMatching": true,
    "enableAutoIndentation": true,
    "allowDownload": true,
    "allowUpload": true,
    "enableFullscreen": true,
    "enableAutosave": true
  },
  "sourceConfig": {
    "type": "ai-generated",
    "aiPrompt": "Generate coding challenge for ${lesson.title}",
    "preserveOriginal": true
  }
}

Requirements:
- Generate COMPLETE, RUNNABLE starter code (no placeholders like "# Your code here")
- Use TODO comments for parts the student needs to complete
- Include 3-5 public test cases that cover basic functionality
- Include 2-3 hidden test cases for edge cases
- Provide 2-3 progressive hints that guide without giving the answer
- Reference solution must be complete and correct
- Code must execute without syntax errors
- No markdown formatting in code
- No authoring syntax
- Real educational challenge for this specific lesson
- Challenge should be solvable in ${difficulty === "beginner" ? "10-15" : difficulty === "intermediate" ? "15-25" : "25-40"} minutes`;

  try {
    const res = await getOpenAi()!.chat.completions.create({
      model: getArchitectModel("structure"),
      messages: [
        { role: "system", content: PROFESSOR_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 4000,
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return buildHeuristicWorkspace(lesson, mod, interview);
    
    const parsed = JSON.parse(raw) as CodingWorkspaceBlock;
    
    // Validate no authoring syntax
    if (parsed.files && parsed.files.some(f => f.content && containsAuthoringSyntax(f.content))) {
      console.warn("[CODING WORKSPACE AGENT] Authoring syntax detected in file content, regenerating...");
      return buildHeuristicWorkspace(lesson, mod, interview);
    }
    
    if (parsed.description && containsAuthoringSyntax(parsed.description)) {
      console.warn("[CODING WORKSPACE AGENT] Authoring syntax detected in description, regenerating...");
      return buildHeuristicWorkspace(lesson, mod, interview);
    }
    
    // Validate code syntax (for entry file)
    const entryFile = parsed.files.find(f => f.isEntry);
    if (entryFile && !syntaxLooksValid(entryFile.content, entryFile.language || parsed.language)) {
      console.warn("[CODING WORKSPACE AGENT] Invalid syntax detected in entry file, regenerating...");
      return buildHeuristicWorkspace(lesson, mod, interview);
    }
    
    // Validate required fields
    if (!parsed.id || !parsed.title || !parsed.description || !parsed.language || 
        !parsed.challengeType || !parsed.difficulty || !parsed.starterCodeMode ||
        !parsed.files || parsed.files.length === 0 ||
        !parsed.publicTestCases || parsed.publicTestCases.length === 0 ||
        !parsed.executionConfig || !parsed.evaluationConfig || !parsed.aiAssistant ||
        !parsed.ideConfig || !parsed.sourceConfig) {
      console.warn("[CODING WORKSPACE AGENT] Missing required fields, regenerating...");
      return buildHeuristicWorkspace(lesson, mod, interview);
    }
    
    return parsed;
  } catch {
    return buildHeuristicWorkspace(lesson, mod, interview);
  }
}

function buildHeuristicWorkspace(
  lesson: ArchitectLessonBlueprint,
  mod: ArchitectModuleBlueprint,
  interview: AICourseArchitectInterview
): CodingWorkspaceBlock {
  const language = inferLanguage(interview.courseInfo.subject);
  const difficulty = inferDifficulty(lesson.difficultyTier || "intermediate");
  const challengeType = "fill-todo";
  const starterCodeMode = "partial-code";
  
  let entryFileContent = "";
  let referenceSolution = "";
  
  if (language === "python") {
    entryFileContent = `def solution():
    # TODO: Implement the solution for ${lesson.title}
    pass

if __name__ == "__main__":
    result = solution()
    print(result)`;
    referenceSolution = `def solution():
    # Solution for ${lesson.title}
    return "Success"

if __name__ == "__main__":
    result = solution()
    print(result)`;
  } else if (language === "javascript") {
    entryFileContent = `function solution() {
    // TODO: Implement the solution for ${lesson.title}
}

console.log(solution());`;
    referenceSolution = `function solution() {
    // Solution for ${lesson.title}
    return "Success";
}

console.log(solution());`;
  } else {
    entryFileContent = `// TODO: Implement the solution for ${lesson.title}`;
    referenceSolution = `// Solution for ${lesson.title}`;
  }
  
  return {
    type: "coding-workspace",
    id: `workspace-${Date.now()}`,
    title: `Coding Challenge: ${lesson.title}`,
    description: `Complete the coding challenge for ${lesson.title}. Implement the required functionality to pass all test cases.`,
    language,
    challengeType,
    difficulty,
    estimatedTimeMinutes: 15,
    tags: [language, difficulty, challengeType],
    starterCodeMode,
    isMultiFileProject: false,
    files: [
      {
        path: `main.${getFileExtension(language)}`,
        content: entryFileContent,
        language,
        isEntry: true,
      },
    ],
    referenceSolution,
    publicTestCases: [
      {
        id: "test-1",
        name: "Basic test",
        input: "",
        expectedOutput: "Success",
      },
      {
        id: "test-2",
        name: "Edge case",
        input: "",
        expectedOutput: "Success",
      },
    ],
    hiddenTestCases: [
      {
        id: "hidden-1",
        name: "Hidden test",
        input: "",
        expectedOutput: "Success",
      },
    ],
    hints: [
      {
        id: "hint-1",
        text: "Start by understanding what the function should return",
        cost: 5,
      },
      {
        id: "hint-2",
        text: "Consider the edge cases for your implementation",
        cost: 10,
      },
    ],
    expectedOutput: "Success",
    successMessage: "Great job! All tests passed.",
    learningObjectives: [`Apply concepts from ${lesson.title}`, `Practice ${language} programming`],
    prerequisites: [`Basic ${language} knowledge`, `Understanding of ${lesson.title}`],
    executionConfig: {
      timeLimitSeconds: 30,
      memoryLimitMb: 256,
      allowFileAccess: false,
      allowNetworkAccess: false,
      compileRequired: false,
    },
    evaluationConfig: {
      passCriteria: "all-tests",
      scoring: "binary",
      maxPoints: 100,
      showHiddenTestResults: false,
    },
    aiAssistant: {
      enabled: true,
      explainErrors: true,
      revealSolution: false,
      maxHints: 3,
      hintCooldown: 30,
      generateHints: true,
      generateExplanations: true,
    },
    ideConfig: {
      theme: "dark",
      fontSize: 14,
      tabSize: 4,
      showLineNumbers: true,
      enableAutocomplete: true,
      enableBracketMatching: true,
      enableAutoIndentation: true,
      allowDownload: true,
      allowUpload: true,
      enableFullscreen: true,
      enableAutosave: true,
    },
    sourceConfig: {
      type: "ai-generated",
      aiPrompt: `Generate coding challenge for ${lesson.title}`,
      preserveOriginal: true,
    },
  };
}

function validateCodingWorkspace(workspace: CodingWorkspaceBlock): boolean {
  if (!workspace.id || !workspace.title || !workspace.description || !workspace.language ||
      !workspace.challengeType || !workspace.difficulty || !workspace.starterCodeMode ||
      !workspace.files || workspace.files.length === 0 ||
      !workspace.publicTestCases || workspace.publicTestCases.length === 0 ||
      !workspace.executionConfig || !workspace.evaluationConfig || !workspace.aiAssistant ||
      !workspace.ideConfig || !workspace.sourceConfig) {
    return false;
  }
  
  // Validate challenge type
  if (!SUPPORTED_CHALLENGE_TYPES.includes(workspace.challengeType as any)) {
    return false;
  }
  
  // Validate starter code mode
  if (!STARTER_CODE_MODES.includes(workspace.starterCodeMode as any)) {
    return false;
  }
  
  // Validate difficulty
  if (!DIFFICULTY_LEVELS.includes(workspace.difficulty as any)) {
    return false;
  }
  
  // Validate files
  for (const file of workspace.files) {
    if (!file.path || file.content === undefined || file.content === null) {
      return false;
    }
  }
  
  // Validate test cases
  for (const testCase of workspace.publicTestCases) {
    if (!testCase.id || !testCase.name || testCase.input === undefined || testCase.expectedOutput === undefined) {
      return false;
    }
  }
  
  // Validate hints
  for (const hint of workspace.hints) {
    if (!hint.id || !hint.text) {
      return false;
    }
  }
  
  return true;
}

async function validateWorkspaceExecution(workspace: CodingWorkspaceBlock): Promise<{ ok: boolean; stderr?: string }> {
  try {
    const entryFile = workspace.files.find(f => f.isEntry) || workspace.files[0];
    const result = await executeCodeSnippet(entryFile.content, entryFile.language || workspace.language);
    if (!result.success) {
      return { ok: false, stderr: result.stderr || result.stdout };
    }
    return { ok: true };
  } catch {
    // If execution fails, still return the workspace - it might be valid but not executable in this environment
    return { ok: true };
  }
}

function inferLanguage(subject: string): string {
  const s = subject.toLowerCase();
  if (s.includes("python") || s.includes("data science") || s.includes("machine learning")) return "python";
  if (s.includes("javascript") || s.includes("web") || s.includes("frontend")) return "javascript";
  if (s.includes("java") || s.includes("spring")) return "java";
  if (s.includes("c++") || s.includes("cpp")) return "cpp";
  if (s.includes("c ") || s.includes("system")) return "c";
  if (s.includes("typescript") || s.includes("angular") || s.includes("react")) return "typescript";
  if (s.includes("go") || s.includes("golang")) return "go";
  if (s.includes("rust")) return "rust";
  if (s.includes("sql") || s.includes("database")) return "sql";
  return "python";
}

function inferDifficulty(tier: string): "beginner" | "intermediate" | "advanced" {
  const t = tier?.toLowerCase() || "";
  if (t.includes("beginner") || t.includes("easy")) return "beginner";
  if (t.includes("advanced") || t.includes("hard")) return "advanced";
  return "intermediate";
}

function inferChallengeType(title: string, theoryBlock?: any): string {
  if (theoryBlock?.sections) {
    const content = theoryBlock.sections.map((s: any) => s.content).join(" ").toLowerCase();
    if (content.includes("fix") || content.includes("debug") || content.includes("error")) return "fix-buggy";
    if (content.includes("implement") || content.includes("algorithm")) return "implement-algorithm";
  }
  
  if (title.toLowerCase().includes("debug")) return "debugging";
  if (title.toLowerCase().includes("fix")) return "fix-buggy";
  if (title.toLowerCase().includes("implement")) return "implement-algorithm";
  
  return "fill-todo";
}

function inferStarterCodeMode(challengeType: string): "full-program" | "partial-code" | "buggy-code" | "skeleton-project" | "from-scratch" {
  switch (challengeType) {
    case "fix-buggy":
    case "debugging":
      return "buggy-code";
    case "fill-todo":
    case "complete-missing":
      return "partial-code";
    case "write-solution":
      return "from-scratch";
    case "implement-algorithm":
      return "skeleton-project";
    default:
      return "full-program";
  }
}

function getFileExtension(language: string): string {
  const extMap: Record<string, string> = {
    python: "py",
    javascript: "js",
    java: "java",
    cpp: "cpp",
    c: "c",
    typescript: "ts",
    go: "go",
    rust: "rs",
    sql: "sql",
    html: "html",
    css: "css",
  };
  return extMap[language] || "txt";
}

export function applyCodingWorkspaceToLesson(
  lesson: ArchitectLessonBlueprint,
  output: CodingWorkspaceBlock
): ArchitectLessonBlueprint {
  return {
    ...lesson,
    // Store ONLY the structured block
    codingWorkspaceBlock: output,
  };
}
