/**
 * V6 Part 4 — LMS integration metadata.
 */
import type { ArchitectBlueprint, AICourseArchitectInterview } from "../types.js";

export interface LmsIntegrationMeta {
  platforms: Array<{ id: string; label: string; exportFormat: string; ready: boolean }>;
  courseIdentifier: string;
  moduleCount: number;
  lessonCount: number;
  assessmentCount: number;
}

export function buildLmsIntegrationMeta(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): LmsIntegrationMeta {
  const lessons = blueprint.modules.flatMap((m) => m.lessons);
  const quizCount = lessons.reduce((n, l) => n + (l.quizQuestions?.length ?? 0), 0);

  return {
    platforms: [
      { id: "moodle", label: "Moodle", exportFormat: "IMS Common Cartridge", ready: true },
      { id: "canvas", label: "Canvas", exportFormat: "Common Cartridge / LTI 1.3", ready: true },
      { id: "blackboard", label: "Blackboard", exportFormat: "Common Cartridge", ready: true },
      { id: "google-classroom", label: "Google Classroom", exportFormat: "LTI / SCORM", ready: true },
      { id: "teams", label: "Microsoft Teams", exportFormat: "LTI 1.3", ready: true },
      { id: "talentlms", label: "TalentLMS", exportFormat: "SCORM", ready: true },
      { id: "docebo", label: "Docebo", exportFormat: "xAPI / SCORM", ready: true },
      { id: "successfactors", label: "SAP SuccessFactors", exportFormat: "SCORM / AICC", ready: false },
    ],
    courseIdentifier: `gatehub-${String(interview.courseInfo?.subject || interview.courseInfo?.title || "course").replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()}-${Date.now()}`,
    moduleCount: blueprint.modules.length,
    lessonCount: lessons.length,
    assessmentCount: quizCount,
  };
}
