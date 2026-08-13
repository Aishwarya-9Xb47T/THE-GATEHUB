/**
 * Lesson Migration Tool
 * One-time migration tool to convert legacy markdown-based lessons to structured block format.
 * This should be run once to migrate existing courses, then the legacy fields can be removed.
 */
import type { ArchitectLessonBlueprint } from "../types.js";
import type {
  LearningObjectivesBlock,
  TheoryBlock,
  SummaryBlock,
  CodeExampleBlock,
  QuizBlock,
  CommonMistakesBlock,
  FurtherReadingBlock,
  CodingWorkspaceBlock,
} from "../schemas/lessonBlockSchemas.js";

export interface MigrationResult {
  success: boolean;
  migratedBlocks: string[];
  skippedBlocks: string[];
  errors: string[];
}

/**
 * Migrates a legacy lesson blueprint to use structured blocks.
 * Converts markdown fields to typed structured objects.
 */
export function migrateLessonToStructuredBlocks(lesson: ArchitectLessonBlueprint): {
  migratedLesson: ArchitectLessonBlueprint;
  result: MigrationResult;
} {
  const result: MigrationResult = {
    success: true,
    migratedBlocks: [],
    skippedBlocks: [],
    errors: [],
  };

  const migratedLesson = { ...lesson };

  // === MIGRATE OBJECTIVES ===
  if (lesson.objectives && !lesson.objectivesBlock) {
    try {
      migratedLesson.objectivesBlock = migrateObjectives(lesson.objectives);
      result.migratedBlocks.push("objectives");
    } catch (e) {
      result.errors.push(`Failed to migrate objectives: ${e instanceof Error ? e.message : String(e)}`);
      result.success = false;
    }
  } else if (lesson.objectivesBlock) {
    result.skippedBlocks.push("objectives (already has structured block)");
  }

  // === MIGRATE THEORY ===
  if (lesson.theory && !lesson.theoryBlock) {
    try {
      migratedLesson.theoryBlock = migrateTheory(lesson.theory);
      result.migratedBlocks.push("theory");
    } catch (e) {
      result.errors.push(`Failed to migrate theory: ${e instanceof Error ? e.message : String(e)}`);
      result.success = false;
    }
  } else if (lesson.theoryBlock) {
    result.skippedBlocks.push("theory (already has structured block)");
  }

  // === MIGRATE SUMMARY ===
  if (lesson.summary && !lesson.summaryBlock) {
    try {
      migratedLesson.summaryBlock = migrateSummary(lesson.summary);
      result.migratedBlocks.push("summary");
    } catch (e) {
      result.errors.push(`Failed to migrate summary: ${e instanceof Error ? e.message : String(e)}`);
      result.success = false;
    }
  } else if (lesson.summaryBlock) {
    result.skippedBlocks.push("summary (already has structured block)");
  }

  // === MIGRATE CODE EXAMPLE ===
  if (lesson.codeExample && !lesson.codeExampleBlock) {
    try {
      migratedLesson.codeExampleBlock = migrateCodeExample(lesson.codeExample);
      result.migratedBlocks.push("codeExample");
    } catch (e) {
      result.errors.push(`Failed to migrate codeExample: ${e instanceof Error ? e.message : String(e)}`);
      result.success = false;
    }
  } else if (lesson.codeExampleBlock) {
    result.skippedBlocks.push("codeExample (already has structured block)");
  }

  // === MIGRATE QUIZ ===
  if (lesson.quizQuestions && !lesson.quizBlock) {
    try {
      migratedLesson.quizBlock = migrateQuiz(lesson.quizQuestions as any[]);
      result.migratedBlocks.push("quiz");
    } catch (e) {
      result.errors.push(`Failed to migrate quiz: ${e instanceof Error ? e.message : String(e)}`);
      result.success = false;
    }
  } else if (lesson.quizBlock) {
    result.skippedBlocks.push("quiz (already has structured block)");
  }

  // === MIGRATE COMMON MISTAKES ===
  if (lesson.commonMistakes && !lesson.commonMistakesBlock) {
    try {
      migratedLesson.commonMistakesBlock = migrateCommonMistakes(lesson.commonMistakes);
      result.migratedBlocks.push("commonMistakes");
    } catch (e) {
      result.errors.push(`Failed to migrate commonMistakes: ${e instanceof Error ? e.message : String(e)}`);
      result.success = false;
    }
  } else if (lesson.commonMistakesBlock) {
    result.skippedBlocks.push("commonMistakes (already has structured block)");
  }

  // === MIGRATE FURTHER READING ===
  if (lesson.furtherReading && !lesson.furtherReadingBlock) {
    try {
      migratedLesson.furtherReadingBlock = migrateFurtherReading(lesson.furtherReading);
      result.migratedBlocks.push("furtherReading");
    } catch (e) {
      result.errors.push(`Failed to migrate furtherReading: ${e instanceof Error ? e.message : String(e)}`);
      result.success = false;
    }
  } else if (lesson.furtherReadingBlock) {
    result.skippedBlocks.push("furtherReading (already has structured block)");
  }

  // === MIGRATE CODING LAB TO CODING WORKSPACE ===
  if (lesson.codingLab && !lesson.codingWorkspaceBlock) {
    try {
      migratedLesson.codingWorkspaceBlock = migrateCodingLabToWorkspace(lesson.codingLab);
      result.migratedBlocks.push("codingLab -> codingWorkspace");
    } catch (e) {
      result.errors.push(`Failed to migrate codingLab: ${e instanceof Error ? e.message : String(e)}`);
      result.success = false;
    }
  } else if (lesson.codingWorkspaceBlock) {
    result.skippedBlocks.push("codingWorkspace (already has structured block)");
  }

  return {
    migratedLesson,
    result,
  };
}

/**
 * Migrates objectives array to LearningObjectivesBlock
 */
function migrateObjectives(objectives: string[]): LearningObjectivesBlock {
  return {
    type: "learning-objectives",
    title: "Learning Objectives",
    objectives: objectives.map((text, i) => ({
      id: `obj-${i + 1}`,
      text,
      bloomLevel: inferBloomLevel(text),
      measurable: isMeasurable(text),
    })),
  };
}

/**
 * Migrates theory markdown to TheoryBlock
 */
function migrateTheory(theory: string): TheoryBlock {
  // Parse markdown sections
  const sections: Array<{
    heading?: string;
    content: string;
    type: "paragraph" | "bullet-list" | "numbered-list";
  }> = [];

  const lines = theory.split("\n");
  let currentSection: typeof sections[0] | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    // Check for heading
    if (line.startsWith("##")) {
      // Save previous section
      if (currentSection) {
        currentSection.content = currentContent.join("\n").trim();
        sections.push(currentSection);
      }
      // Start new section
      currentSection = {
        heading: line.replace(/^#+\s*/, "").trim(),
        content: "",
        type: "paragraph",
      };
      currentContent = [];
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      // Bullet list
      if (currentSection) {
        currentSection.type = "bullet-list";
      }
      currentContent.push(line.replace(/^[-*]\s*/, ""));
    } else if (line.match(/^\d+\./)) {
      // Numbered list
      if (currentSection) {
        currentSection.type = "numbered-list";
      }
      currentContent.push(line.replace(/^\d+\.\s*/, ""));
    } else {
      // Regular paragraph
      if (!currentSection) {
        currentSection = { content: "", type: "paragraph" };
        currentContent = [];
      }
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentSection) {
    currentSection.content = currentContent.join("\n").trim();
    sections.push(currentSection);
  }

  // If no sections found, create a single paragraph section
  if (sections.length === 0) {
    sections.push({
      content: theory.trim(),
      type: "paragraph",
    });
  }

  return {
    type: "theory",
    title: "Theory",
    sections,
  };
}

/**
 * Migrates summary markdown to SummaryBlock
 */
function migrateSummary(summary: string): SummaryBlock {
  // Similar parsing to theory
  const sections: Array<{
    heading?: string;
    content: string;
    type: "paragraph" | "bullet-list" | "numbered-list";
  }> = [];

  const lines = summary.split("\n");
  let currentSection: typeof sections[0] | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    if (line.startsWith("##")) {
      if (currentSection) {
        currentSection.content = currentContent.join("\n").trim();
        sections.push(currentSection);
      }
      currentSection = {
        heading: line.replace(/^#+\s*/, "").trim(),
        content: "",
        type: "paragraph",
      };
      currentContent = [];
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      if (currentSection) {
        currentSection.type = "bullet-list";
      }
      currentContent.push(line.replace(/^[-*]\s*/, ""));
    } else if (line.match(/^\d+\./)) {
      if (currentSection) {
        currentSection.type = "numbered-list";
      }
      currentContent.push(line.replace(/^\d+\.\s*/, ""));
    } else {
      if (!currentSection) {
        currentSection = { content: "", type: "paragraph" };
        currentContent = [];
      }
      currentContent.push(line);
    }
  }

  if (currentSection) {
    currentSection.content = currentContent.join("\n").trim();
    sections.push(currentSection);
  }

  if (sections.length === 0) {
    sections.push({
      content: summary.trim(),
      type: "paragraph",
    });
  }

  return {
    type: "summary",
    title: "Summary",
    sections,
  };
}

/**
 * Migrates code example markdown to CodeExampleBlock
 */
function migrateCodeExample(codeExample: string): CodeExampleBlock {
  // Extract code from markdown code blocks
  const codeBlockMatch = codeExample.match(/```(\w+)?\n([\s\S]*?)```/);
  const code = codeBlockMatch ? codeBlockMatch[2] : codeExample;
  const language = codeBlockMatch?.[1] || "python";

  // Extract output
  const outputMatch = codeExample.match(/Output:?\s*```([\s\S]*?)```/i);
  const output = outputMatch ? outputMatch[1].trim() : "";

  return {
    type: "code-example",
    title: "Code Example",
    description: "Migrated from legacy markdown",
    language: language as any,
    filename: `example.${getFileExtension(language)}`,
    code: code.trim(),
    lineNumbers: true,
    syntaxHighlighting: true,
    copyButton: true,
    explanation: "Migrated from legacy markdown - review and update",
    output,
    complexity: {
      time: "N/A",
      space: "N/A",
    },
  };
}

/**
 * Migrates quiz questions to QuizBlock
 */
function migrateQuiz(quizQuestions: any[]): QuizBlock {
  return {
    type: "quiz",
    title: "Quiz",
    description: "Migrated from legacy format",
    questions: quizQuestions.map((q, i) => ({
      id: `q${i + 1}`,
      type: q.type || "mcq",
      question: q.text || q.question,
      options: q.options?.map((o: any, j: number) => ({
        id: `opt-${j + 1}`,
        text: o.text,
        isCorrect: o.isCorrect,
        explanation: o.explanation || "",
      })) || [],
      explanation: q.explanation || "",
      difficulty: q.difficulty || "medium",
      points: q.points || 1,
      hints: q.hints || [],
    })),
    passingScore: 70,
    timeLimit: 300,
  };
}

/**
 * Migrates common mistakes to CommonMistakesBlock
 */
function migrateCommonMistakes(commonMistakes: string[]): CommonMistakesBlock {
  return {
    type: "common-mistakes",
    title: "Common Mistakes to Avoid",
    mistakes: commonMistakes.map((mistake, i) => ({
      id: `m${i + 1}`,
      mistake: mistake.split("\n")[0] || mistake,
      whyItHappens: "Migrated from legacy - review and update",
      howToAvoid: "Migrated from legacy - review and update",
      example: "",
      correctedExample: "",
      severity: "major" as const,
    })),
  };
}

/**
 * Migrates further reading to FurtherReadingBlock
 */
function migrateFurtherReading(furtherReading: Array<{ title: string; url: string; type?: string }>): FurtherReadingBlock {
  return {
    type: "further-reading",
    title: "Further Reading",
    resources: furtherReading.map((r, i) => ({
      id: `r${i + 1}`,
      title: r.title,
      type: (r.type as any) || "website",
      url: r.url,
      description: "Migrated from legacy - review and update",
      relevance: "Migrated from legacy - review and update",
      difficulty: "intermediate" as const,
    })),
  };
}

/**
 * Migrates legacy codingLab to CodingWorkspaceBlock
 * Converts the old ArchitectCodingLab structure to the new first-class interactive component
 */
function migrateCodingLabToWorkspace(codingLab: any): CodingWorkspaceBlock {
  return {
    type: "coding-workspace",
    id: codingLab.id || `workspace-${Date.now()}`,
    title: codingLab.title || "Coding Challenge",
    description: codingLab.description || codingLab.instructions || "Complete the coding challenge",
    
    // Language and challenge configuration
    language: codingLab.language || "python",
    challengeType: inferChallengeType(codingLab.starterCode),
    difficulty: codingLab.difficulty || "intermediate",
    
    // Code provided to student
    starterCode: codingLab.starterCode || "",
    referenceSolution: codingLab.solutionCode || codingLab.hiddenSolution,
    
    // Test cases
    publicTestCases: (codingLab.publicTestCases || []).map((tc: any, i: number) => ({
      id: `test-${i + 1}`,
      name: tc.name || `Test Case ${i + 1}`,
      input: tc.input || "",
      expectedOutput: tc.output || tc.expectedOutput || "",
    })),
    hiddenTestCases: (codingLab.hiddenTestCases || []).map((tc: any, i: number) => ({
      id: `hidden-test-${i + 1}`,
      name: tc.name || `Hidden Test ${i + 1}`,
      input: tc.input || "",
      expectedOutput: tc.output || tc.expectedOutput || "",
    })),
    
    // Learning support
    hints: (codingLab.hints || []).map((hint: string, i: number) => ({
      id: `hint-${i + 1}`,
      text: hint,
    })),
    expectedOutput: codingLab.expectedOutput,
    successMessage: codingLab.successMessage,
    
    // Execution configuration
    executionConfig: {
      timeLimitSeconds: codingLab.timeLimit || 30,
      memoryLimitMb: codingLab.memoryLimit || 256,
      allowFileAccess: false,
      allowNetworkAccess: false,
    },
    
    // Evaluation configuration
    evaluationConfig: {
      passCriteria: "all-tests",
      scoring: "binary",
      maxPoints: codingLab.points || 100,
    },
    
    // AI Assistant configuration
    aiAssistant: {
      enabled: true,
      explainErrors: true,
      revealSolution: false,
      maxHints: 3,
      hintCooldown: 30,
    },
    
    // Metadata
    estimatedTimeMinutes: codingLab.estimatedTime || 15,
    learningObjectives: codingLab.learningObjectives,
    prerequisites: codingLab.prerequisites,
  };
}

// Helper function to infer challenge type from starter code
function inferChallengeType(starterCode: string): "complete-missing" | "fix-buggy" | "implement-algorithm" | "fill-todo" | "write-solution" | "debugging" | "output-prediction" {
  if (!starterCode) return "write-solution";
  
  if (starterCode.includes("TODO") || starterCode.includes("FIXME") || starterCode.includes("# Your code here")) {
    return "fill-todo";
  }
  
  if (starterCode.includes("# Bug") || starterCode.includes("// Fix") || starterCode.includes("error")) {
    return "fix-buggy";
  }
  
  if (starterCode.includes("def ") || starterCode.includes("function ") || starterCode.includes("class ")) {
    return "complete-missing";
  }
  
  return "implement-algorithm";
}

// Helper functions
function inferBloomLevel(text: string): "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create" {
  const lower = text.toLowerCase();
  if (lower.startsWith("define") || lower.startsWith("list") || lower.startsWith("identify")) return "remember";
  if (lower.startsWith("explain") || lower.startsWith("describe") || lower.startsWith("summarize")) return "understand";
  if (lower.startsWith("apply") || lower.startsWith("use") || lower.startsWith("implement")) return "apply";
  if (lower.startsWith("analyze") || lower.startsWith("compare") || lower.startsWith("distinguish")) return "analyze";
  if (lower.startsWith("evaluate") || lower.startsWith("assess") || lower.startsWith("critique")) return "evaluate";
  return "create";
}

function isMeasurable(text: string): boolean {
  const nonMeasurable = ["understand", "know", "learn", "appreciate", "comprehend"];
  return !nonMeasurable.some((word) => text.toLowerCase().startsWith(word));
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
  };
  return extMap[language] || "txt";
}

/**
 * Batch migrates multiple lessons
 */
export function batchMigrateLessons(lessons: ArchitectLessonBlueprint[]): {
  migratedLessons: ArchitectLessonBlueprint[];
  results: MigrationResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
} {
  const results: MigrationResult[] = [];
  const migratedLessons: ArchitectLessonBlueprint[] = [];

  for (const lesson of lessons) {
    const { migratedLesson, result } = migrateLessonToStructuredBlocks(lesson);
    migratedLessons.push(migratedLesson);
    results.push(result);
  }

  const summary = {
    total: lessons.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  };

  return {
    migratedLessons,
    results,
    summary,
  };
}
