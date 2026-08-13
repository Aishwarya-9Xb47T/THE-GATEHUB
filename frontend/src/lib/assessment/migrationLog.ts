/**
 * Structured migration audit logging for assessment route transitions.
 */

export interface AssessmentMigrationLogEvent {
  feature: string;
  legacyRoute: string;
  redirectTo: string;
  newRoute: string;
  featureFlag?: string;
  fallback?: string;
  metadata?: Record<string, unknown>;
}

const MIGRATION_LOG_KEY = "assessment_migration_log";
const MAX_BUFFER = 100;

function persistEvent(event: AssessmentMigrationLogEvent & { timestamp: string }) {
  try {
    const raw = sessionStorage.getItem(MIGRATION_LOG_KEY);
    const buffer: typeof event[] = raw ? JSON.parse(raw) : [];
    buffer.unshift(event);
    sessionStorage.setItem(MIGRATION_LOG_KEY, JSON.stringify(buffer.slice(0, MAX_BUFFER)));
  } catch {
    // sessionStorage unavailable
  }
}

export function logAssessmentMigration(event: AssessmentMigrationLogEvent) {
  const payload = {
    ...event,
    timestamp: new Date().toISOString(),
    analyticsEvent: "assessment_migration_redirect",
  };

  if (import.meta.env.DEV) {
    console.info("[AssessmentMigration]", payload);
  }

  persistEvent(payload);

  // Future: POST /api/analytics/events when ingestion is wired
}

export function getAssessmentMigrationLog(): Array<AssessmentMigrationLogEvent & { timestamp: string }> {
  try {
    const raw = sessionStorage.getItem(MIGRATION_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Map legacy Assessment Studio tab to Assessment Hub destination */
export function mapLegacyStudioTab(tab: string | null): { hubTab: string; section?: string } {
  switch (tab) {
    case "bank":
      return { hubTab: "bank", section: "all" };
    case "collections":
      return { hubTab: "bank", section: "collections" };
    case "ai":
      return { hubTab: "ai" };
    case "templates":
      return { hubTab: "templates" };
    case "review":
      return { hubTab: "bank", section: "review" };
    case "import":
      return { hubTab: "bank", section: "imports" };
    case "settings":
      return { hubTab: "settings" };
    case "dashboard":
    default:
      return { hubTab: "bank", section: "all" };
  }
}

export function buildAssessmentHubPath(params: {
  tab?: string;
  section?: string;
  source?: string;
  extra?: Record<string, string>;
}): string {
  const search = new URLSearchParams();
  if (params.tab) search.set("tab", params.tab);
  if (params.section) search.set("section", params.section);
  if (params.source) search.set("source", params.source);
  if (params.extra) {
    Object.entries(params.extra).forEach(([k, v]) => search.set(k, v));
  }
  const qs = search.toString();
  return `/instructor/quiz-room${qs ? `?${qs}` : ""}`;
}

export const ASSESSMENT_HUB_BASE = "/instructor/quiz-room";

export function questionEditorPath(questionId: string) {
  return `${ASSESSMENT_HUB_BASE}/bank/questions/${questionId}`;
}

export function questionBankPath(section?: string) {
  return buildAssessmentHubPath({ tab: "bank", section });
}
