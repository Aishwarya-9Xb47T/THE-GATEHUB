import { logger } from "./logger.js";

export interface AssessmentMigrationLogEvent {
  feature: string;
  legacyRoute: string;
  redirectTo: string;
  newRoute: string;
  featureFlag?: string;
  fallback?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Server-side migration audit log for route/API transitions.
 */
export function logAssessmentMigration(event: AssessmentMigrationLogEvent) {
  logger.info("Assessment migration redirect", {
    migration: true,
    ...event,
    timestamp: new Date().toISOString(),
  });
}
