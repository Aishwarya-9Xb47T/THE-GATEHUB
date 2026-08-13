/**
 * Phase 1 Module 1 — domain model self-validation.
 * Run: npx tsx src/assessment-platform/scripts/validate-domain.ts
 */

import {
  canTransition,
  nextLifecycleState,
  isContentFrozen,
  allowsNewVersion,
} from "../domain/lifecycle.js";
import { createDomainEvent, DOMAIN_EVENT_TYPES } from "../domain/events.js";
import {
  ASSESSMENT_LIFECYCLE,
  ASSESSMENT_MODES,
  FEATURE_FLAGS,
} from "../domain/constants.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

// Lifecycle transitions
assert(canTransition("draft", "submit_for_review"), "draft → review");
assert(nextLifecycleState("draft", "submit_for_review") === "review", "draft → review result");
assert(canTransition("review", "approve"), "review → approve");
assert(nextLifecycleState("review", "approve") === "approved", "review → approved");
assert(!canTransition("archived", "publish"), "archived cannot publish");
assert(isContentFrozen("published"), "published is frozen");
assert(!isContentFrozen("draft"), "draft is not frozen");
assert(allowsNewVersion("published"), "published allows new version");

// Domain events
const evt = createDomainEvent(
  "AssessmentCreated",
  "Assessment",
  "asmt_test",
  { assessmentId: "asmt_test", authorId: "u1", kind: "formative", title: "T" },
  { correlationId: "corr-1", actorId: "u1" }
);
assert(evt.type === "AssessmentCreated", "event type");
assert(evt.version === 1, "event version");
assert(evt.metadata.correlationId === "corr-1", "correlation id");

// Constants coverage
assert(ASSESSMENT_LIFECYCLE.length === 8, "8 lifecycle states");
assert(ASSESSMENT_MODES.length === 11, "11 assessment modes");
assert(DOMAIN_EVENT_TYPES.length >= 15, "domain events defined");
assert(FEATURE_FLAGS.UNIVERSAL_ASSESSMENT_PLAYER === "universal_assessment_player", "feature flag");

console.log(`\nDomain validation: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log("All domain model checks passed.");
