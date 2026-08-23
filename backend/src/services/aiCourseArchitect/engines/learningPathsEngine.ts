/**
 * V6 Part 4 — Personalized learning paths.
 */
import type { AICourseArchitectInterview, ArchitectBlueprint } from "../types.js";

export type LearningPathId =
  | "standard"
  | "quick-revision"
  | "exam-prep"
  | "certification"
  | "industry"
  | "interview"
  | "research"
  | "hands-on-project";

export interface LearningPath {
  id: LearningPathId;
  label: string;
  description: string;
  lessonSequence: string[];
  emphasis: string[];
}

export function detectLearningPaths(interview: AICourseArchitectInterview): LearningPathId[] {
  const styles = Array.isArray(interview.learningStyle)
    ? interview.learningStyle.join(" ")
    : String(interview.learningStyle ?? "");
  const goals = Array.isArray(interview.courseInfo?.learningGoals)
    ? interview.courseInfo.learningGoals.join(" ")
    : String(interview.courseInfo?.learningGoals ?? "");
  const assessment = String(interview.assessmentStrategy ?? "");
  const text = `${styles} ${goals} ${assessment}`.toLowerCase();
  const paths: LearningPathId[] = ["standard"];

  if (/revision|review|recap|quick/i.test(text)) paths.push("quick-revision");
  if (/exam|test prep|midterm|final/i.test(text)) paths.push("exam-prep");
  if (/certif|aws|azure|comptia/i.test(text)) paths.push("certification");
  if (/industry|production|real-world|job/i.test(text)) paths.push("industry");
  if (/interview|faang|hiring/i.test(text)) paths.push("interview");
  if (/research|thesis|paper/i.test(text)) paths.push("research");
  if (/project|portfolio|hands-on|build/i.test(text)) paths.push("hands-on-project");

  return [...new Set(paths)];
}

export function buildLearningPaths(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): LearningPath[] {
  const allLessons = blueprint.modules.flatMap((m) => m.lessons.map((l) => l.id));
  const pathIds = detectLearningPaths(interview);

  return pathIds.map((id) => {
    switch (id) {
      case "quick-revision":
        return {
          id,
          label: "Quick Revision",
          description: "Summary → key concepts → quiz → revision notes",
          lessonSequence: allLessons,
          emphasis: ["summary", "revision-notes", "quiz", "flashcards"],
        };
      case "exam-prep":
        return {
          id,
          label: "Exam Preparation",
          description: "Objectives → practice → quizzes → common mistakes",
          lessonSequence: allLessons,
          emphasis: ["objectives", "quiz", "practice", "common-mistakes"],
        };
      case "certification":
        return {
          id,
          label: "Certification Track",
          description: "Theory → labs → quizzes → certification mapping",
          lessonSequence: allLessons,
          emphasis: ["theory", "quiz", "coding-lab", "cheat-sheet"],
        };
      case "industry":
        return {
          id,
          label: "Industry Track",
          description: "Case studies → projects → industry context",
          lessonSequence: allLessons,
          emphasis: ["case-study", "project", "industry-notes", "assignment"],
        };
      case "interview":
        return {
          id,
          label: "Interview Track",
          description: "Concepts → coding → interview questions",
          lessonSequence: allLessons,
          emphasis: ["theory", "coding-lab", "interview-questions", "quiz"],
        };
      case "research":
        return {
          id,
          label: "Research Track",
          description: "Papers → theory → projects",
          lessonSequence: allLessons,
          emphasis: ["research-papers", "theory", "project", "references"],
        };
      case "hands-on-project":
        return {
          id,
          label: "Hands-on Project Track",
          description: "Examples → labs → assignments → capstone",
          lessonSequence: allLessons,
          emphasis: ["examples", "coding-lab", "assignment", "mini-project"],
        };
      default:
        return {
          id: "standard",
          label: "Standard Path",
          description: "Full pedagogical sequence",
          lessonSequence: allLessons,
          emphasis: ["introduction", "theory", "examples", "quiz", "summary"],
        };
    }
  });
}
