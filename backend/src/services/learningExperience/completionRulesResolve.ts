import type { CompletionRules } from "./learningExperience/learningExperienceSchema.js";

const DEFAULT_COMPLETION_RULES: CompletionRules = {
  minimumProgressPercent: 100,
  requireAllRequiredSteps: true,
  // Opt-in: never silently enable certificates without an explicit signal
  certificateEligible: false,
};

/**
 * Resolve certificate/completion rules from LU structuredData.
 * Prefer explicit completionRules, then Architect interview.certificationEligible,
 * then cached learnerExperience.completionRules.
 */
export function resolveCompletionRules(structuredData: unknown): CompletionRules {
  const sd =
    structuredData && typeof structuredData === "object" && !Array.isArray(structuredData)
      ? (structuredData as Record<string, unknown>)
      : {};

  const fromTop = sd.completionRules as Partial<CompletionRules> | undefined;
  const fromLe =
    sd.learnerExperience && typeof sd.learnerExperience === "object"
      ? ((sd.learnerExperience as { completionRules?: Partial<CompletionRules> }).completionRules)
      : undefined;

  const interview =
    sd.aiArchitect && typeof sd.aiArchitect === "object"
      ? ((sd.aiArchitect as { interview?: { courseInfo?: { certificationEligible?: boolean } } })
          .interview)
      : undefined;
  const fromArchitect = interview?.courseInfo?.certificationEligible;

  const certificateEligible =
    typeof fromTop?.certificateEligible === "boolean"
      ? fromTop.certificateEligible
      : typeof fromArchitect === "boolean"
        ? fromArchitect
        : typeof fromLe?.certificateEligible === "boolean"
          ? fromLe.certificateEligible
          : DEFAULT_COMPLETION_RULES.certificateEligible;

  let minimumProgressPercent = DEFAULT_COMPLETION_RULES.minimumProgressPercent;
  if (typeof fromTop?.minimumProgressPercent === "number") {
    minimumProgressPercent = fromTop.minimumProgressPercent;
  } else if (typeof fromLe?.minimumProgressPercent === "number") {
    // Legacy engine defaulted to 80; canonical course completion is 100%.
    minimumProgressPercent = fromLe.minimumProgressPercent === 80 ? 100 : fromLe.minimumProgressPercent;
  }

  const requireAllRequiredSteps =
    typeof fromTop?.requireAllRequiredSteps === "boolean"
      ? fromTop.requireAllRequiredSteps
      : typeof fromLe?.requireAllRequiredSteps === "boolean"
        ? fromLe.requireAllRequiredSteps
        : DEFAULT_COMPLETION_RULES.requireAllRequiredSteps;

  return {
    minimumProgressPercent,
    requireAllRequiredSteps,
    certificateEligible,
  };
}

export function applyCompletionRulesToExperience<T extends { completionRules: CompletionRules }>(
  pkg: T,
  structuredData: unknown
): T {
  return {
    ...pkg,
    completionRules: resolveCompletionRules(structuredData),
  };
}
