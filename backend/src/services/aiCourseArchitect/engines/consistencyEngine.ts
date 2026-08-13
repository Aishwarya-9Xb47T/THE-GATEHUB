/**
 * V6 Part 3 — Consistency engine across course terminology and formatting.
 */
import type { ArchitectBlueprint, ArchitectLessonBlueprint } from "../types.js";
import { buildCourseMemory } from "./courseMemory.js";

export interface ConsistencyIssue {
  lessonId: string;
  lessonTitle: string;
  type: "terminology" | "formatting" | "difficulty" | "objectives" | "code-style";
  detail: string;
}

export interface ConsistencyReport {
  passed: boolean;
  issues: ConsistencyIssue[];
  score: number;
}

export function auditCourseConsistency(blueprint: ArchitectBlueprint): ConsistencyReport {
  const memory = buildCourseMemory(blueprint);
  const issues: ConsistencyIssue[] = [];
  const canonicalTerms = new Set(memory.glossaryTerms.map((t) => t.toLowerCase()));

  for (const mod of blueprint.modules) {
    for (const lesson of mod.lessons) {
      issues.push(...auditLessonConsistency(lesson, canonicalTerms, blueprint.difficulty));
    }
  }

  const score = Math.max(0, 100 - issues.length * 4);
  return { passed: issues.length <= Math.max(3, blueprint.modules.length), issues: issues.slice(0, 25), score };
}

function auditLessonConsistency(
  lesson: ArchitectLessonBlueprint,
  canonicalTerms: Set<string>,
  courseDifficulty: string
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  if ((lesson.objectives?.length ?? 0) < 2) {
    issues.push({
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      type: "objectives",
      detail: "Fewer than 2 learning objectives",
    });
  }

  if (lesson.difficultyTier && courseDifficulty && lesson.difficultyTier !== courseDifficulty) {
    const gap = Math.abs(tierIndex(lesson.difficultyTier) - tierIndex(courseDifficulty));
    if (gap > 2) {
      issues.push({
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        type: "difficulty",
        detail: `Lesson tier ${lesson.difficultyTier} diverges from course ${courseDifficulty}`,
      });
    }
  }

  for (const g of lesson.glossary ?? []) {
    if (canonicalTerms.has(g.term.toLowerCase()) && !g.definition?.trim()) {
      issues.push({
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        type: "terminology",
        detail: `Term "${g.term}" missing definition`,
      });
    }
  }

  if (lesson.theory && /\bTODO\b|lorem ipsum|placeholder/i.test(lesson.theory)) {
    issues.push({
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      type: "formatting",
      detail: "Placeholder text in theory",
    });
  }

  return issues;
}

function tierIndex(tier: string): number {
  const order = ["beginner", "intermediate", "advanced", "expert"];
  const i = order.indexOf(tier.toLowerCase());
  return i >= 0 ? i : 1;
}
