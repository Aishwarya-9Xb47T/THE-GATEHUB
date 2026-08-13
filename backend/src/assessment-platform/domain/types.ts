/**
 * Core domain entity types (logical models, not Prisma rows).
 * @see docs/ASSESSMENT-PLATFORM-ARCHITECTURE.md Section 37
 */

import type {
  AssessmentKind,
  AssessmentLifecycle,
  AssessmentMode,
  AttemptStatus,
  DeploymentStatus,
  LeaderboardPeriod,
  LeaderboardScope,
  MediaAssetType,
  QuestionCategory,
} from "./constants.js";

// ─── Version snapshots (immutable) ───────────────────────────────────────────

export interface ChoiceSnapshot {
  id: string;
  text: string;
  isCorrect: boolean;
  order: number;
  metadata?: Record<string, unknown>;
}

export interface MediaUsageRef {
  assetId: string;
  role: string;
  variant?: string;
  signedUrl?: string;
}

export interface QuestionVersionSnapshot {
  id: string;
  questionId: string;
  version: number;
  typeSlug: string;
  stem: string;
  explanation?: string | null;
  hints: string[];
  difficulty?: string | null;
  bloomLevel?: string | null;
  concepts: string[];
  tags: string[];
  metadata: Record<string, unknown>;
  choices: ChoiceSnapshot[];
  media: MediaUsageRef[];
}

export interface AssessmentItemVersionSnapshot {
  questionVersionId: string;
  order: number;
  marks: number;
  required: boolean;
  metadata?: Record<string, unknown>;
}

export interface AssessmentSectionVersionSnapshot {
  id: string;
  title?: string | null;
  order: number;
  items: AssessmentItemVersionSnapshot[];
}

export interface AssessmentVersionSnapshot {
  id: string;
  assessmentId: string;
  version: number;
  title: string;
  description?: string | null;
  totalMarks: number;
  sections: AssessmentSectionVersionSnapshot[];
  publishedAt?: string | null;
}

// ─── Learning vs Engagement (dual track) ───────────────────────────────────

export interface TopicMasteryMap {
  [conceptId: string]: number; // 0..1
}

export interface ConceptTimeMap {
  [conceptId: string]: number; // ms
}

export interface LearningMetrics {
  accuracy: number;
  marksEarned: number;
  totalMarks: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  topicMastery: TopicMasteryMap;
  bloomBreakdown: Record<string, number>;
  difficultySolved: Record<string, number>;
  weakConcepts: string[];
  strongConcepts: string[];
  timePerConcept: ConceptTimeMap;
}

export interface EngagementMetrics {
  xpEarned: number;
  coinsEarned: number;
  streak: number;
  combo: number;
  sessionRank: number | null;
  achievementPoints: number;
  powerUpsUsed: string[];
  sessionScore: number;
}

// ─── Grading ─────────────────────────────────────────────────────────────────

export interface GradeResult {
  isCorrect: boolean | null; // null = ungraded (essay, poll)
  marksAwarded: number;
  correctOptionIds?: string[];
  explanation?: string | null;
  feedback?: string | null;
  conceptDelta?: TopicMasteryMap;
  metadata?: Record<string, unknown>;
}

export interface LearningGradeResult extends GradeResult {
  gradedBy: "auto" | "ai" | "manual";
}

export interface EngagementGradeResult {
  pointsEarned: number;
  xpDelta: number;
  streakAfter: number;
  comboAfter: number;
}

// ─── Deployment settings (mode-specific) ─────────────────────────────────────

export interface DeploymentSettings {
  timerPolicy: "none" | "per_question" | "global" | "strict_lock";
  questionTimerSeconds?: number;
  globalTimerMinutes?: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  gamificationEnabled: boolean;
  showExplanations: boolean;
  showCorrectAnswer: boolean;
  maxAttempts: number;
  passingScorePercent?: number;
  negativeMarking?: boolean;
  allowHints?: boolean;
  proctoringLevel?: "none" | "basic" | "strict";
  roomPassword?: string;
  lockLateJoin?: boolean;
  allowRejoin?: boolean;
  anonymousMode?: boolean;
  teamMode?: boolean;
  scoring?: EngagementScoringWeights;
}

export interface EngagementScoringWeights {
  correctnessWeight: number;
  speedWeight: number;
  streakBonus: number;
  perfectBonus: number;
}

// ─── Entity summaries (service layer DTOs) ───────────────────────────────────

export interface AssessmentSummary {
  id: string;
  organizationId?: string | null;
  authorId: string;
  kind: AssessmentKind;
  lifecycle: AssessmentLifecycle;
  title: string;
  description?: string | null;
  totalMarks: number;
  publishedVersionId?: string | null;
  legacyQuizId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentSummary {
  id: string;
  assessmentId: string;
  assessmentVersionId: string;
  mode: AssessmentMode;
  title: string;
  status: DeploymentStatus;
  contextType?: string | null;
  contextId?: string | null;
  hostId?: string | null;
  scheduledAt?: string | null;
  dueAt?: string | null;
  settings: DeploymentSettings;
}

export interface AttemptSummary {
  id: string;
  deploymentId: string;
  assessmentVersionId: string;
  userId: string;
  mode: AssessmentMode;
  status: AttemptStatus;
  startedAt: string;
  submittedAt?: string | null;
}

export interface AttemptBootstrap {
  attempt: AttemptSummary;
  deployment: DeploymentSummary;
  assessmentVersion: AssessmentVersionSnapshot;
  questions: QuestionVersionSnapshot[];
  settings: DeploymentSettings;
  reconnectToken?: string;
}

export interface ResponsePayload {
  questionVersionId: string;
  answer: unknown;
  clientTimestamp?: string;
  responseTimeMs?: number;
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export interface LeaderboardRanking {
  rank: number;
  userId: string;
  displayName: string;
  avatar?: string | null;
  score: number;
  accuracy?: number;
  movement?: "up" | "down" | "same";
  metadata?: Record<string, unknown>;
}

export interface LeaderboardDefinitionSummary {
  slug: string;
  scopeType: LeaderboardScope;
  period: LeaderboardPeriod;
  metric: "engagement_score" | "xp" | "accuracy" | "custom";
}

// ─── Media ─────────────────────────────────────────────────────────────────────

export interface MediaAssetSummary {
  id: string;
  organizationId?: string | null;
  mimeType: string;
  assetType: MediaAssetType;
  originalName: string;
  sizeBytes: number;
  url?: string;
}

// ─── AI provenance ─────────────────────────────────────────────────────────────

export interface AIProvenance {
  aiHistoryId: string;
  model: string;
  provider: string;
  confidence?: number | null;
  approvedById?: string | null;
  approvedAt?: string | null;
}

// ─── Plugin context ──────────────────────────────────────────────────────────

export interface PluginContext {
  organizationId?: string | null;
  userId?: string | null;
  attemptId?: string | null;
  deploymentId?: string | null;
  mode?: AssessmentMode;
}

export interface QuestionPluginContext extends PluginContext {
  questionVersion: QuestionVersionSnapshot;
}

export type QuestionCategoryMap = Record<string, QuestionCategory>;
