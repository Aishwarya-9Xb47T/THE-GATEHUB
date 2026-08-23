/**
 * V6 Part 3 — Learning analytics metadata per lesson and course.
 */
import type { ArchitectBlueprint, ArchitectLessonBlueprint, AICourseArchitectInterview } from "../types.js";
import { hasLearningComponent } from "../types.js";

export interface LearningAnalyticsMeta {
  estimatedCompletionMinutes: number;
  difficultyScore: number;
  knowledgeCoverage: number;
  skillCoverage: number;
  assessmentCoverage: number;
  practiceCoverage: number;
  confidenceScore: number;
  careerMapping?: string[];
  certificationMapping?: string[];
}

export function computeLessonAnalytics(
  lesson: ArchitectLessonBlueprint,
  interview: AICourseArchitectInterview
): LearningAnalyticsMeta {
  const theoryWords = (lesson.theory ?? "").split(/\s+/).length;
  const readingMinutes = Math.ceil(theoryWords / 200);
  const videoMinutes = (lesson.videos?.length ?? 0) * 12;
  const labMinutes = lesson.codingLab ? 25 : 0;
  const quizMinutes = (lesson.quizQuestions?.length ?? 0) * 1.5;
  const estimatedCompletionMinutes = lesson.durationMinutes || readingMinutes + videoMinutes + labMinutes + quizMinutes;

  const knowledgeCoverage = Math.min(100, Math.round((theoryWords / 300) * 40 + (lesson.objectives?.length ?? 0) * 8));
  const skillCoverage = Math.min(
    100,
    (lesson.codingLab ? 35 : 0) + (lesson.examples ? 20 : 0) + (lesson.assignment ? 25 : 0)
  );
  const assessmentCoverage = Math.min(100, (lesson.quizQuestions?.length ?? 0) * 8);
  const practiceCoverage = Math.min(100, (lesson.codingLab ? 40 : 0) + (lesson.practice ? 30 : 0));

  const difficultyMap = { beginner: 30, intermediate: 55, advanced: 80, expert: 95 };
  const tier = lesson.difficultyTier ?? interview.courseInfo.difficulty;
  const difficultyScore = difficultyMap[tier as keyof typeof difficultyMap] ?? 50;

  const confidenceScore = Math.round(
    (knowledgeCoverage + skillCoverage + assessmentCoverage + practiceCoverage) / 4
  );

  const careerMapping = interview.courseInfo.industry
    ? [`${interview.courseInfo.industry} practitioner`, `${interview.courseInfo.subject} specialist`]
    : undefined;

  return {
    estimatedCompletionMinutes,
    difficultyScore,
    knowledgeCoverage,
    skillCoverage,
    assessmentCoverage,
    practiceCoverage,
    confidenceScore,
    careerMapping,
    certificationMapping: Array.isArray(interview.courseInfo?.learningGoals) && interview.courseInfo.learningGoals.some((g) => /certif/i.test(g))
      ? [interview.courseInfo.subject]
      : undefined,
  };
}

export function attachCourseAnalytics(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): { blueprint: ArchitectBlueprint; courseAnalytics: { avgCompletionHours: number; avgConfidence: number } } {
  let totalMinutes = 0;
  let totalConfidence = 0;
  let count = 0;

  const modules = blueprint.modules.map((mod) => ({
    ...mod,
    lessons: mod.lessons.map((lesson) => {
      const analytics = computeLessonAnalytics(lesson, interview);
      totalMinutes += analytics.estimatedCompletionMinutes;
      totalConfidence += analytics.confidenceScore;
      count++;
      return { ...lesson, learningAnalytics: analytics };
    }),
  }));

  return {
    blueprint: { ...blueprint, modules, estimatedHours: Math.ceil(totalMinutes / 60) },
    courseAnalytics: {
      avgCompletionHours: Math.round((totalMinutes / 60) * 10) / 10,
      avgConfidence: count ? Math.round(totalConfidence / count) : 0,
    },
  };
}
