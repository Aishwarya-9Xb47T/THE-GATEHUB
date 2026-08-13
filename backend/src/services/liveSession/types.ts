export const LIVE_SESSION_TYPES = [
  "practice",
  "homework",
  "live_classroom",
  "timed_exam",
  "adaptive",
  "revision",
  "flashcard_battle",
  "rapid_fire",
  "tournament",
  "coding_contest",
  "interview_assessment",
] as const;

export type LiveSessionType = (typeof LIVE_SESSION_TYPES)[number];

export const LIVE_SESSION_STATUSES = ["draft", "scheduled", "lobby", "active", "paused", "finished"] as const;
export type LiveSessionStatus = (typeof LIVE_SESSION_STATUSES)[number];

export const QUIZ_ROOM_SOURCE_TYPES = [
  "existing_quiz",
  "ai_generated",
  "question_bank",
  "mixed",
] as const;
export type QuizRoomSourceType = (typeof QUIZ_ROOM_SOURCE_TYPES)[number];

export const PARTICIPANT_STATUSES = [
  "online",
  "disconnected",
  "thinking",
  "answered",
  "submitted",
  "idle",
] as const;

export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export interface LiveSessionSettings {
  questionTimerSeconds: number;
  breakBetweenQuestionsSeconds?: number;
  totalDurationMinutes?: number;
  /** Frozen at session start — stable order for index-based navigation */
  questionOrder?: string[];
  /** Frozen at session start — option id order per question id */
  optionOrders?: Record<string, string[]>;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  negativeMarking: boolean;
  multipleAttempts: boolean;
  showLeaderboard: boolean;
  anonymousMode: boolean;
  teamMode: boolean;
  autoNextQuestion: boolean;
  /** A1.7 — default self_paced for new live sessions */
  paceMode?: "self_paced" | "instructor_paced";
  showExplanations: boolean;
  showCorrectAnswer: boolean;
  lockLateJoin: boolean;
  allowRejoin: boolean;
  requireLogin?: boolean;
  guestMode?: boolean;
  maxPlayers?: number;
  roomPassword?: string;
  musicEnabled?: boolean;
  musicVolume?: number;
  musicLoop?: boolean;
  musicShuffle?: boolean;
  currentTrackIndex?: number;
  musicPlaying?: boolean;
  selectedTrack?: { id: string; name: string; url: string } | null;
  uploadedTrack?: { id: string; name: string; url: string } | null;
  playlist?: Array<{ name: string; url: string; duration: number }>;
  eventTracks?: Record<string, string>;
  cameraRequired?: boolean;
  browserLock?: boolean;
  fullscreenLock?: boolean;
  tabDetection?: boolean;
  scoring: {
    correctnessWeight: number;
    speedWeight: number;
    streakBonus: number;
    perfectBonus: number;
  };
}

export const DEFAULT_LIVE_SESSION_SETTINGS: LiveSessionSettings = {
  questionTimerSeconds: 30,
  breakBetweenQuestionsSeconds: 5,
  randomizeQuestions: false,
  randomizeOptions: false,
  negativeMarking: false,
  multipleAttempts: false,
  showLeaderboard: true,
  anonymousMode: false,
  teamMode: false,
  autoNextQuestion: true,
  paceMode: "self_paced",
  showExplanations: true,
  showCorrectAnswer: true,
  lockLateJoin: false,
  allowRejoin: true,
  cameraRequired: false,
  browserLock: false,
  fullscreenLock: false,
  tabDetection: false,
  musicEnabled: false,
  musicVolume: 50,
  musicLoop: true,
  musicShuffle: false,
  currentTrackIndex: 0,
  musicPlaying: false,
  playlist: [],
  eventTracks: {},
  scoring: {
    correctnessWeight: 1000,
    speedWeight: 500,
    streakBonus: 100,
    perfectBonus: 500,
  },
};

export interface LeaderboardEntry {
  participantId: string;
  userId: string | null;
  displayName: string;
  avatar: string | null;
  score: number;
  xp: number;
  streak: number;
  correctCount: number;
  wrongCount: number;
  accuracy: number;
  rank: number;
  movement: "up" | "down" | "same";
  fastestAnswerMs: number | null;
  badges: string[];
  rankChange?: number;
  avatarCategory?: string | null;
  cameraOn?: boolean;
  micOn?: boolean;
  raisedHand?: boolean;
  networkStatus?: string;
  device?: string | null;
  status?: string;
  lastSeenAt?: string;
}

export interface QuestionForClient {
  id: string;
  text: string;
  type: string;
  marks: number;
  order: number;
  metadata?: unknown;
  options: Array<{ id: string; text: string; order: number }>;
}

export interface LiveSessionState {
  id: string;
  quizId: string;
  roomCode: string | null;
  pin: string | null;
  title: string;
  status: LiveSessionStatus;
  sessionType: LiveSessionType;
  currentQuestionIndex: number;
  questionStartedAt: string | null;
  settings: LiveSessionSettings;
  questionCount: number;
  currentQuestion: QuestionForClient | null;
  participants: LeaderboardEntry[];
  hostUserId: string;
  quizBranding?: {
    bannerUrl: string | null;
    thumbnailUrl: string | null;
    coverImageUrl: string | null;
    coverGradient: string | null;
    theme: string | null;
  };
}
