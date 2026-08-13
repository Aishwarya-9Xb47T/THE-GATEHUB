/**
 * V6 Part 4 — Knowledge gap analyzer (curriculum-wide).
 */
import type { ArchitectBlueprint, AICourseArchitectInterview } from "../types.js";
import { isSubstantiveText } from "../pipeline/placeholderGuards.js";
import { hasLearningComponent } from "../types.js";

export interface CurriculumGap {
  lessonId: string;
  lessonTitle: string;
  gapType: "concept" | "example" | "practice" | "explanation" | "progression" | "coverage";
  detail: string;
  regenComponent?: string;
}

export interface GapAnalysisResult {
  gaps: CurriculumGap[];
  score: number;
  regenTargets: Array<{ lessonId: string; components: string[] }>;
}

export function analyzeCurriculumGaps(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): GapAnalysisResult {
  const gaps: CurriculumGap[] = [];
  const regenMap = new Map<string, Set<string>>();

  let prevTitle = "";
  for (const mod of blueprint.modules) {
    for (const lesson of mod.lessons) {
      if (!isSubstantiveText(lesson.theory, 150)) {
        gaps.push({ lessonId: lesson.id, lessonTitle: lesson.title, gapType: "explanation", detail: "Thin theory", regenComponent: "theory" });
        addRegen(regenMap, lesson.id, "theory");
      }
      if (!isSubstantiveText(lesson.examples, 40)) {
        gaps.push({ lessonId: lesson.id, lessonTitle: lesson.title, gapType: "example", detail: "Missing examples", regenComponent: "theory" });
        addRegen(regenMap, lesson.id, "theory");
      }
      if (hasLearningComponent(interview, "Quiz") && (lesson.quizQuestions?.length ?? 0) < 5) {
        gaps.push({ lessonId: lesson.id, lessonTitle: lesson.title, gapType: "practice", detail: "Insufficient quiz", regenComponent: "quiz" });
        addRegen(regenMap, lesson.id, "quiz");
      }
      if (hasLearningComponent(interview, "Coding") && !lesson.codingLab && !lesson.codeExample) {
        gaps.push({ lessonId: lesson.id, lessonTitle: lesson.title, gapType: "practice", detail: "Missing coding practice", regenComponent: "lab" });
        addRegen(regenMap, lesson.id, "lab");
      }
      if (prevTitle && lesson.title.toLowerCase().includes(prevTitle.toLowerCase().slice(0, 8)) === false && !lesson.introduction) {
        gaps.push({ lessonId: lesson.id, lessonTitle: lesson.title, gapType: "progression", detail: `Weak bridge from ${prevTitle}`, regenComponent: "theory" });
      }
      if ((lesson.objectives?.length ?? 0) < 2) {
        gaps.push({ lessonId: lesson.id, lessonTitle: lesson.title, gapType: "concept", detail: "Incomplete objectives", regenComponent: "objectives" });
        addRegen(regenMap, lesson.id, "objectives");
      }
      prevTitle = lesson.title;
    }
  }

  const lessonCount = blueprint.modules.reduce((n, m) => n + m.lessons.length, 0);
  const score = Math.max(0, 100 - Math.round((gaps.length / Math.max(1, lessonCount)) * 15));

  return {
    gaps: gaps.slice(0, 30),
    score,
    regenTargets: [...regenMap.entries()].map(([lessonId, components]) => ({
      lessonId,
      components: [...components],
    })),
  };
}

function addRegen(map: Map<string, Set<string>>, lessonId: string, component: string): void {
  if (!map.has(lessonId)) map.set(lessonId, new Set());
  map.get(lessonId)!.add(component);
}
