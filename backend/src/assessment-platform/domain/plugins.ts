/**
 * Plugin contracts for extensible assessment platform (Section 24).
 * Registries resolve plugins by key — no switch statements in core paths.
 */

import type { AssessmentMode } from "./constants.js";
import type {
  EngagementGradeResult,
  GradeResult,
  LearningGradeResult,
  PluginContext,
  QuestionVersionSnapshot,
} from "./types.js";
import type { DomainEvent } from "./events.js";

export type PluginCategory =
  | "questionType"
  | "renderer"
  | "grader"
  | "editor"
  | "assessmentMode"
  | "gamification"
  | "leaderboard"
  | "analytics"
  | "aiTool"
  | "notification"
  | "cheatDetection";

export interface BasePlugin {
  key: string;
  version: string;
  label: string;
}

// ─── Question pipeline ───────────────────────────────────────────────────────

export interface QuestionTypePlugin extends BasePlugin {
  category: "questionType";
  typeSlug: string;
  /** Structural validation — returns error messages */
  validate(question: QuestionValidationInput): string[];
  sanitize(metadata: Record<string, unknown>): Record<string, unknown>;
  toSnapshot(input: QuestionValidationInput): Partial<QuestionVersionSnapshot>;
  /** Learning evaluation */
  evaluate(answer: unknown, question: QuestionVersionSnapshot): Promise<LearningGradeResult>;
  /** Engagement scoring hook (optional per type) */
  score?(answer: unknown, question: QuestionVersionSnapshot, responseTimeMs: number): EngagementGradeResult;
  /** Student-facing feedback */
  feedback(result: LearningGradeResult, question: QuestionVersionSnapshot): string | null;
  /** Analytics dimensions emitted on answer */
  analytics(result: LearningGradeResult): AnalyticsMetric[];
}

export interface QuestionValidationInput {
  stem: string;
  typeSlug: string;
  choices?: Array<{ text: string; isCorrect: boolean; order: number }>;
  metadata?: Record<string, unknown>;
  marks?: number;
}

export interface GraderPlugin extends BasePlugin {
  category: "grader";
  grade(
    answer: unknown,
    questionVersion: QuestionVersionSnapshot,
    ctx: PluginContext
  ): Promise<LearningGradeResult>;
}

export interface RendererPluginMeta extends BasePlugin {
  category: "renderer";
  /** Frontend component id resolved by rendererRegistry */
  componentKey: string;
  supportsOffline: boolean;
  accessibility: {
    keyboardNavigable: boolean;
    screenReaderLabels: boolean;
  };
}

// ─── Assessment modes ────────────────────────────────────────────────────────

export interface AssessmentModePlugin extends BasePlugin {
  category: "assessmentMode";
  mode: AssessmentMode;
  defaultSettings: Record<string, unknown>;
  validateDeployment(settings: Record<string, unknown>): string[];
  gamificationEnabledByDefault: boolean;
}

// ─── Gamification & analytics ────────────────────────────────────────────────

export interface GamificationAward {
  type: "xp" | "coin" | "badge" | "achievement" | "powerup";
  amount?: number;
  slug?: string;
  reason: string;
}

export interface GamificationPlugin extends BasePlugin {
  category: "gamification";
  evaluate(event: DomainEvent, ctx: PluginContext): GamificationAward[];
}

export interface AnalyticsMetric {
  name: string;
  value: number;
  dimensions?: Record<string, string>;
}

export interface AnalyticsPlugin extends BasePlugin {
  category: "analytics";
  onEvent(event: DomainEvent): AnalyticsMetric[];
}

// ─── Engagement scoring extension ────────────────────────────────────────────

export interface EngagementScorerPlugin extends BasePlugin {
  category: "gamification";
  computeEngagement(
    learning: LearningGradeResult,
    responseTimeMs: number,
    streak: number,
    settings: Record<string, unknown>
  ): EngagementGradeResult;
}

export type AssessmentPlugin =
  | QuestionTypePlugin
  | GraderPlugin
  | RendererPluginMeta
  | AssessmentModePlugin
  | GamificationPlugin
  | AnalyticsPlugin
  | EngagementScorerPlugin;

export interface PluginRegistry {
  register(category: PluginCategory, plugin: AssessmentPlugin): void;
  get<T extends AssessmentPlugin>(category: PluginCategory, key: string): T | undefined;
  list(category: PluginCategory): string[];
  has(category: PluginCategory, key: string): boolean;
}
