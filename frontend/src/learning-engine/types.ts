/** Mirror of backend learningExperienceSchema — learner journey model */

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

export interface WorkspaceRoute {
  type: "project" | "coding-lab" | "notebook" | "research";
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

export interface LearnerExperiencePackage {
  version: string;
  generatedAt: string;
  universeId: string;
  publishVersionId?: string;
  universe: {
    id: string;
    title: string;
    description: string;
    thumbnail?: string;
    difficulty?: string;
    estimatedHours?: number;
  };
  outline: {
    tracks: Array<{
      id: string;
      title: string;
      modules: Array<{
        id: string;
        title: string;
        lessons: Array<{ id: string; title: string; stepCount: number }>;
      }>;
    }>;
  };
  lessons: Record<string, LearnerLessonExperience>;
  downloadCenter: DownloadCenterItem[];
  completionRules: {
    minimumProgressPercent: number;
    requireAllRequiredSteps: boolean;
    certificateEligible: boolean;
  };
}
