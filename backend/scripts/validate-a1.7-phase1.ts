/**
 * A1.7 Phase 1 — architecture contract validation.
 * Run: npm run validate:a1.7-phase1 (from backend/)
 *
 * Ensures interfaces compile and legacy production path is untouched.
 */

import {
  AssessmentRuntime,
  InstructorPacedStrategy,
  PaceStrategyRegistry,
  createDefaultPaceStrategyRegistry,
  defaultFeedbackStrategy,
  defaultLeaderboardStrategy,
  legacyTimerStrategy,
  type AssessmentContext,
  type PaceStrategy,
} from "../src/assessment-runtime/index.js";
import { legacyLiveSessionPort } from "../src/liveSession/adapters/legacyLiveSessionAdapter.js";
import { selfPacedLiveSessionPort } from "../src/liveSession/adapters/selfPacedLiveSessionAdapter.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function testRegistry() {
  const registry = createDefaultPaceStrategyRegistry(legacyLiveSessionPort, selfPacedLiveSessionPort);
  assert(registry.has("instructor_paced"), "instructor_paced strategy registered");
  assert(registry.has("self_paced"), "self_paced strategy registered");
  assert(registry.list().length === 2, "two strategies registered");
  const strategy = registry.get("instructor_paced");
  assert(strategy.paceKind === "instructor_paced", "strategy pace kind");
}

function testRuntimeOrchestration() {
  const strategy = new InstructorPacedStrategy(legacyLiveSessionPort);
  const runtime = new AssessmentRuntime(strategy);
  const events: string[] = [];
  runtime.onEvent((e) => events.push(e.type));

  assert(runtime.getStrategy().paceKind === "instructor_paced", "runtime holds strategy");
  assert(typeof runtime.canSubmit === "function", "runtime exposes canSubmit");

  const ctx: AssessmentContext = {
    deploymentId: "test-session",
    mode: "live_quiz",
    config: {
      mode: "live_quiz",
      paceKind: "instructor_paced",
      feedbackDelayMs: 2000,
      timerMode: "per_question",
      questionTimerSeconds: 30,
      leaderboardVisibility: "every_question",
      leaderboardEveryN: 5,
      pauseAllowed: true,
      lateJoin: true,
      autoSubmitOnTimerExpiry: false,
      showCorrectAnswer: "yes",
    },
    participant: { participantId: "p1", userId: "u1" },
  };
  assert(runtime.canSubmit(ctx, "q1"), "canSubmit with participant context");
}

function testFutureReadyStrategies() {
  assert(legacyTimerStrategy.id === "legacy", "timer strategy id");
  assert(defaultLeaderboardStrategy.id === "default", "leaderboard strategy id");
  assert(defaultFeedbackStrategy.id === "default", "feedback strategy id");
  assert(
    defaultLeaderboardStrategy.shouldShowAfterAnswer(
      {
        mode: "live_quiz",
        paceKind: "self_paced",
        feedbackDelayMs: 2000,
        timerMode: "per_question",
        questionTimerSeconds: 30,
        leaderboardVisibility: "every_n_questions",
        leaderboardEveryN: 5,
        pauseAllowed: true,
        lateJoin: true,
        autoSubmitOnTimerExpiry: false,
        showCorrectAnswer: "yes",
      },
      { deploymentId: "x", mode: "live_quiz", config: {} as AssessmentContext["config"] },
      4
    ),
    "leaderboard every N at index 4"
  );
}

function testPaceStrategyInterface() {
  const stub: PaceStrategy = {
    paceKind: "async",
    start: async () => ({ kind: "no_op", events: [] }),
    advance: async () => ({ kind: "no_op", events: [] }),
    finish: async () => ({ kind: "no_op", events: [] }),
    pause: async () => ({ kind: "no_op", events: [] }),
    resume: async () => ({ kind: "no_op", events: [] }),
    submit: async () => ({ kind: "no_op", events: [] }),
    canSubmit: () => false,
    getRoomState: async () => ({
      deploymentId: "x",
      status: "lobby",
      paceKind: "async",
      questionCount: 0,
      roomQuestionIndex: null,
      pausedAt: null,
      startedAt: null,
      endedAt: null,
    }),
    getParticipantState: async () => null,
    getProgress: async () => null,
    getRoomProgress: async () => ({
      deploymentId: "x",
      participantCount: 0,
      finishedCount: 0,
      indexDistribution: {},
    }),
  };
  const reg = new PaceStrategyRegistry();
  reg.register(stub);
  assert(reg.get("async").paceKind === "async", "custom pace strategy registrable");
}

async function testProductionPathWired() {
  const fs = await import("node:fs");
  const wsSource = fs.readFileSync(
    new URL("../src/ws/liveSessionServer.ts", import.meta.url),
    "utf8"
  );
  assert(wsSource.includes("routeLiveSubmit"), "WS uses routeLiveSubmit");
  assert(wsSource.includes("participant_state"), "WS sends participant_state");
}

async function main() {
  console.log("A1.7 Phase 1 — architecture contract validation\n");
  testRegistry();
  testRuntimeOrchestration();
  testFutureReadyStrategies();
  testPaceStrategyInterface();
  await testProductionPathWired();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("A1.7 architecture contracts OK (Phase 2 strategies registered, WS wired).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
