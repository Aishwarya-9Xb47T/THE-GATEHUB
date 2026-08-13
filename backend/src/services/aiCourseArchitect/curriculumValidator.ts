/**
 * Phase 5 — Curriculum structure validation before instructor approval.
 * Instructor-requested module/lesson counts are HARD constraints.
 */
import type {
  AICourseArchitectInterview,
  ArchitectBlueprint,
  ArchitectQualityReport,
} from "./types.js";
import { computeScalePlan } from "./curriculumPlanner.js";

export function validateCurriculumBlueprint(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): ArchitectQualityReport {
  const plan = blueprint.curriculumPlan ?? computeScalePlan(interview);
  const checks: ArchitectQualityReport["checks"] = [];
  const suggestions: string[] = [];

  const lessonCount = blueprint.modules.reduce((n, m) => n + m.lessons.length, 0);
  const moduleCount = blueprint.modules.length;
  const distribution = blueprint.modules.map((m) => m.lessons.length);
  const expectedDist = plan.lessonDistribution ?? [];

  const lessonsMatch = lessonCount === plan.targetLessons;
  const modulesMatch = moduleCount === plan.moduleCount;
  const distributionMatch =
    expectedDist.length === distribution.length &&
    expectedDist.every((n, i) => n === distribution[i]);

  checks.push({
    id: "lesson-count",
    label: "Lesson count matches requested structure",
    status: lessonsMatch ? "pass" : "fail",
    detail: lessonsMatch
      ? `${lessonCount} lessons (target ${plan.targetLessons})`
      : `Curriculum does not match your requested structure. Requested: ${plan.targetLessons} lessons / ${plan.moduleCount} modules. Generated: ${lessonCount} lessons / ${moduleCount} modules.`,
  });

  checks.push({
    id: "module-structure",
    label: "Module count matches requested structure",
    status: modulesMatch ? "pass" : "fail",
    detail: modulesMatch
      ? `${moduleCount} modules · distribution ${distribution.join(" · ")}`
      : `Requested ${plan.moduleCount} modules, generated ${moduleCount}.`,
  });

  checks.push({
    id: "lesson-distribution",
    label: "Lesson distribution across modules",
    status: distributionMatch || (lessonsMatch && modulesMatch) ? "pass" : "fail",
    detail:
      plan.structureNote ||
      `${lessonCount} lessons distributed across ${moduleCount} modules (${distribution.join(" · ")}).`,
  });

  const emptyTitles = blueprint.modules.flatMap((m) => m.lessons.filter((l) => !l.title?.trim()));
  checks.push({
    id: "lesson-titles",
    label: "All lessons have titles",
    status: emptyTitles.length === 0 ? "pass" : "fail",
    detail: emptyTitles.length ? `${emptyTitles.length} lessons missing titles` : "All lessons titled",
  });

  const dupTitles = findDuplicateTitles(blueprint);
  checks.push({
    id: "no-duplicates",
    label: "No duplicate lesson topics",
    status: dupTitles.length === 0 ? "pass" : "warn",
    detail: dupTitles.length ? `Possible duplicates: ${dupTitles.slice(0, 3).join(", ")}` : "No duplicate titles detected",
  });

  checks.push({
    id: "prerequisites",
    label: "Prerequisite chain defined",
    status: blueprint.prerequisites?.length || blueprint.prerequisiteGraph ? "pass" : "warn",
    detail: blueprint.prerequisiteGraph || blueprint.prerequisites?.join(" → ") || "Add prerequisites",
  });

  checks.push({
    id: "learning-outcomes",
    label: "Learning outcomes defined",
    status: (blueprint.learningOutcomes?.length ?? 0) >= 3 ? "pass" : "warn",
    detail: `${blueprint.learningOutcomes?.length ?? 0} outcomes`,
  });

  checks.push({
    id: "research",
    label: "Research phase completed",
    status: blueprint.researchReport?.researchedAt ? "pass" : "warn",
    detail: blueprint.researchReport
      ? `Research from ${blueprint.researchReport.researchSources.length} source types`
      : "Research report missing",
  });

  checks.push({
    id: "assessment-plan",
    label: "Assessment strategy aligned",
    status: blueprint.assessmentPlan?.length ? "pass" : "warn",
    detail: blueprint.assessmentPlan || "Define assessment plan",
  });

  const hasCapstone = !!blueprint.capstone;
  if (plan.capstone) {
    checks.push({
      id: "capstone",
      label: "Capstone project included",
      status: hasCapstone ? "pass" : "warn",
      detail: hasCapstone ? blueprint.capstone!.title : "Capstone requested but not in blueprint",
    });
  }

  if (plan.finalExam) {
    checks.push({
      id: "final-exam",
      label: "Final examination included",
      status: blueprint.finalExam ? "pass" : "warn",
      detail: blueprint.finalExam?.title ?? "Final exam requested but not planned",
    });
  }

  if (blueprint.academicBlueprint) {
    const ab = blueprint.academicBlueprint;
    const abLessonsOk = ab.lessonCount === lessonCount;
    const abModulesOk = ab.moduleStructure.length === moduleCount;
    checks.push({
      id: "academic-blueprint-counts",
      label: "Academic blueprint matches outline",
      status: abLessonsOk && abModulesOk ? "pass" : "fail",
      detail: abLessonsOk && abModulesOk
        ? `${ab.lessonCount} lessons · ${ab.moduleStructure.length} modules · Bloom's mapped`
        : `Academic blueprint counts (${ab.lessonCount} lessons / ${ab.moduleStructure.length} modules) diverge from outline.`,
    });
    checks.push({
      id: "blooms-taxonomy",
      label: "Bloom's taxonomy mapping",
      status: ab.bloomsTaxonomyMapping.length >= 4 ? "pass" : "warn",
      detail: `${ab.bloomsTaxonomyMapping.length} cognitive levels mapped`,
    });
    checks.push({
      id: "assessment-inventory",
      label: "Assessment inventory",
      status: ab.assessmentInventory.length > 0 ? "pass" : "warn",
      detail: ab.assessmentInventory.map((a) => `${a.type}: ${a.count}`).join(", ") || "No assessments inventoried",
    });
  }

  const tiers = blueprint.modules.flatMap((m) => m.lessons.map((l) => l.difficultyTier));
  const hasProgression =
    tiers.filter((t) => t === "beginner").length > 0 && tiers.filter((t) => t === "advanced").length > 0;
  if (lessonCount >= 10) {
    checks.push({
      id: "difficulty-progression",
      label: "Difficulty progression",
      status: hasProgression || blueprint.difficultyProgression ? "pass" : "warn",
      detail: blueprint.difficultyProgression || "Consider beginner → advanced spread",
    });
  }

  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const score = Math.max(0, 100 - failCount * 25 - warnCount * 8);

  if (!lessonsMatch || !modulesMatch) {
    suggestions.push(
      `Curriculum does not match your requested structure. Requested: ${plan.targetLessons} lessons / ${plan.moduleCount} modules. Generated: ${lessonCount} lessons / ${moduleCount} modules. Regenerate the blueprint.`,
    );
  }
  if (plan.structureNote) suggestions.push(plan.structureNote);
  if (warnCount > 0) suggestions.push("Review warnings before approving — structure can still be edited.");
  if (!blueprint.researchReport) suggestions.push("Run research phase before final approval.");

  return {
    score,
    passed: failCount === 0 && score >= 60,
    checks,
    suggestions,
  };
}

function findDuplicateTitles(blueprint: ArchitectBlueprint): string[] {
  const seen = new Map<string, number>();
  for (const mod of blueprint.modules) {
    for (const lesson of mod.lessons) {
      const key = lesson.title.toLowerCase().replace(/\s+/g, " ").trim();
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([t]) => t);
}
