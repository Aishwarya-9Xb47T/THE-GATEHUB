/**
 * V6 Part 4 — Bloom's Taxonomy mapping engine.
 */
import type { ArchitectLessonBlueprint } from "../types.js";
import type { LessonBlueprintPlan } from "../orchestrator/contracts.js";

export const BLOOM_LEVELS = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"] as const;
export type BloomLevel = (typeof BLOOM_LEVELS)[number];

export interface BloomActivityMapping {
  activity: string;
  bloomLevel: BloomLevel;
  component: string;
}

export function mapLessonBloomActivities(
  lesson: ArchitectLessonBlueprint,
  plan: LessonBlueprintPlan
): BloomActivityMapping[] {
  const mappings: BloomActivityMapping[] = [
    { activity: "Read theory and key concepts", bloomLevel: "Understand", component: "theory" },
    { activity: "Review learning objectives", bloomLevel: "Remember", component: "objectives" },
  ];

  if (lesson.examples) mappings.push({ activity: "Study examples", bloomLevel: "Understand", component: "examples" });
  if (lesson.codeExample || lesson.codingLab) {
    mappings.push({ activity: "Write and run code", bloomLevel: "Apply", component: "codingLab" });
  }
  if (lesson.caseStudy) mappings.push({ activity: "Analyze case study", bloomLevel: "Analyze", component: "caseStudy" });
  if (lesson.quizQuestions?.length) {
    mappings.push({ activity: "Answer quiz questions", bloomLevel: "Evaluate", component: "quiz" });
  }
  if (lesson.assignment) mappings.push({ activity: "Complete assignment", bloomLevel: "Apply", component: "assignment" });
  if (lesson.miniProject || lesson.assignment) {
    mappings.push({ activity: "Build project deliverable", bloomLevel: "Create", component: "project" });
  }
  if (lesson.discussionPrompt) {
    mappings.push({ activity: "Reflect on concepts", bloomLevel: "Evaluate", component: "reflection" });
  }

  for (const level of plan.bloomsLevels ?? []) {
    const normalized = level as BloomLevel;
    if (BLOOM_LEVELS.includes(normalized) && !mappings.some((m) => m.bloomLevel === normalized)) {
      mappings.push({ activity: `Practice at ${level} level`, bloomLevel: normalized, component: "practice" });
    }
  }

  return mappings;
}

export function formatBloomMappingForPrompt(mappings: BloomActivityMapping[]): string {
  const grouped = BLOOM_LEVELS.map((level) => {
    const acts = mappings.filter((m) => m.bloomLevel === level);
    return acts.length ? `${level}: ${acts.map((a) => a.activity).join("; ")}` : null;
  }).filter(Boolean);

  return `BLOOM'S TAXONOMY (each activity must target a level):\n${grouped.join("\n")}`;
}

export function bloomsCoverageScore(mappings: BloomActivityMapping[]): number {
  const covered = new Set(mappings.map((m) => m.bloomLevel));
  return Math.round((covered.size / BLOOM_LEVELS.length) * 100);
}
