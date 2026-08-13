export type LiveSessionStatus = "draft" | "scheduled" | "lobby" | "active" | "paused" | "finished";

export type LiveSessionType =
  | "practice"
  | "homework"
  | "live_classroom"
  | "timed_exam"
  | "adaptive"
  | "revision"
  | "flashcard_battle"
  | "rapid_fire"
  | "tournament"
  | "coding_contest"
  | "interview_assessment";

export type QuizRoomSourceType = "existing_quiz" | "ai_generated" | "question_bank" | "mixed";

export interface LiveSessionSettings {
  questionTimerSeconds: number;
  breakBetweenQuestionsSeconds?: number;
  totalDurationMinutes?: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  negativeMarking: boolean;
  multipleAttempts: boolean;
  showLeaderboard: boolean;
  anonymousMode: boolean;
  teamMode: boolean;
  autoNextQuestion: boolean;
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
  powerupsEnabled?: boolean;
  chatEnabled?: boolean;
  coinsEnabled?: boolean;
  // Proctoring / security features
  fullscreenLock?: boolean;
  browserLock?: boolean;
  tabDetection?: boolean;
  lives?: number;
  scoring: {
    correctnessWeight: number;
    speedWeight: number;
    streakBonus: number;
    perfectBonus: number;
  };
}


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
  // Proctoring / live state fields
  raisedHand?: boolean;
  status?: string;
  tabFocused?: boolean;
  fullscreen?: boolean;
  violationCount?: number;
  lives?: number;
  powerups?: string[];
  cameraOn?: boolean;
  micOn?: boolean;
  lastSeenAt?: string;
  device?: string | null;
  batteryStatus?: string | null;
}

export interface LiveAnswerResult {
  isCorrect: boolean;
  pointsEarned: number;
  explanation?: string | null;
  correctOptions?: string[];
  responseTimeMs?: number;
  streak?: number;
  xpEarned?: number;
  totalScore?: number;
  totalXp?: number;
  rank?: number;
  nextQuestion?: QuestionForClient | null;
  participantQuestionIndex?: number;
  questionStartedAt?: string | null;
  isPersonalComplete?: boolean;
}

export interface LivePlayerSessionView {
  participantId: string | null;
  sessionState: LiveSessionState;
  currentAnswerResult: LiveAnswerResult | null;
  hasSubmittedCurrentQuestion: boolean;
}

export interface QuestionForClient {
  id: string;
  text: string;
  type: string;
  marks: number;
  order: number;
  media?: { url: string; kind?: string } | null;
  mediaUrl?: string;
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

export interface QuizRoomSummary {
  id: string;
  roomCode: string | null;
  pin: string | null;
  title: string;
  status: LiveSessionStatus;
  sessionType: LiveSessionType;
  sourceType: QuizRoomSourceType;
  scheduledAt: string | null;
  createdAt: string;
  endedAt: string | null;
  quiz: { id: string; title: string; totalMarks: number };
  course?: { id: string; title: string } | null;
  analytics?: { totalParticipants: number; avgAccuracy: number } | null;
  _count: { participants: number };
}

export interface QuizRoomPreview {
  quizId: string;
  title: string;
  description: string | null;
  questionCount: number;
  totalMarks: number;
  estimatedMinutes: number;
  questionTypes: string[];
  typeCounts: Record<string, number>;
  topics: string[];
  avgDifficulty: string;
  passingPercent: number;
  bannerUrl?: string | null;
  thumbnailUrl?: string | null;
  coverImageUrl?: string | null;
  coverGradient?: string | null;
  theme?: string | null;
  questions: Array<{
    index: number;
    id: string;
    text: string;
    type: string;
    marks: number;
    difficulty: string | null;
    optionCount: number;
  }>;
}

export interface QuestionBankItem {
  quizId: string;
  quizTitle: string;
  description: string | null;
  questionCount: number;
  totalMarks: number;
  courseId: string;
  courseTitle: string;
  sectionTitle: string;
  lectureId: string;
  lectureTitle: string;
  questionTypes: string[];
}

export interface QuizRoomTemplate {
  id: string;
  name: string;
  description: string | null;
  sessionType: LiveSessionType;
  sourceType: QuizRoomSourceType;
  settings: LiveSessionSettings;
  createdAt: string;
  updatedAt: string;
}

export type LiveWsMessage =
  | { type: "connected"; participantId?: string; isHost: boolean }
  | { type: "session_state"; state: LiveSessionState }
  | { type: "participant_state"; state: LiveSessionState }
  | { type: "session_started" }
  | { type: "participant_finished"; participantId: string }
  | { type: "question_advanced" }
  | { type: "session_finished"; leaderboard: LeaderboardEntry[] }
  | { type: "leaderboard"; rankings: LeaderboardEntry[] }
  | {
      type: "answer_result";
      isCorrect: boolean;
      pointsEarned: number;
      explanation?: string | null;
      correctOptions?: string[];
      responseTimeMs?: number;
      streak?: number;
      xpEarned?: number;
      totalScore?: number;
      totalXp?: number;
      rank?: number;
      nextQuestion?: QuestionForClient | null;
      participantQuestionIndex?: number;
      questionStartedAt?: string | null;
      isPersonalComplete?: boolean;
    }
  | { type: "answer_received"; participantId: string; questionId: string }
  | { type: "participant_joined"; participantId: string }
  | { type: "participant_left"; participantId: string }
  | { type: "error"; message: string }
  | { type: "pong" };

export const SESSION_TYPE_LABELS: Record<LiveSessionType, string> = {
  practice: "Practice Mode",
  homework: "Homework Mode",
  live_classroom: "Live Classroom",
  timed_exam: "Timed Exam",
  adaptive: "Adaptive Quiz",
  revision: "Revision Session",
  flashcard_battle: "Flashcard Battle",
  rapid_fire: "Rapid Fire",
  tournament: "Tournament",
  coding_contest: "Coding Contest",
  interview_assessment: "Interview Assessment",
};

export const SOURCE_TYPE_LABELS: Record<QuizRoomSourceType, string> = {
  existing_quiz: "Existing Quiz",
  ai_generated: "AI Generated",
  question_bank: "Question Bank",
  mixed: "Mixed Sources",
};

export const STATUS_LABELS: Record<LiveSessionStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  lobby: "Waiting Room",
  active: "Live",
  paused: "Paused",
  finished: "Finished",
};

export const DEFAULT_SETTINGS: LiveSessionSettings = {
  questionTimerSeconds: 30,
  breakBetweenQuestionsSeconds: 5,
  randomizeQuestions: false,
  randomizeOptions: false,
  negativeMarking: false,
  multipleAttempts: false,
  showLeaderboard: true,
  anonymousMode: false,
  teamMode: false,
  autoNextQuestion: false,
  paceMode: "self_paced",
  showExplanations: true,
  showCorrectAnswer: true,
  lockLateJoin: false,
  allowRejoin: true,
  requireLogin: true,
  guestMode: false,
  maxPlayers: 100,
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
