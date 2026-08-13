/**
 * V6 — Agent field ownership rules.
 * Agents extend the Lesson Blueprint; they never overwrite another agent's fields.
 */
import type { ArchitectLessonBlueprint } from "./types.js";
import type { AgentStageId } from "./orchestrator/contracts.js";

/** Fields each agent is allowed to write on ArchitectLessonBlueprint. */
export const AGENT_FIELD_OWNERSHIP: Partial<Record<AgentStageId, (keyof ArchitectLessonBlueprint)[]>> = {
  "lesson-writer": [
    "introduction",
    "objectives",
    "realWorldAnalogy",
    "theory",
    "conceptExplanation",
    "examples",
    "caseStudy",
    "practice",
    "summary",
    "keyTakeaways",
    "revision",
    "learningOutcome",
    "commonMistakes",
    "bestPractices",
    "industryNotes",
    "faq",
    "discussionPrompt",
  ],
  "code-generator": ["codeExample", "executionSteps"],
  "code-validation": ["codeExample", "executionSteps", "codeValidation"],
  "diagram": ["flowchart", "visualDiagram", "diagrams"],
  "visual-content": ["visualContent"],
  "video-recommendation": ["videos"],
  "research-paper": ["researchPapers"],
  reference: ["lessonReferences", "references", "furtherReading"],
  glossary: ["glossary"],
  "revision-notes": ["revisionNotes", "flashcards", "cheatSheet"],
  assessment: ["quizQuestions"],
  "coding-lab": ["codingLab"],
  assignment: ["assignment"],
  project: ["miniProject"],
  "interview-prep": ["interviewQuestions"],
};

const WRITER_OWNED = new Set(AGENT_FIELD_OWNERSHIP["lesson-writer"] ?? []);

/**
 * Merge agent output into lesson without clobbering fields owned by other agents.
 */
export function mergeAgentFields<T extends Partial<ArchitectLessonBlueprint>>(
  lesson: ArchitectLessonBlueprint,
  patch: T,
  agentStage: AgentStageId
): ArchitectLessonBlueprint {
  const owned = new Set(AGENT_FIELD_OWNERSHIP[agentStage] ?? Object.keys(patch));
  const result = { ...lesson };
  for (const key of Object.keys(patch) as (keyof ArchitectLessonBlueprint)[]) {
    if (!owned.has(key)) continue;
    const value = patch[key];
    if (value === undefined) continue;
    if (WRITER_OWNED.has(key) && agentStage !== "lesson-writer") continue;
    (result as Record<string, unknown>)[key as string] = value;
  }
  return result;
}

/** Lesson Writer may not set quiz, lab, code, or reference fields. */
export const LESSON_WRITER_FORBIDDEN: (keyof ArchitectLessonBlueprint)[] = [
  "quizQuestions",
  "codingLab",
  "researchPapers",
  "lessonReferences",
  "videos",
  "assignment",
  "miniProject",
  "interviewQuestions",
  "diagrams",
  "visualContent",
];

export function sanitizeWriterOutput(lesson: ArchitectLessonBlueprint): ArchitectLessonBlueprint {
  const clean = { ...lesson };
  for (const key of LESSON_WRITER_FORBIDDEN) {
    if (key in clean) {
      delete (clean as Record<string, unknown>)[key as string];
    }
  }
  return clean;
}
