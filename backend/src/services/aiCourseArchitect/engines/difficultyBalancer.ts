/**
 * V6 Part 4 — Difficulty balancer (smooth progression).
 */
import type { ArchitectBlueprint, ArchitectLessonBlueprint } from "../types.js";

export interface ComplexityScores {
  concept: number;
  vocabulary: number;
  code: number;
  math: number;
  project: number;
  overall: number;
}

const TIER_BASE = { beginner: 25, intermediate: 50, advanced: 75, expert: 90 };

export function scoreLessonComplexity(lesson: ArchitectLessonBlueprint): ComplexityScores {
  const tier = lesson.difficultyTier ?? "intermediate";
  const concept = TIER_BASE[tier as keyof typeof TIER_BASE] ?? 50;
  const theoryWords = (lesson.theory ?? "").split(/\s+/).length;
  const vocabulary = Math.min(100, concept + Math.floor(theoryWords / 50));
  const code = lesson.codeExample || lesson.codingLab ? Math.min(100, concept + 15) : concept - 10;
  const math = lesson.mathematicalDerivation ? Math.min(100, concept + 20) : concept;
  const project = lesson.assignment || lesson.miniProject ? Math.min(100, concept + 25) : concept;

  const overall = Math.round((concept + vocabulary + code + math + project) / 5);
  return { concept, vocabulary, code: Math.max(0, code), math, project, overall };
}

export interface DifficultyBalanceReport {
  passed: boolean;
  score: number;
  jumps: Array<{ from: string; to: string; delta: number }>;
}

export function auditDifficultyProgression(blueprint: ArchitectBlueprint): DifficultyBalanceReport {
  const scores: Array<{ title: string; overall: number }> = [];
  for (const mod of blueprint.modules) {
    for (const lesson of mod.lessons) {
      scores.push({ title: lesson.title, overall: scoreLessonComplexity(lesson).overall });
    }
  }

  const jumps: DifficultyBalanceReport["jumps"] = [];
  for (let i = 1; i < scores.length; i++) {
    const delta = scores[i].overall - scores[i - 1].overall;
    if (delta > 25) {
      jumps.push({ from: scores[i - 1].title, to: scores[i].title, delta });
    }
  }

  const score = Math.max(0, 100 - jumps.length * 12);
  return { passed: jumps.length <= Math.max(1, scores.length * 0.1), score, jumps };
}
