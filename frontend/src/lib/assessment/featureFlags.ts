/**
 * Frontend mirror of backend assessment feature flag registry.
 * @see backend/src/config/assessmentFeatureFlags.ts
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

export const ASSESSMENT_FEATURE_FLAG_DEFAULTS: Record<AssessmentFeatureFlagKey, boolean> = {
  assessmentPlatform: false,
  questionBankV2: false,
  assessmentPlayer: false,
  reportsV2: false,
  homeworkV2: false,
  analyticsV2: false,
  gamificationV2: false,
  aiInsights: false,
  assessmentDashboard: false,
};

export interface AssessmentFeatureFlagsResponse {
  flags: Record<AssessmentFeatureFlagKey, boolean>;
  definitions: Array<{
    key: AssessmentFeatureFlagKey;
    label: string;
    description: string;
    defaultEnabled: boolean;
    phase: "A" | "B";
  }>;
}

let cachedFlags: Record<AssessmentFeatureFlagKey, boolean> | null = null;

export async function fetchAssessmentFeatureFlags(): Promise<Record<AssessmentFeatureFlagKey, boolean>> {
  try {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("lms_token") : null;
    const headers: HeadersInit = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch("/api/assessment-platform/feature-flags", { headers });
    if (!res.ok) return { ...ASSESSMENT_FEATURE_FLAG_DEFAULTS };

    const json = (await res.json()) as { success: boolean; data: AssessmentFeatureFlagsResponse };
    cachedFlags = json.data?.flags ?? { ...ASSESSMENT_FEATURE_FLAG_DEFAULTS };
    return cachedFlags;
  } catch {
    return { ...ASSESSMENT_FEATURE_FLAG_DEFAULTS };
  }
}

export function getCachedAssessmentFeatureFlags(): Record<AssessmentFeatureFlagKey, boolean> {
  return cachedFlags ?? { ...ASSESSMENT_FEATURE_FLAG_DEFAULTS };
}

export function isAssessmentFeatureEnabled(
  key: AssessmentFeatureFlagKey,
  flags?: Record<AssessmentFeatureFlagKey, boolean>
): boolean {
  const source = flags ?? getCachedAssessmentFeatureFlags();
  return source[key] ?? ASSESSMENT_FEATURE_FLAG_DEFAULTS[key];
}

/** Bootstrap flags early in app lifecycle (non-blocking). */
export function bootstrapAssessmentFeatureFlags() {
  void fetchAssessmentFeatureFlags();
}
