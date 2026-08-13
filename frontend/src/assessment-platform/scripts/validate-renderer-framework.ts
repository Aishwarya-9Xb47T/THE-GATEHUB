/**
 * Phase 1 Module 5 — Universal Renderer Framework validation.
 * Run: npm run validate:renderer
 */

import { bootstrapAssessmentPlatform } from "../bootstrap";
import { getRenderer, hasRenderer, listRendererTypeSlugs } from "../registry/rendererRegistry";
import { listOverlaysForMode } from "../registry/overlayRegistry";
import { getModeConfig } from "../types/modeConfig";
import { createRendererResponse, toAttemptPayload } from "../types/response";
import { RENDERER_PERFORMANCE_TARGETS } from "../types/renderer";

bootstrapAssessmentPlatform();

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

const REQUIRED_RENDERERS = [
  "multiple_choice",
  "multiple_select",
  "true_false",
  "poll",
  "essay",
];

for (const slug of REQUIRED_RENDERERS) {
  assert(hasRenderer(slug), `renderer registered: ${slug}`);
  const plugin = getRenderer(slug);
  assert(!!plugin?.Component, `${slug} has Component`);
  assert(typeof plugin?.validateInput === "function", `${slug} validateInput`);
  assert(typeof plugin?.collectResponse === "function", `${slug} collectResponse`);
  assert(typeof plugin?.dispose === "function", `${slug} dispose`);
  assert(plugin?.accessibility.keyboardNavigable === true, `${slug} a11y keyboard`);
}

assert(hasRenderer("coding"), "lazy coding renderer registered");
assert(listRendererTypeSlugs().length >= 10, "registry has 10+ type slugs");

const response = createRendererResponse("qv-1", "mcq-renderer", "opt-b", 800);
const payload = toAttemptPayload(response);
assert(payload.questionVersionId === "qv-1", "response → attempt payload");
assert((payload.metadata as { rendererId: string }).rendererId === "mcq-renderer", "rendererId in metadata");

const practiceOverlays = listOverlaysForMode("practice");
assert(practiceOverlays.some((o) => o.id === "ai_hint"), "practice has ai_hint overlay");

const liveConfig = getModeConfig("live_quiz");
assert(liveConfig.showNavigation === false, "live mode config");
assert(liveConfig.gamificationOverlay === true, "live gamification");

assert(RENDERER_PERFORMANCE_TARGETS.initialRenderMs === 100, "perf target initial render");
assert(RENDERER_PERFORMANCE_TARGETS.questionTransitionMs === 50, "perf target transition");
assert(RENDERER_PERFORMANCE_TARGETS.rendererLoadMs === 200, "perf target load");

console.log(`\nRenderer framework validation: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log("All renderer framework checks passed.");
