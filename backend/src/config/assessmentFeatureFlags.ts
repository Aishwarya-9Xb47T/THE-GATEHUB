/**
 * Central registry for assessment platform migration feature flags.
 * Override via platformSettings.featureFlags JSON or ASSESSMENT_FLAG_<KEY>=true env vars.
 */

export const ASSESSMENT_FEATURE_FLAG_KEYS = {
  ASSESSMENT_PLATFORM: "assessmentPlatform",
  QUESTION_BANK_V2: "questionBankV2",
  ASSESSMENT_PLAYER: "assessmentPlayer",
  REPORTS_V2: "reportsV2",
  HOMEWORK_V2: "homeworkV2",
  ANALYTICS_V2: "analyticsV2",
  GAMIFICATION_V2: "gamificationV2",
  AI_INSIGHTS: "aiInsights",
  ASSESSMENT_DASHBOARD: "assessmentDashboard",
} as const;

export type AssessmentFeatureFlagKey =
  (typeof ASSESSMENT_FEATURE_FLAG_KEYS)[keyof typeof ASSESSMENT_FEATURE_FLAG_KEYS];

export interface AssessmentFeatureFlagDefinition {
  key: AssessmentFeatureFlagKey;
  label: string;
  description: string;
  /** Default when not set in platform settings or env */
  defaultEnabled: boolean;
  phase: "A" | "B";
}

export const ASSESSMENT_FEATURE_FLAG_REGISTRY: AssessmentFeatureFlagDefinition[] = [
  {
    key: ASSESSMENT_FEATURE_FLAG_KEYS.ASSESSMENT_PLATFORM,
    label: "Assessment Platform (v2)",
    description: "Enable v2 assessment domain, services, and APIs",
    defaultEnabled: false,
    phase: "B",
  },
  {
    key: ASSESSMENT_FEATURE_FLAG_KEYS.QUESTION_BANK_V2,
    label: "Question Bank v2",
    description: "Sync bank UI with v2 AssessQuestion service",
    defaultEnabled: false,
    phase: "B",
  },
  {
    key: ASSESSMENT_FEATURE_FLAG_KEYS.ASSESSMENT_PLAYER,
    label: "Universal Assessment Player",
    description: "Replace legacy live player with AssessmentPlayer + renderer registry",
    defaultEnabled: false,
    phase: "B",
  },
  {
    key: ASSESSMENT_FEATURE_FLAG_KEYS.REPORTS_V2,
    label: "Reports v2",
    description: "Enhanced reports with drill-down and exports",
    defaultEnabled: false,
    phase: "A",
  },
  {
    key: ASSESSMENT_FEATURE_FLAG_KEYS.HOMEWORK_V2,
    label: "Homework v2",
    description: "Homework as deployment mode with full assignment workflow",
    defaultEnabled: false,
    phase: "A",
  },
  {
    key: ASSESSMENT_FEATURE_FLAG_KEYS.ANALYTICS_V2,
    label: "Analytics v2",
    description: "Per-assessment analytics and question health metrics",
    defaultEnabled: false,
    phase: "B",
  },
  {
    key: ASSESSMENT_FEATURE_FLAG_KEYS.GAMIFICATION_V2,
    label: "Gamification v2",
    description: "Platform gamification schema and live rewards",
    defaultEnabled: false,
    phase: "B",
  },
  {
    key: ASSESSMENT_FEATURE_FLAG_KEYS.AI_INSIGHTS,
    label: "AI Insights",
    description: "AI-powered report insights and remediation suggestions",
    defaultEnabled: false,
    phase: "A",
  },
  {
    key: ASSESSMENT_FEATURE_FLAG_KEYS.ASSESSMENT_DASHBOARD,
    label: "Assessment Dashboard",
    description: "Per-assessment hub page with deployment actions",
    defaultEnabled: false,
    phase: "A",
  },
];

export const ASSESSMENT_FEATURE_FLAG_DEFAULTS: Record<AssessmentFeatureFlagKey, boolean> =
  Object.fromEntries(
    ASSESSMENT_FEATURE_FLAG_REGISTRY.map((f) => [f.key, f.defaultEnabled])
  ) as Record<AssessmentFeatureFlagKey, boolean>;
