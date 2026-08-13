/**
 * V6 Part 3 — Virtual student simulation before publish.
 */
import type { ArchitectBlueprint, AICourseArchitectInterview } from "../types.js";
import type { StudentSimulationOutput } from "../orchestrator/contracts.js";
import { hasLearningComponent } from "../types.js";
import { isSubstantiveText } from "../pipeline/placeholderGuards.js";
import { isLikelyFakeUrl } from "../externalResearchApis.js";

export interface StudentSimulationReport extends StudentSimulationOutput {
  confusingLessons: string[];
  missingExplanations: string[];
  repetitionIssues: string[];
  brokenProgression: string[];
  brokenLinks: string[];
  estimatedTotalHours: number;
}

export function runVirtualStudentSimulation(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): StudentSimulationReport {
  const lessons = blueprint.modules.flatMap((m) => m.lessons);
  const frictionPoints: string[] = [];
  const confusingLessons: string[] = [];
  const missingExplanations: string[] = [];
  const repetitionIssues: string[] = [];
  const brokenProgression: string[] = [];
  const brokenLinks: string[] = [];
  let navigableLessons = 0;
  let totalSteps = 0;
  let totalMinutes = 0;
  const seenTitles = new Set<string>();

  for (let mi = 0; mi < blueprint.modules.length; mi++) {
    const mod = blueprint.modules[mi];
    for (let li = 0; li < mod.lessons.length; li++) {
      const lesson = mod.lessons[li];
      let steps = 0;

      if (isSubstantiveText(lesson.introduction, 50)) steps++;
      else missingExplanations.push(`Introduction: ${lesson.title}`);

      if ((lesson.objectives?.length ?? 0) >= 2) steps++;
      else frictionPoints.push(`Unclear objectives: ${lesson.title}`);

      if (isSubstantiveText(lesson.theory, 100)) steps++;
      else {
        frictionPoints.push(`Thin theory: ${lesson.title}`);
        confusingLessons.push(lesson.title);
      }

      if (lesson.summary?.length) steps++;
      if (lesson.codeExample) steps++;
      if (lesson.codingLab) {
        steps++;
        if (!lesson.codingLab.starterCode && !lesson.codingLab.problemStatement) {
          frictionPoints.push(`Incomplete coding lab: ${lesson.title}`);
        }
      }

      if (hasLearningComponent(interview, "Quiz")) {
        if ((lesson.quizQuestions?.length ?? 0) < 5) {
          frictionPoints.push(`Insufficient quiz: ${lesson.title}`);
        } else {
          steps++;
        }
      }

      for (const v of lesson.videos ?? []) {
        if (isLikelyFakeUrl(v.url)) brokenLinks.push(`video:${lesson.title}`);
        else steps++;
      }
      for (const r of lesson.lessonReferences ?? []) {
        if (r.url && isLikelyFakeUrl(r.url)) brokenLinks.push(`ref:${lesson.title}`);
      }

      const titleKey = lesson.title.toLowerCase();
      if (seenTitles.has(titleKey)) repetitionIssues.push(lesson.title);
      seenTitles.add(titleKey);

      if (li > 0 && !mod.lessons[li - 1].summary && !lesson.introduction) {
        brokenProgression.push(`${mod.lessons[li - 1].title} → ${lesson.title}`);
      }

      if (steps >= 4) navigableLessons++;
      totalSteps += steps;
      totalMinutes += lesson.durationMinutes || 25;
    }
  }

  const lessonCount = lessons.length;
  const completionLikelihood = lessonCount ? navigableLessons / lessonCount : 0;
  const avgSteps = lessonCount ? totalSteps / lessonCount : 0;
  const passed =
    completionLikelihood >= 0.85 &&
    frictionPoints.length <= Math.max(2, lessonCount * 0.12) &&
    brokenLinks.length === 0;
  const score = Math.round(
    completionLikelihood * 50 + Math.min(25, avgSteps * 4) + (brokenLinks.length ? 0 : 15) + (repetitionIssues.length ? 0 : 10)
  );

  return {
    passed,
    score,
    lessonCount,
    navigableLessons,
    avgStepsPerLesson: Math.round(avgSteps * 10) / 10,
    completionLikelihood: Math.round(completionLikelihood * 100),
    frictionPoints: frictionPoints.slice(0, 20),
    learnerWouldComplete: passed,
    confusingLessons: confusingLessons.slice(0, 10),
    missingExplanations: missingExplanations.slice(0, 10),
    repetitionIssues: repetitionIssues.slice(0, 5),
    brokenProgression: brokenProgression.slice(0, 5),
    brokenLinks: brokenLinks.slice(0, 10),
    estimatedTotalHours: Math.round((totalMinutes / 60) * 10) / 10,
  };
}
