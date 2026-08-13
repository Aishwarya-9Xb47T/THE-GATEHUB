import type { LiveSessionSettings, LiveSessionType, QuizRoomPreview, QuizRoomSourceType } from "@/lib/liveSession/types";
export type { LiveSessionSettings, LiveSessionType, QuizRoomPreview, QuizRoomSourceType };

export const WIZARD_STEPS = [
  "Welcome",
  "Choose Course",
  "Curriculum",
  "Question Source",
  "Room Settings",
  "Preview",
  "Launch",
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number];

export interface InstructorCourseCard {
  id: string;
  title: string;
  thumbnail?: string | null;
  status?: string;
  productType?: string;
  _count?: { enrollments: number; sections: number };
}

export interface CurriculumLecture {
  id: string;
  title: string;
  type: string;
  quizId?: string | null;
}

export interface CurriculumSection {
  id: string;
  title: string;
  lectures: CurriculumLecture[];
}

export interface WizardState {
  step: number;
  courseId: string;
  courseTitle: string;
  lectureId: string;
  lectureTitle: string;
  quizId: string;
  sourceType: QuizRoomSourceType;
  title: string;
  sessionType: LiveSessionType;
  settings: LiveSessionSettings & WizardExtraSettings;
  scheduledAt: string;
  preview: QuizRoomPreview | null;
}

export interface WizardExtraSettings {
  countdownEnabled?: boolean;
  browserLock?: boolean;
  tabDetection?: boolean;
  cameraRequired?: boolean;
  fullscreenLock?: boolean;
  lives?: number;
  powerupsEnabled?: boolean;
  musicEnabled?: boolean;
  confettiEnabled?: boolean;
  animationsEnabled?: boolean;
  aiGenerateExtra?: boolean;
  aiHint?: boolean;
  aiExplanation?: boolean;
  adaptiveDifficulty?: boolean;
  autoRemediation?: boolean;
  xpEnabled?: boolean;
  coinsEnabled?: boolean;
  achievementsEnabled?: boolean;
}

export const INITIAL_WIZARD_STATE: Omit<WizardState, "preview"> & { preview: null } = {
  step: 0,
  courseId: "",
  courseTitle: "",
  lectureId: "",
  lectureTitle: "",
  quizId: "",
  sourceType: "existing_quiz",
  title: "",
  sessionType: "live_classroom",
  settings: {} as WizardState["settings"],
  scheduledAt: "",
  preview: null,
};

export interface QuestionSourceOption {
  id: QuizRoomSourceType | string;
  label: string;
  description: string;
  enabled: boolean;
  badge?: string;
}
