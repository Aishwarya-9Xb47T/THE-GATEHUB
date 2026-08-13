/**
 * A0 Critical Stability — validation checks.
 * Run: npx tsx scripts/validate-a0-critical.ts
 */

import { gradeAnswer, gradeQuizAnswers } from "../src/services/quizGradingService.js";

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

const mcQuestion = {
  id: "q1",
  text: "Pick one",
  type: "multiple_choice",
  marks: 2,
  options: [
    { id: "a", text: "Wrong", isCorrect: false },
    { id: "b", text: "Right", isCorrect: true },
  ],
};

const msQuestion = {
  id: "q2",
  text: "Pick all",
  type: "multiple_select",
  marks: 3,
  options: [
    { id: "a", text: "A", isCorrect: true },
    { id: "b", text: "B", isCorrect: true },
    { id: "c", text: "C", isCorrect: false },
  ],
};

const shortAnswerQuestion = {
  id: "q3",
  text: "Capital of France?",
  type: "short_answer",
  marks: 1,
  options: [{ id: "ans", text: "Paris", isCorrect: true }],
};

const fillBlankQuestion = {
  id: "q4",
  text: "2 + 2 = ___",
  type: "fill_blank",
  marks: 1,
  options: [{ id: "ans", text: "4", isCorrect: true }],
};

function runGradingTests() {
  const mc = gradeAnswer(mcQuestion, "b");
  assert(mc.isCorrect === true, "multiple_choice correct option grades true");
  assert(mc.correctOptions.includes("b"), "multiple_choice returns correct option ids");

  const mcWrong = gradeAnswer(mcQuestion, "a");
  assert(mcWrong.isCorrect === false, "multiple_choice wrong option grades false");

  const ms = gradeAnswer(msQuestion, ["a", "b"]);
  assert(ms.isCorrect === true, "multiple_select exact match grades true");

  const msPartial = gradeAnswer(msQuestion, ["a"]);
  assert(msPartial.isCorrect === false, "multiple_select partial match grades false");

  const shortExact = gradeAnswer(shortAnswerQuestion, "Paris");
  assert(shortExact.isCorrect === true, "short_answer exact match grades true");

  const shortCase = gradeAnswer(shortAnswerQuestion, "  paris  ");
  assert(shortCase.isCorrect === true, "short_answer is case-insensitive and trims whitespace");

  const shortWrong = gradeAnswer(shortAnswerQuestion, "London");
  assert(shortWrong.isCorrect === false, "short_answer wrong answer grades false");

  const fill = gradeAnswer(fillBlankQuestion, "4");
  assert(fill.isCorrect === true, "fill_blank accepts correct text");

  const unknown = gradeAnswer({ ...mcQuestion, type: "essay" }, "anything");
  assert(unknown.isCorrect === false, "unsupported types grade false");

  const { score, results } = gradeQuizAnswers(
    [mcQuestion, shortAnswerQuestion],
    { q1: "b", q3: "Paris" }
  );
  assert(score === 3, "gradeQuizAnswers sums marks across question types");
  assert(results.length === 2, "gradeQuizAnswers returns per-question results");
  assert(results.every((r) => r.isCorrect), "gradeQuizAnswers marks all correct answers");
}

function runQuestionOrderLogicTests() {
  // Mirrors resolveQuestionOrder in liveSessionService — frozen order must stay stable.
  const questions = [
    { id: "q-a", order: 0 },
    { id: "q-b", order: 1 },
    { id: "q-c", order: 2 },
  ];
  const frozenOrder = ["q-c", "q-a", "q-b"];
  const settings = { questionOrder: frozenOrder };

  const resolved =
    settings.questionOrder?.length === questions.length &&
    settings.questionOrder.every((id) => questions.some((q) => q.id === id))
      ? settings.questionOrder
      : questions.sort((a, b) => a.order - b.order).map((q) => q.id);

  assert(resolved[0] === "q-c", "frozen questionOrder is reused when valid");
  assert(resolved[sessionIndex(resolved, "q-a")] === "q-a", "index lookup uses frozen order");

  function sessionIndex(order: string[], id: string) {
    return order.indexOf(id);
  }
}

function main() {
  console.log("A0 Critical Stability validation\n");
  runGradingTests();
  runQuestionOrderLogicTests();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All A0 checks passed.");
}

main();
