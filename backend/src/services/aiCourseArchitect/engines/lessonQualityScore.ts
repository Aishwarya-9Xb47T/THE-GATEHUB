/**
 * V6 Part 3 — Multi-dimensional lesson quality scoring.
 */
import type { ArchitectLessonBlueprint, AICourseArchitectInterview } from "../types.js";
import { isSubstantiveText } from "../pipeline/placeholderGuards.js";
import { hasLearningComponent } from "../types.js";

export interface LessonQualityDimensions {
  accuracy: number;
  educationalValue: number;
  readability: number;
  professionalism: number;
  completeness: number;
  codeQuality: number;
  researchQuality: number;
  quizQuality: number;
  projectQuality: number;
  visualQuality: number;
  accessibility: number;
  consistency: number;
  videoQuality: number;
  referenceQuality: number;
  overall: number;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function computeLessonQualityDimensions(
  lesson: ArchitectLessonBlueprint,
  interview: AICourseArchitectInterview
): LessonQualityDimensions {
  const theoryWords = (lesson.theory ?? "").split(/\s+/).filter(Boolean).length;
  const readability = clamp(theoryWords >= 280 && theoryWords < 1400 ? 90 : theoryWords >= 180 ? 80 : 60);
  const scaffoldLayers = ["## foundation", "## structure", "## application", "## depth"].filter((h) =>
    (lesson.theory ?? "").toLowerCase().includes(h)
  ).length;
  const educationalValue = clamp(
    (lesson.objectives?.length ?? 0) * 10 +
    (lesson.keyTakeaways?.length ?? 0) * 8 +
    scaffoldLayers * 12 +
    (isSubstantiveText(lesson.summary ?? "", 50) ? 10 : 0)
  );
  const completeness = clamp(
    (isSubstantiveText(lesson.introduction, 50) ? 15 : 0) +
      (isSubstantiveText(lesson.theory, 200) ? 25 : 0) +
      (isSubstantiveText(lesson.summary, 45) ? 15 : 0) +
      ((lesson.objectives?.length ?? 0) >= 3 ? 20 : 10) +
      (lesson.examples ? 15 : 0)
  );
  const codeQuality = lesson.codeValidation?.passed
    ? 95
    : lesson.codeExample
      ? 60
      : hasLearningComponent(interview, "Coding")
        ? 40
        : 80;
  const quizQuality = clamp((lesson.quizQuestions?.length ?? 0) >= 8 ? 88 : (lesson.quizQuestions?.length ?? 0) * 9);
  const referencesCount = (lesson.lessonReferences?.length ?? 0) + (lesson.references?.length ?? 0) + (lesson.furtherReading?.length ?? 0);
  const researchRequired = hasLearningComponent(interview, "Research") || hasLearningComponent(interview, "References");
  const researchQuality = clamp(
    researchRequired ? Math.max(40, referencesCount * 12) : Math.max(82, referencesCount * 10)
  );
  const visualQuality = clamp((lesson.diagrams?.length ?? 0) * 15 + (lesson.visualContent?.length ?? 0) * 10);
  const videosRequired = interview.videoStrategy?.includeVideos === true;
  const videoQuality = clamp(videosRequired ? Math.max(45, (lesson.videos?.length ?? 0) * 18) : 92);
  const referenceQuality = clamp(Math.max(researchRequired ? 55 : 82, referencesCount * 12));
  const projectRequired = hasLearningComponent(interview, "Project") || hasLearningComponent(interview, "Assignment");
  const hasHandsOnProject =
    Boolean(lesson.assignment || lesson.miniProject) ||
    Boolean(lesson.codingLab?.problemStatement && (lesson.codingLab.starterCode?.length ?? 0) >= 80);
  const projectQuality = projectRequired ? (hasHandsOnProject ? 90 : 70) : 92;
  const accessibility = lesson.diagrams?.length ? (lesson.diagrams.every((d) => d.caption) ? 88 : 72) : 90;
  const consistency = /\bTODO\b|placeholder/i.test(lesson.theory ?? "") ? 40 : 88;
  const professionalism = completeness >= 70 && consistency >= 80 ? 90 : 72;
  const accuracy = lesson.codeValidation?.passed === false ? 60 : isSubstantiveText(lesson.theory ?? "", 220) ? 95 : 86;

  const dims = {
    accuracy,
    educationalValue,
    readability,
    professionalism,
    completeness,
    codeQuality,
    researchQuality,
    quizQuality,
    projectQuality,
    visualQuality,
    accessibility,
    consistency,
    videoQuality,
    referenceQuality,
  };

  const overall = clamp(Object.values(dims).reduce((a, b) => a + b, 0) / Object.keys(dims).length);
  return { ...dims, overall };
}
