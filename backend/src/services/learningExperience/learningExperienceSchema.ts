/**
 * Learning Experience Engine — canonical learner-facing model.
 * Transforms authored content into complete learning journeys (not editor blocks).
 */

export type LearnerExperienceKind =
  | "hero"
  | "overview"
  | "objectives"
  | "theory"
  | "image"
  | "video"
  | "interactive-demo"
  | "code-example"
  | "practice"
  | "coding-lab"
  | "notebook"
  | "project"
  | "research"
  | "quiz"
  | "assignment"
  | "discussion"
  | "downloads"
  | "reflection"
  | "summary"
  | "next-lesson";

export type ProgressEventKind = "view" | "complete" | "submit" | "score" | "participate";

export interface ProgressRule {
  event: ProgressEventKind;
  weight: number;
  requiredForCompletion: boolean;
}

export type WorkspaceType = "project" | "coding-lab" | "notebook" | "research";

export interface WorkspaceRoute {
  type: WorkspaceType;
  path: string;
  stepId: string;
}

export interface LearnerExperienceStep {
  id: string;
  kind: LearnerExperienceKind;
  title: string;
  payload: Record<string, unknown>;
  progressRule: ProgressRule;
  workspace?: WorkspaceRoute;
}

export interface LearnerLessonExperience {
  id: string;
  title: string;
  description?: string;
  estimatedMinutes?: number;
  moduleTitle?: string;
  trackTitle?: string;
  steps: LearnerExperienceStep[];
  navigation: {
    prevLessonId?: string;
    nextLessonId?: string;
    prevLessonTitle?: string;
    nextLessonTitle?: string;
  };
}

export interface DownloadCenterItem {
  id: string;
  title: string;
  type: string;
  url: string;
  lessonId: string;
  lessonTitle: string;
  downloadable: boolean;
}

export interface CompletionRules {
  minimumProgressPercent: number;
  requireAllRequiredSteps: boolean;
  certificateEligible: boolean;
}

export interface LearnerCourseOutline {
  tracks: Array<{
    id: string;
    title: string;
    modules: Array<{
      id: string;
      title: string;
      lessons: Array<{ id: string; title: string; stepCount: number }>;
    }>;
  }>;
}

export interface LearnerExperiencePackage {
  version: string;
  generatedAt: string;
  universeId: string;
  publishVersionId?: string;
  universe: {
    title: string;
    description: string;
    thumbnail?: string;
    difficulty?: string;
    estimatedHours?: number;
  };
  outline: LearnerCourseOutline;
  lessons: Record<string, LearnerLessonExperience>;
  downloadCenter: DownloadCenterItem[];
  completionRules: CompletionRules;
}

export const LEARNING_EXPERIENCE_ENGINE_VERSION = "1.5.1";
