/**
 * Canonical enums for THE GATEHUB Universal Assessment Platform.
 * @see docs/ASSESSMENT-PLATFORM-ARCHITECTURE.md Sections 5, 19, 37
 */

export const ASSESSMENT_KINDS = [
  "formative",
  "summative",
  "diagnostic",
  "placement",
  "coding",
  "survey",
  "interview",
  "competition",
] as const;

export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

export const ASSESSMENT_MODES = [
  "practice",
  "live_quiz",
  "homework",
  "assignment",
  "mock_test",
  "timed_assessment",
  "coding_assessment",
  "adaptive",
  "ai_interview",
  "survey",
  "poll",
] as const;

export type AssessmentMode = (typeof ASSESSMENT_MODES)[number];

/** Content lifecycle on Assessment entity (Section 19) */
export const ASSESSMENT_LIFECYCLE = [
  "draft",
  "review",
  "approved",
  "published",
  "scheduled",
  "live",
  "completed",
  "archived",
] as const;

export type AssessmentLifecycle = (typeof ASSESSMENT_LIFECYCLE)[number];

/** Runtime status on AssessmentDeployment / LiveRoom */
export const DEPLOYMENT_STATUSES = [
  "draft",
  "scheduled",
  "lobby",
  "active",
  "paused",
  "completed",
  "cancelled",
  "archived",
] as const;

export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

export const ATTEMPT_STATUSES = [
  "in_progress",
  "submitted",
  "graded",
  "abandoned",
  "expired",
  "voided",
] as const;

export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const LIVE_ROOM_STATUSES = [
  "draft",
  "scheduled",
  "lobby",
  "active",
  "paused",
  "finished",
  "cancelled",
] as const;

export type LiveRoomStatus = (typeof LIVE_ROOM_STATUSES)[number];

export const PARTICIPANT_STATUSES = [
  "online",
  "disconnected",
  "thinking",
  "answered",
  "submitted",
  "idle",
] as const;

export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export const LEADERBOARD_SCOPES = [
  "quiz",
  "course",
  "department",
  "semester",
  "year",
  "university",
  "global",
  "friends",
  "placement",
  "coding",
  "event",
  "custom",
] as const;

export type LeaderboardScope = (typeof LEADERBOARD_SCOPES)[number];

export const LEADERBOARD_PERIODS = [
  "session",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "all_time",
] as const;

export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

export const QUESTION_CATEGORIES = [
  "choice",
  "text",
  "interactive",
  "media",
  "code",
  "composite",
] as const;

export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];

export const MEDIA_ASSET_TYPES = [
  "image",
  "pdf",
  "audio",
  "video",
  "gif",
  "equation",
  "code_file",
  "document",
] as const;

export type MediaAssetType = (typeof MEDIA_ASSET_TYPES)[number];

export const NOTIFICATION_CHANNELS = [
  "in_app",
  "email",
  "push",
  "sms",
] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const FEATURE_FLAGS = {
  ADAPTIVE_LEARNING: "adaptive_learning",
  POWER_UPS: "power_ups",
  AI_TUTOR: "ai_tutor",
  VOICE_QUESTIONS: "voice_questions",
  INTERVIEW_MODE: "interview_mode",
  PLACEMENT_MODE: "placement_mode",
  DEPT_RANKINGS: "department_rankings",
  OFFLINE_PLAYER: "offline_player",
  DOUBLE_XP_EVENTS: "double_xp_events",
  UNIVERSAL_ASSESSMENT_PLAYER: "universal_assessment_player",
} as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];
