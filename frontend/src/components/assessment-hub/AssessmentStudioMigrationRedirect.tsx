import { useEffect } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import {
  buildAssessmentHubPath,
  logAssessmentMigration,
  mapLegacyStudioTab,
} from "@/lib/assessment/migrationLog";

/**
 * Redirects legacy /instructor/assessment-studio routes into Assessment Hub.
 * Preserves deep links and logs every migration for future legacy removal.
 */
export function AssessmentStudioMigrationRedirect() {
  const location = useLocation();
  const { questionId } = useParams<{ questionId?: string }>();

  const legacyPath = location.pathname + location.search;
  let target = buildAssessmentHubPath({ tab: "bank", section: "all" });

  if (questionId) {
    target = `/instructor/quiz-room/bank/questions/${questionId}${location.search}`;
  } else {
    const tab = new URLSearchParams(location.search).get("tab");
    const source = new URLSearchParams(location.search).get("source");
    const mapped = mapLegacyStudioTab(tab);
    target = buildAssessmentHubPath({
      tab: mapped.hubTab,
      section: mapped.section,
      source: source || undefined,
    });
  }

  useEffect(() => {
    logAssessmentMigration({
      feature: "A1_question_bank_merge",
      legacyRoute: legacyPath,
      redirectTo: target,
      newRoute: target,
      featureFlag: "questionBankV2",
      fallback: "/instructor/quiz-room?tab=bank",
      metadata: { tab: new URLSearchParams(location.search).get("tab") },
    });
  }, [legacyPath, target, location.search]);

  return <Navigate to={target} replace />;
}
