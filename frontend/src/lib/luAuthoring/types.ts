export type LuNodeStatus = "complete" | "draft" | "error" | "empty";

export type LuNodeKind =
  | "universe"
  | "track"
  | "module"
  | "lesson"
  | "overview"
  | "objectives"
  | "topics"
  | "examples"
  | "practice"
  | "coding-lab"
  | "notebook"
  | "resources"
  | "quiz"
  | "project"
  | "research-paper"
  | "assignment"
  | "discussion"
  | "checkpoint"
  | "reflection"
  | "references"
  | "question"
  | "resource-item"
  | "assessment"
  | "video";

export interface LuValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  file?: string;
  line?: number;
  suggestedFix?: string;
}

export interface LuExplorerNode {
  id: string;
  kind: LuNodeKind;
  title: string;
  trackId?: string;
  moduleId?: string;
  lessonId?: string;
  componentId?: string;
  filePath?: string;
  config?: Record<string, unknown>;
  status: LuNodeStatus;
  issues: LuValidationIssue[];
  children?: LuExplorerNode[];
}

export interface LuAuthoringProgress {
  tracks: number;
  modules: number;
  lessons: number;
  quizzes: number;
  projects: number;
  resources: number;
  estimatedHours: number;
  completionPercent: number;
  completeNodes: number;
  totalNodes: number;
}

export interface LuProjectHealth {
  score: number;
  issues: LuValidationIssue[];
  readyToPublish: boolean;
}

export interface LuAuthoringState {
  isV2: boolean;
  project: {
    metadata: { title: string; updatedAt: string };
    universe: { title?: string; estimatedHours?: number };
    publish: { lastPublishedAt?: string };
  } | null;
  explorer: LuExplorerNode[];
  progress: LuAuthoringProgress;
  health: LuProjectHealth;
  publishStatus: "draft" | "ready" | "issues";
  version: string;
  canUndo?: boolean;
  canRedo?: boolean;
}

export type LuLessonComponentKind =
  | "overview"
  | "objectives"
  | "topics"
  | "examples"
  | "practice"
  | "coding-lab"
  | "notebook"
  | "resources"
  | "quiz"
  | "assignment"
  | "discussion"
  | "project"
  | "research-paper"
  | "checkpoint"
  | "reflection"
  | "references"
  | "video";

export type StructureAction =
  | { action: "createTrack"; title: string; description?: string }
  | { action: "createModule"; trackId: string; title: string; description?: string }
  | { action: "createLesson"; trackId: string; moduleId: string; title: string }
  | { action: "duplicateModule"; trackId: string; moduleId: string }
  | { action: "deleteModule"; trackId: string; moduleId: string }
  | { action: "renameModule"; trackId: string; moduleId: string; title: string }
  | { action: "duplicateLesson"; trackId: string; moduleId: string; lessonId: string }
  | { action: "deleteLesson"; trackId: string; moduleId: string; lessonId: string }
  | { action: "renameLesson"; trackId: string; moduleId: string; lessonId: string; title: string }
  | { action: "moveLesson"; trackId: string; moduleId: string; lessonId: string; direction: "up" | "down" }
  | { action: "renameTrack"; trackId: string; title: string }
  | { action: "deleteTrack"; trackId: string }
  | { action: "duplicateTrack"; trackId: string }
  | { action: "moveTrack"; trackId: string; direction: "up" | "down" }
  | { action: "moveModule"; trackId: string; moduleId: string; direction: "up" | "down" }
  | { action: "appendLessonBlock"; trackId: string; moduleId: string; lessonId: string; block: LuLessonComponentKind }
  | { action: "removeLessonComponent"; trackId: string; moduleId: string; lessonId: string; componentId: string }
  | { action: "renameComponent"; trackId: string; moduleId: string; lessonId: string; componentId: string; title: string }
  | { action: "updateComponentConfig"; trackId: string; moduleId: string; lessonId: string; componentId: string; config: Record<string, unknown> }
  | { action: "moveComponent"; trackId: string; moduleId: string; lessonId: string; componentId: string; direction: "up" | "down" }
  | { action: "duplicateComponent"; trackId: string; moduleId: string; lessonId: string; componentId: string }
  | { action: "appendQuizQuestion"; trackId: string; moduleId: string; lessonId: string; quizComponentId: string; title?: string; questionType?: string }
  | { action: "addQuizQuestion"; trackId: string; moduleId: string; lessonId: string; quizId: string; title?: string; questionType?: string }
  | { action: "moveQuizQuestion"; trackId: string; moduleId: string; lessonId: string; quizId: string; questionId: string; direction: "up" | "down" }
  | { action: "duplicateQuizQuestion"; trackId: string; moduleId: string; lessonId: string; quizId: string; questionId: string }
  | { action: "reorderQuizQuestions"; trackId: string; moduleId: string; lessonId: string; quizId: string; orderedQuestionIds: string[] }
  | { action: "addResourceItem"; trackId: string; moduleId: string; lessonId: string; resourcesComponentId?: string; resourceType: string; title?: string }
  | { action: "importTrack"; texContent: string };

export interface StructureMutationResponse {
  state: LuAuthoringState;
  createdFilePath?: string;
  createdComponentId?: string;
}
