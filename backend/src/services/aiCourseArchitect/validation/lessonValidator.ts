/**
 * Lesson Validation Service
 * Validates lesson structured blocks before publishing to ensure no authoring syntax reaches students.
 * This validates ONLY the structured blocks - legacy markdown fields are deprecated and should not be used.
 */
import type { ArchitectLessonBlueprint } from "../types.js";
import { validateNoAuthoringSyntax, type LessonBlock } from "../schemas/lessonBlockSchemas.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  blockedBlocks: string[];
}

/**
 * Comprehensive validation of a lesson blueprint's structured blocks before publishing.
 * Checks ONLY structured blocks for authoring syntax and required fields.
 * Legacy string fields are ignored - lessons should use structured blocks only.
 */
export function validateLessonForPublishing(lesson: ArchitectLessonBlueprint): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const blockedBlocks: string[] = [];

  // === VALIDATE STRUCTURED BLOCKS ONLY ===
  const structuredBlocks: Array<{ key: string; block: unknown; required: boolean }> = [
    { key: "objectivesBlock", block: lesson.objectivesBlock, required: true },
    { key: "theoryBlock", block: lesson.theoryBlock, required: true },
    { key: "summaryBlock", block: lesson.summaryBlock, required: true },
    { key: "introductionBlock", block: lesson.introductionBlock, required: false },
    { key: "realWorldAnalogyBlock", block: lesson.realWorldAnalogyBlock, required: false },
    { key: "conceptExplanationBlock", block: lesson.conceptExplanationBlock, required: false },
    { key: "visualDiagramBlock", block: lesson.visualDiagramBlock, required: false },
    { key: "flowchartBlock", block: lesson.flowchartBlock, required: false },
    { key: "mathematicalDerivationBlock", block: lesson.mathematicalDerivationBlock, required: false },
    { key: "codeExampleBlock", block: lesson.codeExampleBlock, required: false },
    { key: "executionStepsBlock", block: lesson.executionStepsBlock, required: false },
    { key: "commonMistakesBlock", block: lesson.commonMistakesBlock, required: false },
    { key: "bestPracticesBlock", block: lesson.bestPracticesBlock, required: false },
    { key: "industryNotesBlock", block: lesson.industryNotesBlock, required: false },
    { key: "examplesBlock", block: lesson.examplesBlock, required: false },
    { key: "caseStudyBlock", block: lesson.caseStudyBlock, required: false },
    { key: "practiceBlock", block: lesson.practiceBlock, required: false },
    { key: "keyTakeawaysBlock", block: lesson.keyTakeawaysBlock, required: false },
    { key: "revisionNotesBlock", block: lesson.revisionNotesBlock, required: false },
    { key: "furtherReadingBlock", block: lesson.furtherReadingBlock, required: false },
    { key: "learningOutcomeBlock", block: lesson.learningOutcomeBlock, required: false },
    { key: "prerequisitesBlock", block: lesson.prerequisitesBlock, required: false },
    { key: "faqBlock", block: lesson.faqBlock, required: false },
    { key: "flashcardsBlock", block: lesson.flashcardsBlock, required: false },
    { key: "glossaryBlock", block: lesson.glossaryBlock, required: false },
    { key: "interviewQuestionsBlock", block: lesson.interviewQuestionsBlock, required: false },
    { key: "quizBlock", block: lesson.quizBlock, required: false },
    { key: "codingLabBlock", block: lesson.codingLabBlock, required: false },
    { key: "codingWorkspaceBlock", block: lesson.codingWorkspaceBlock, required: false },
    { key: "assignmentBlock", block: lesson.assignmentBlock, required: false },
    { key: "miniProjectBlock", block: lesson.miniProjectBlock, required: false },
    { key: "researchPaperBlock", block: lesson.researchPaperBlock, required: false },
    { key: "cheatSheetBlock", block: lesson.cheatSheetBlock, required: false },
  ];

  for (const { key, block, required } of structuredBlocks) {
    // Check if required block is missing
    if (required && !block) {
      errors.push(`Required structured block missing: ${key}`);
      blockedBlocks.push(key);
      continue;
    }

    // Validate block structure and authoring syntax
    if (block) {
      const validation = validateNoAuthoringSyntax(block as LessonBlock);
      if (!validation.valid) {
        errors.push(`Authoring syntax detected in structured block: ${key}`);
        validation.errors.forEach((err) => errors.push(`  - ${err}`));
        blockedBlocks.push(key);
      }
    }
  }

  // === VALIDATE CODING LAB SPECIFICALLY ===
  if (lesson.codingLabBlock) {
    const codingLab = lesson.codingLabBlock;
    
    // Check required fields
    if (!codingLab.starterCode) {
      errors.push("Coding Lab missing required field: starterCode");
      blockedBlocks.push("codingLab.starterCode");
    }
    if (!codingLab.language) {
      errors.push("Coding Lab missing required field: language");
      blockedBlocks.push("codingLab.language");
    }
    if (!codingLab.publicTestCases || codingLab.publicTestCases.length === 0) {
      errors.push("Coding Lab missing required field: publicTestCases");
      blockedBlocks.push("codingLab.publicTestCases");
    }
    
    // Check for authoring syntax in code
    if (codingLab.starterCode && containsAuthoringSyntax(codingLab.starterCode)) {
      errors.push("Authoring syntax detected in codingLab.starterCode");
      blockedBlocks.push("codingLab.starterCode");
    }
    if (codingLab.hiddenSolution && containsAuthoringSyntax(codingLab.hiddenSolution)) {
      errors.push("Authoring syntax detected in codingLab.hiddenSolution");
      blockedBlocks.push("codingLab.hiddenSolution");
    }
    if (codingLab.instructions && containsAuthoringSyntax(codingLab.instructions)) {
      errors.push("Authoring syntax detected in codingLab.instructions");
      blockedBlocks.push("codingLab.instructions");
    }
  }

  // === VALIDATE CODING WORKSPACE (First-class interactive component) ===
  if (lesson.codingWorkspaceBlock) {
    const workspace = lesson.codingWorkspaceBlock;
    
    // Validate base InteractiveWorkspaceBase fields
    if (!workspace.type || workspace.type !== "coding-workspace") {
      errors.push("Coding Workspace type must be 'coding-workspace'");
      blockedBlocks.push("codingWorkspace.type");
    }
    if (!workspace.id) {
      errors.push("Coding Workspace missing required field: id");
      blockedBlocks.push("codingWorkspace.id");
    }
    if (!workspace.title) {
      errors.push("Coding Workspace missing required field: title");
      blockedBlocks.push("codingWorkspace.title");
    }
    if (!workspace.description) {
      errors.push("Coding Workspace missing required field: description");
      blockedBlocks.push("codingWorkspace.description");
    }
    
    // Validate workspace mode
    const validModes = ["practice", "assignment", "interview", "exam", "sandbox", "notebook"];
    if (!workspace.workspaceMode || !validModes.includes(workspace.workspaceMode)) {
      errors.push("Coding Workspace missing or invalid workspaceMode");
      blockedBlocks.push("codingWorkspace.workspaceMode");
    }
    
    // Validate difficulty
    const validDifficulties = ["beginner", "intermediate", "advanced", "expert"];
    if (!workspace.difficulty || !validDifficulties.includes(workspace.difficulty)) {
      errors.push("Coding Workspace missing or invalid difficulty");
      blockedBlocks.push("codingWorkspace.difficulty");
    }
    
    // Validate estimated time
    if (!workspace.estimatedTimeMinutes || workspace.estimatedTimeMinutes <= 0) {
      errors.push("Coding Workspace missing or invalid estimatedTimeMinutes");
      blockedBlocks.push("codingWorkspace.estimatedTimeMinutes");
    }
    
    // Coding-specific fields
    if (!workspace.language) {
      errors.push("Coding Workspace missing required field: language");
      blockedBlocks.push("codingWorkspace.language");
    }
    if (!workspace.challengeType) {
      errors.push("Coding Workspace missing required field: challengeType");
      blockedBlocks.push("codingWorkspace.challengeType");
    }
    if (!workspace.starterCodeMode) {
      errors.push("Coding Workspace missing required field: starterCodeMode");
      blockedBlocks.push("codingWorkspace.starterCodeMode");
    }
    if (!workspace.files || workspace.files.length === 0) {
      errors.push("Coding Workspace missing required field: files (at least one file required)");
      blockedBlocks.push("codingWorkspace.files");
    }
    if (!workspace.publicTestCases || workspace.publicTestCases.length === 0) {
      errors.push("Coding Workspace missing required field: publicTestCases");
      blockedBlocks.push("codingWorkspace.publicTestCases");
    }
    if (!workspace.languageConfig) {
      errors.push("Coding Workspace missing required field: languageConfig");
      blockedBlocks.push("codingWorkspace.languageConfig");
    }
    
    // Validate required base configuration objects
    if (!workspace.executionConfig) {
      errors.push("Coding Workspace missing required field: executionConfig");
      blockedBlocks.push("codingWorkspace.executionConfig");
    }
    if (!workspace.evaluationConfig) {
      errors.push("Coding Workspace missing required field: evaluationConfig");
      blockedBlocks.push("codingWorkspace.evaluationConfig");
    }
    if (!workspace.aiAssistant) {
      errors.push("Coding Workspace missing required field: aiAssistant");
      blockedBlocks.push("codingWorkspace.aiAssistant");
    }
    if (!workspace.uiConfig) {
      errors.push("Coding Workspace missing required field: uiConfig");
      blockedBlocks.push("codingWorkspace.uiConfig");
    }
    if (!workspace.sourceConfig) {
      errors.push("Coding Workspace missing required field: sourceConfig");
      blockedBlocks.push("codingWorkspace.sourceConfig");
    }
    if (!workspace.lifecycleConfig) {
      errors.push("Coding Workspace missing required field: lifecycleConfig");
      blockedBlocks.push("codingWorkspace.lifecycleConfig");
    }
    
    // Validate files structure
    for (const file of workspace.files) {
      if (!file.path) {
        errors.push("Coding Workspace file missing required field: path");
        blockedBlocks.push("codingWorkspace.files.path");
      }
      if (file.content === undefined || file.content === null) {
        errors.push("Coding Workspace file missing required field: content");
        blockedBlocks.push("codingWorkspace.files.content");
      }
      // Check for authoring syntax in file content
      if (file.content && containsAuthoringSyntax(file.content)) {
        errors.push("Authoring syntax detected in coding workspace file content");
        blockedBlocks.push("codingWorkspace.files.content");
      }
    }
    
    // Check for authoring syntax in description
    if (workspace.description && containsAuthoringSyntax(workspace.description)) {
      errors.push("Authoring syntax detected in codingWorkspace.description");
      blockedBlocks.push("codingWorkspace.description");
    }
    
    // Validate test case structure
    for (const testCase of workspace.publicTestCases) {
      if (!testCase.id || !testCase.name || testCase.input === undefined || testCase.expectedOutput === undefined) {
        errors.push("Coding Workspace public test case missing required fields (id, name, input, expectedOutput)");
        blockedBlocks.push("codingWorkspace.publicTestCases");
      }
    }
    
    // Validate hidden test cases
    if (workspace.hiddenTestCases) {
      for (const testCase of workspace.hiddenTestCases) {
        if (!testCase.id || !testCase.name || testCase.input === undefined || testCase.expectedOutput === undefined) {
          errors.push("Coding Workspace hidden test case missing required fields (id, name, input, expectedOutput)");
          blockedBlocks.push("codingWorkspace.hiddenTestCases");
        }
      }
    }
    
    // Validate performance test cases
    if (workspace.performanceTestCases) {
      for (const testCase of workspace.performanceTestCases) {
        if (!testCase.id || !testCase.name || !testCase.maxTimeMs || !testCase.maxMemoryMb) {
          errors.push("Coding Workspace performance test case missing required fields (id, name, maxTimeMs, maxMemoryMb)");
          blockedBlocks.push("codingWorkspace.performanceTestCases");
        }
      }
    }
    
    // Validate hints structure
    for (const hint of workspace.hints) {
      if (!hint.id || !hint.text) {
        errors.push("Coding Workspace hint missing required fields (id, text)");
        blockedBlocks.push("codingWorkspace.hints");
      }
    }
    
    // Validate source configuration
    const validSourceTypes = ["paste", "upload", "upload-zip", "github-import", "ai-generated", "import-latex", "import-markdown", "import-docx", "import-pdf", "manual", "template"];
    if (!workspace.sourceConfig.type || !validSourceTypes.includes(workspace.sourceConfig.type)) {
      errors.push("Coding Workspace source config missing or invalid type");
      blockedBlocks.push("codingWorkspace.sourceConfig.type");
    }
    if (workspace.sourceConfig.type === "upload-zip" && !workspace.sourceConfig.zipStructure) {
      errors.push("Coding Workspace source config type 'upload-zip' requires zipStructure");
      blockedBlocks.push("codingWorkspace.sourceConfig.zipStructure");
    }
    if (workspace.sourceConfig.type === "github-import" && !workspace.sourceConfig.githubConfig) {
      errors.push("Coding Workspace source config type 'github-import' requires githubConfig");
      blockedBlocks.push("codingWorkspace.sourceConfig.githubConfig");
    }
    if (workspace.sourceConfig.type === "ai-generated" && !workspace.sourceConfig.aiPrompt) {
      errors.push("Coding Workspace source config type 'ai-generated' requires aiPrompt");
      blockedBlocks.push("codingWorkspace.sourceConfig.aiPrompt");
    }
    
    // Validate language config
    if (!workspace.languageConfig.language) {
      errors.push("Coding Workspace languageConfig missing required field: language");
      blockedBlocks.push("codingWorkspace.languageConfig.language");
    }
    if (!workspace.languageConfig.sourceExtensions || workspace.languageConfig.sourceExtensions.length === 0) {
      errors.push("Coding Workspace languageConfig missing required field: sourceExtensions");
      blockedBlocks.push("codingWorkspace.languageConfig.sourceExtensions");
    }
    if (!workspace.languageConfig.features) {
      errors.push("Coding Workspace languageConfig missing required field: features");
      blockedBlocks.push("codingWorkspace.languageConfig.features");
    }
  }

  // === WARNINGS FOR DEPRECATED LEGACY FIELDS ===
  const deprecatedFields: (keyof ArchitectLessonBlueprint)[] = [
    "introduction",
    "theory",
    "conceptExplanation",
    "visualDiagram",
    "flowchart",
    "mathematicalDerivation",
    "codeExample",
    "executionSteps",
    "examples",
    "caseStudy",
    "practice",
    "summary",
    "revision",
    "learningOutcome",
    "commonMistakes",
    "bestPractices",
    "industryNotes",
    "keyTakeaways",
    "furtherReading",
    "quizQuestions",
    "diagrams",
  ];
  
  for (const field of deprecatedFields) {
    if (lesson[field]) {
      warnings.push(`Deprecated legacy field still present: ${field} - should use structured block instead`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    blockedBlocks,
  };
}

/**
 * Strict validation that rejects lessons with ANY authoring syntax in structured blocks.
 * Use this before publishing to ensure clean student experience.
 */
export function strictPublishingValidation(lesson: ArchitectLessonBlueprint): {
  approved: boolean;
  reason: string;
  details: ValidationResult;
} {
  const validation = validateLessonForPublishing(lesson);
  
  if (!validation.valid) {
    return {
      approved: false,
      reason: `Lesson blocked from publishing: ${validation.errors.length} validation errors detected`,
      details: validation,
    };
  }
  
  if (validation.warnings.length > 0) {
    return {
      approved: true,
      reason: `Lesson approved with ${validation.warnings.length} warnings (deprecated legacy fields present)`,
      details: validation,
    };
  }
  
  return {
    approved: true,
    reason: "Lesson approved for publishing - all structured blocks valid",
    details: validation,
  };
}

/**
 * Validates that a specific structured block has the required structure.
 * This is a helper for block-specific validation.
 */
export function validateBlockStructure(block: LessonBlock, blockType: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!block || typeof block !== "object") {
    errors.push(`${blockType} is not a valid object`);
    return { valid: false, errors };
  }

  if (!block.type || typeof block.type !== "string") {
    errors.push(`${blockType} missing or invalid 'type' field`);
  }

  // Block-specific validation
  if (block.type === "learning-objectives") {
    if (!(block as any).objectives || !Array.isArray((block as any).objectives)) {
      errors.push(`${blockType} missing 'objectives' array`);
    }
  } else if (block.type === "summary") {
    if (!(block as any).sections || !Array.isArray((block as any).sections)) {
      errors.push(`${blockType} missing 'sections' array`);
    }
  } else if (block.type === "visual-diagram") {
    if (!(block as any).nodes || !Array.isArray((block as any).nodes)) {
      errors.push(`${blockType} missing 'nodes' array`);
    }
    if (!(block as any).edges || !Array.isArray((block as any).edges)) {
      errors.push(`${blockType} missing 'edges' array`);
    }
  } else if (block.type === "flowchart") {
    if (!(block as any).steps || !Array.isArray((block as any).steps)) {
      errors.push(`${blockType} missing 'steps' array`);
    }
  } else if (block.type === "quiz") {
    if (!(block as any).questions || !Array.isArray((block as any).questions)) {
      errors.push(`${blockType} missing 'questions' array`);
    }
  } else if (block.type === "coding-lab") {
    if (!(block as any).starterCode) {
      errors.push(`${blockType} missing 'starterCode'`);
    }
    if (!(block as any).publicTestCases || !Array.isArray((block as any).publicTestCases)) {
      errors.push(`${blockType} missing 'publicTestCases' array`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Helper function to check for authoring syntax in strings
function containsAuthoringSyntax(text: string): boolean {
  const patterns = [
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
  return patterns.some((pattern) => pattern.test(text));
}

