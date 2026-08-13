/**
 * V6 Part 4 — Prerequisite detector and bridge recommendations.
 */
import type { ArchitectBlueprint, ArchitectLessonBlueprint } from "../types.js";
import type { LessonOutlineContext } from "../lessonPlanningEngine.js";

export interface PrerequisiteAnalysis {
  requiredTopics: string[];
  optionalTopics: string[];
  missingConcepts: string[];
  bridgeLessons: string[];
  revisionRecommendations: string[];
  readyToProceed: boolean;
}

export function analyzePrerequisites(
  lesson: ArchitectLessonBlueprint,
  outline: LessonOutlineContext,
  blueprint: ArchitectBlueprint
): PrerequisiteAnalysis {
  const requiredTopics = lesson.prerequisites ?? lesson.objectives?.slice(0, 2) ?? [];
  const priorTitles = outline.priorLessons.map((p) => p.lessonTitle);
  const optionalTopics = outline.priorLessons.slice(0, -1).map((p) => p.lessonTitle);

  const missingConcepts: string[] = [];
  if (outline.globalIndex > 0 && priorTitles.length === 0) {
    missingConcepts.push("No prior lesson context detected");
  }
  if ((lesson.objectives?.length ?? 0) < 2 && outline.globalIndex > 2) {
    missingConcepts.push("Learning objectives may assume unstated prior knowledge");
  }

  const bridgeLessons = missingConcepts.length
    ? [`Bridge: Review ${priorTitles[priorTitles.length - 1] ?? "foundations"} before ${lesson.title}`]
    : [];

  const revisionRecommendations = priorTitles.length
    ? [`Review concepts from: ${priorTitles.slice(-2).join(", ")}`]
    : blueprint.prerequisites?.length
      ? blueprint.prerequisites.map((p) => `Ensure familiarity with: ${p}`)
      : [];

  return {
    requiredTopics,
    optionalTopics,
    missingConcepts,
    bridgeLessons,
    revisionRecommendations,
    readyToProceed: missingConcepts.length === 0,
  };
}

export function formatPrerequisitesForPrompt(analysis: PrerequisiteAnalysis): string {
  return `
PREREQUISITE CHECK:
- Required: ${analysis.requiredTopics.join("; ") || "Course foundations"}
- Optional review: ${analysis.optionalTopics.join("; ") || "None"}
- Bridge lessons: ${analysis.bridgeLessons.join("; ") || "None needed"}
- Revision: ${analysis.revisionRecommendations.join("; ")}
`.trim();
}
