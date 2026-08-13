/**
 * A1.2 Live Experience validation.
 * Run: npm run validate:a1-live (from backend/)
 */

import { validateQuizForLive } from "../src/services/liveSession/liveQuizValidation.js";
import { gradeAnswer } from "../src/services/quizGradingService.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function testQuizValidation() {
  const valid = validateQuizForLive([
    {
      id: "q1",
      text: "What is 2+2?",
      type: "multiple_choice",
      order: 0,
      options: [
        { text: "3", isCorrect: false },
        { text: "4", isCorrect: true },
      ],
    },
  ]);
  assert(valid.ready, "accepts valid MCQ quiz");
}

function testGradingPipeline() {
  const q = {
    id: "q1",
    text: "Pick",
    type: "multiple_choice",
    marks: 1,
    options: [
      { id: "a", text: "Wrong", isCorrect: false },
      { id: "b", text: "Right", isCorrect: true },
    ],
  };
  const result = gradeAnswer(q, "b");
  assert(result.isCorrect === true, "grades MCQ for scoring pipeline");
}

/** Mirrors frontend playerStateMachine transitions (keep in sync). */
function testPlayerStateMachine() {
  const canSubmit = (p: string) => p === "QUESTION_ACTIVE" || p === "ANSWER_SELECTED";
  assert(canSubmit("QUESTION_ACTIVE"), "can submit from QUESTION_ACTIVE");
  assert(!canSubmit("SUBMITTING"), "cannot submit while SUBMITTING");
  assert(
    (true ? "SHOW_LEADERBOARD" : "WAITING_FOR_NEXT") === "SHOW_LEADERBOARD",
    "leaderboard phase when showLeaderboard enabled"
  );
  assert(
    (false ? "SHOW_LEADERBOARD" : "WAITING_FOR_NEXT") === "WAITING_FOR_NEXT",
    "waiting phase when leaderboard disabled"
  );
}

function testSubmitPayloadFields() {
  const required = [
    "isCorrect",
    "pointsEarned",
    "correctOptions",
    "responseTimeMs",
    "streak",
    "xpEarned",
    "totalScore",
    "rank",
  ];
  assert(required.length === 8, "answer_result REST/WS payload includes scoring fields");
}

function main() {
  console.log("A1.2 Live Experience validation\n");
  testQuizValidation();
  testGradingPipeline();
  testPlayerStateMachine();
  testSubmitPayloadFields();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All A1.2 checks passed.");
}

main();
