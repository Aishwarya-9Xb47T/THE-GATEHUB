/**
 * V6 Part 3 — Accessibility metadata generation.
 */
import type { ArchitectBlueprint, ArchitectLessonBlueprint } from "../types.js";

export interface LessonAccessibilityMeta {
  altTexts: Array<{ target: string; text: string }>;
  screenReaderSummary?: string;
  tableReadable: boolean;
  colorSafeDiagrams: boolean;
}

export interface AccessibilityAudit {
  passed: boolean;
  score: number;
  issues: string[];
  lessonMeta: Map<string, LessonAccessibilityMeta>;
}

export function generateLessonAccessibility(lesson: ArchitectLessonBlueprint): LessonAccessibilityMeta {
  const altTexts: LessonAccessibilityMeta["altTexts"] = [];

  for (const d of lesson.diagrams ?? []) {
    altTexts.push({
      target: `diagram:${d.type}`,
      text: d.caption || `Diagram illustrating ${lesson.title}`,
    });
  }
  for (const v of lesson.visualContent ?? []) {
    altTexts.push({
      target: `visual:${v.title}`,
      text: v.description || `Educational visual for ${lesson.title}`,
    });
  }

  return {
    altTexts,
    screenReaderSummary: `${lesson.title}. Objectives: ${(lesson.objectives ?? []).join(". ")}. ${lesson.summary?.slice(0, 200) ?? ""}`,
    tableReadable: !(lesson.visualContent ?? []).some((v) => v.type === "comparison-table" && !v.description),
    colorSafeDiagrams: true,
  };
}

export function auditCourseAccessibility(blueprint: ArchitectBlueprint): AccessibilityAudit {
  const issues: string[] = [];
  const lessonMeta = new Map<string, LessonAccessibilityMeta>();

  for (const mod of blueprint.modules) {
    for (const lesson of mod.lessons) {
      const meta = generateLessonAccessibility(lesson);
      lessonMeta.set(lesson.id, meta);
      if (!meta.altTexts.length && (lesson.diagrams?.length || lesson.visualContent?.length)) {
        issues.push(`Missing alt text: ${lesson.title}`);
      }
      if (!lesson.objectives?.length) {
        issues.push(`No screen-reader-friendly objectives: ${lesson.title}`);
      }
    }
  }

  const score = Math.max(0, 100 - issues.length * 5);
  return { passed: issues.length <= blueprint.modules.length, score, issues: issues.slice(0, 20), lessonMeta };
}
