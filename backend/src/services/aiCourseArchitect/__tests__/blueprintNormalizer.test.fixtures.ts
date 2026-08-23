import type { AICourseArchitectInterview } from "../types.js";

/** Minimal interview fixture for blueprint normalizer tests (avoids full wizard payload). */
export function createDefaultInterviewLike(partial: {
  title?: string;
  subject?: string;
  learningGoals?: string[];
}): AICourseArchitectInterview {
  return {
    productType: "premium-course",
    courseInfo: {
      title: partial.title ?? "Deep Learning",
      subject: partial.subject ?? "AI",
      targetAudience: "Professionals",
      prerequisites: [],
      industry: "Technology",
      learningGoals: partial.learningGoals ?? [],
      expectedOutcomes: [],
      estimatedDuration: "20 hours",
      difficulty: "intermediate",
      certificationEligible: false,
      language: "en",
      academicLevel: "intermediate",
      courseType: "professional",
    },
    courseScale: { id: "mini" },
    difficultyDistribution: { mode: "ai-decides" },
    learningStyle: ["balanced"],
    teachingStyle: ["professional"],
    lessonStructure: ["theory", "code-example", "mini-quiz"],
    practicalComponents: ["Coding Labs"],
    assessmentStrategy: { style: "Quiz after every module", methods: ["Quizzes"] },
    curriculumStrategy: { progression: ["beginner-intermediate-advanced"], aiDecidesCurriculum: true },
    learningComponents: ["Video Lessons", "Quizzes"],
    videoStrategy: { method: "add-later", mappings: [] },
    researchDepth: "professional",
  };
}
