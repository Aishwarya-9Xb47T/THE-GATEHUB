/**
 * V6 Part 3 — Course length profiles (crash course → university semester).
 */
import type { CourseScaleId } from "../types.js";

export type CourseLengthProfile = "crash" | "concise" | "complete" | "extensive" | "deep" | "industry-focused";

export interface CourseLengthConfig {
  profile: CourseLengthProfile;
  theoryMultiplier: number;
  lessonsPerModule: number;
  quizDensity: number;
  projectDepth: "minimal" | "standard" | "capstone";
}

const LENGTH_BY_SCALE: Record<CourseScaleId, CourseLengthConfig> = {
  mini: { profile: "crash", theoryMultiplier: 0.7, lessonsPerModule: 4, quizDensity: 0.6, projectDepth: "minimal" },
  standard: { profile: "complete", theoryMultiplier: 1, lessonsPerModule: 6, quizDensity: 1, projectDepth: "standard" },
  bootcamp: { profile: "industry-focused", theoryMultiplier: 0.9, lessonsPerModule: 8, quizDensity: 0.85, projectDepth: "capstone" },
  university: { profile: "extensive", theoryMultiplier: 1.3, lessonsPerModule: 7, quizDensity: 1.1, projectDepth: "capstone" },
  master: { profile: "deep", theoryMultiplier: 1.5, lessonsPerModule: 8, quizDensity: 1.2, projectDepth: "capstone" },
  custom: { profile: "complete", theoryMultiplier: 1, lessonsPerModule: 6, quizDensity: 1, projectDepth: "standard" },
};

export function resolveCourseLength(scaleId?: CourseScaleId, customLessonsPerModule?: number): CourseLengthConfig {
  const cfg = LENGTH_BY_SCALE[scaleId ?? "standard"];
  if (customLessonsPerModule) {
    return { ...cfg, lessonsPerModule: customLessonsPerModule };
  }
  return cfg;
}

export function formatCourseLengthForPrompt(cfg: CourseLengthConfig): string {
  return `Course length profile: ${cfg.profile} (theory ×${cfg.theoryMultiplier}, ~${cfg.lessonsPerModule} lessons/module, project: ${cfg.projectDepth})`;
}
