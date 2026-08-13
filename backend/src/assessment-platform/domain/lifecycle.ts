/**
 * Assessment lifecycle state machine (Section 19).
 */

import type { AssessmentLifecycle } from "./constants.js";

export type LifecycleTransition =
  | "submit_for_review"
  | "request_changes"
  | "approve"
  | "publish"
  | "schedule_deployment"
  | "launch"
  | "all_deployments_end"
  | "archive";

const TRANSITIONS: Record<AssessmentLifecycle, Partial<Record<LifecycleTransition, AssessmentLifecycle>>> = {
  draft: {
    submit_for_review: "review",
    archive: "archived",
  },
  review: {
    request_changes: "draft",
    approve: "approved",
  },
  approved: {
    publish: "published",
    archive: "archived",
  },
  published: {
    schedule_deployment: "scheduled",
    launch: "live",
    archive: "archived",
  },
  scheduled: {
    launch: "live",
    archive: "archived",
  },
  live: {
    all_deployments_end: "completed",
  },
  completed: {
    archive: "archived",
  },
  archived: {},
};

export function canTransition(
  from: AssessmentLifecycle,
  action: LifecycleTransition
): boolean {
  return TRANSITIONS[from]?.[action] !== undefined;
}

export function nextLifecycleState(
  from: AssessmentLifecycle,
  action: LifecycleTransition
): AssessmentLifecycle {
  const next = TRANSITIONS[from]?.[action];
  if (!next) {
    throw new Error(`Invalid lifecycle transition: ${from} → ${action}`);
  }
  return next;
}

/** Lifecycle states where content structure must not be mutated in place */
export function isContentFrozen(lifecycle: AssessmentLifecycle): boolean {
  return ["published", "scheduled", "live", "completed", "archived"].includes(lifecycle);
}

/** States that allow creating a new draft version from published content */
export function allowsNewVersion(lifecycle: AssessmentLifecycle): boolean {
  return ["published", "scheduled", "live", "completed", "archived"].includes(lifecycle);
}
