/**
 * V6 Part 3 — Self-healing: regenerate only failed components until quality threshold.
 */
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import type { ArchitectBlueprint, ArchitectLessonBlueprint, AICourseArchitectInterview } from "../types.js";
import { reviewLessonContent } from "../pipeline/qualityReviewer.js";
import { detectFailedComponents, regenerateFailedComponents, type FailedComponent } from "../orchestrator/componentRegenerator.js";
import { computeLessonQualityDimensions } from "./lessonQualityScore.js";
import { SELF_HEALING_THRESHOLD, MAX_COMPONENT_RETRIES } from "../architectPerformance.js";

export interface SelfHealingResult {
  blueprint: ArchitectBlueprint;
  lessonsHealed: number;
  componentsRegenerated: number;
  finalScore: number;
  ready: boolean;
}

function buildMinimalPlan(lesson: ArchitectLessonBlueprint): LessonBlueprintPlan {
  return {
    lessonObjective: lesson.objectives?.[0] ?? lesson.title,
    industryContext: "",
    estimatedReadingMinutes: lesson.durationMinutes ?? 25,
    estimatedPracticeMinutes: 15,
    estimatedVideoMinutes: 10,
    requiredDiagrams: Boolean(lesson.diagrams?.length),
    requiredCode: Boolean(lesson.codeExample),
    requiredTables: false,
    requiredVideo: Boolean(lesson.videos?.length),
    requiredQuiz: Boolean(lesson.quizQuestions?.length),
    requiredLab: Boolean(lesson.codingLab),
    requiredReferences: Boolean(lesson.lessonReferences?.length),
    requiredAssignment: Boolean(lesson.assignment),
    requiredInterviewPrep: Boolean(lesson.interviewQuestions?.length),
    conceptOrder: lesson.objectives ?? [],
    microLearningFlow: [],
    practiceIntervals: [],
    revisionSpacing: "",
    difficultyCurve: lesson.difficultyTier ?? "intermediate",
    knowledgeCheckpoints: lesson.objectives ?? [],
    bloomsLevels: [],
    priorKnowledge: [],
    learningGoals: lesson.objectives ?? [],
    misconceptions: [],
    strugglePoints: [],
    simplificationStrategy: "",
    useVisuals: Boolean(lesson.visualContent?.length),
    useCode: Boolean(lesson.codeExample),
    useMath: false,
    useAnalogies: true,
    useDiagrams: Boolean(lesson.diagrams?.length),
    includeLab: Boolean(lesson.codingLab),
    includeQuiz: Boolean(lesson.quizQuestions?.length),
    connectionToPrevious: "",
    connectionToNext: "",
    industryHook: "",
    sectionsToEmphasize: [],
  };
}
function findLessonsNeedingHeal(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): Array<{ modIndex: number; lessonIndex: number; score: number; failed: ReturnType<typeof detectFailedComponents> }> {
  const weak: Array<{ modIndex: number; lessonIndex: number; score: number; failed: ReturnType<typeof detectFailedComponents> }> = [];
  blueprint.modules.forEach((mod, modIndex) => {
    mod.lessons.forEach((lesson, lessonIndex) => {
      const report = reviewLessonContent(lesson, interview);
      const dims = computeLessonQualityDimensions(lesson, interview);
      const score = Math.round((report.score + dims.overall) / 2);
      if (!report.passed || score < SELF_HEALING_THRESHOLD) {
        weak.push({
          modIndex,
          lessonIndex,
          score,
          failed: detectFailedComponents(report, interview),
        });
      }
    });
  });
  return weak.sort((a, b) => a.score - b.score);
}

export async function runSelfHealingLoop(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview,
  onProgress?: (msg: string) => void
): Promise<SelfHealingResult> {
  let lessonsHealed = 0;
  let componentsRegenerated = 0;

  for (let round = 0; round <= MAX_COMPONENT_RETRIES; round++) {
    const weak = findLessonsNeedingHeal(blueprint, interview);
    if (!weak.length) break;

    for (const item of weak) {
      const mod = blueprint.modules[item.modIndex];
      const skeleton = mod.lessons[item.lessonIndex];
      const ctx: LessonPipelineContext = {
        interview,
        blueprint,
        mod,
        modIndex: item.modIndex,
        lessonIndex: item.lessonIndex,
        skeleton,
        moduleDesign: blueprint.moduleDesignerOutput?.modules.find((m) => m.moduleId === mod.id),
        coursePlan: blueprint.coursePlannerOutput,
      };

      const failed: FailedComponent[] = item.failed.length ? item.failed : ["theory"];
      onProgress?.(`Healing ${skeleton.title}: ${failed.join(", ")}`);

      const report = reviewLessonContent(skeleton, interview);
      const healed = await regenerateFailedComponents(
        ctx,
        buildMinimalPlan(skeleton),
        skeleton,
        failed,
        report.suggestions.join("; ") || "Improve failed components only"
      );
      blueprint.modules[item.modIndex].lessons[item.lessonIndex] = healed;
      lessonsHealed++;
      componentsRegenerated += failed.length;
    }
  }

  const scores = blueprint.modules.flatMap((m) =>
    m.lessons.map((l) => computeLessonQualityDimensions(l, interview).overall)
  );
  const finalScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return {
    blueprint,
    lessonsHealed,
    componentsRegenerated,
    finalScore,
    ready: finalScore >= SELF_HEALING_THRESHOLD,
  };
}
