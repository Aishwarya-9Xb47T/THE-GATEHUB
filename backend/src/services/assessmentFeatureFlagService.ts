import {
  ASSESSMENT_FEATURE_FLAG_DEFAULTS,
  ASSESSMENT_FEATURE_FLAG_REGISTRY,
  type AssessmentFeatureFlagKey,
} from "../config/assessmentFeatureFlags.js";
import { getPlatformSettings } from "./platformSettingsService.js";

function envOverride(key: AssessmentFeatureFlagKey): boolean | undefined {
  const envKey = `ASSESSMENT_FLAG_${key.replace(/([A-Z])/g, "_$1").toUpperCase()}`;
  const raw = process.env[envKey];
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return undefined;
}

export async function getAssessmentFeatureFlags(): Promise<Record<AssessmentFeatureFlagKey, boolean>> {
  const settings = await getPlatformSettings();
  const stored =
    settings.featureFlags && typeof settings.featureFlags === "object" && !Array.isArray(settings.featureFlags)
      ? (settings.featureFlags as Record<string, unknown>)
      : {};

  const resolved = { ...ASSESSMENT_FEATURE_FLAG_DEFAULTS };

  for (const def of ASSESSMENT_FEATURE_FLAG_REGISTRY) {
    const env = envOverride(def.key);
    if (env !== undefined) {
      resolved[def.key] = env;
      continue;
    }
    const fromDb = stored[def.key];
    if (typeof fromDb === "boolean") {
      resolved[def.key] = fromDb;
    }
  }

  return resolved;
}

export async function isAssessmentFeatureEnabled(key: AssessmentFeatureFlagKey): Promise<boolean> {
  const flags = await getAssessmentFeatureFlags();
  return flags[key] ?? ASSESSMENT_FEATURE_FLAG_DEFAULTS[key];
}

export function getAssessmentFeatureFlagDefinitions() {
  return ASSESSMENT_FEATURE_FLAG_REGISTRY;
}
