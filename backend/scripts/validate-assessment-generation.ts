/**
 * Assessment generation — regression tests for question count fidelity.
 * Run: npx tsx scripts/validate-assessment-generation.ts
 */

import {
  validateQuizGenerationConfiguration,
  resolveTypeDistribution,
  expandTypeSequence,
  alignQuestionsToSpec,
  assembleQuestionsFromTypeBuckets,
  buildGenerationCoverage,
  computeMaxTokensForQuestionCount,
  generateAssessment,
} from "../src/services/assessmentGeneration/assessmentGenerationService.js";
import { generateOfflineDemoQuestions } from "../src/services/assessmentStudio/aiAssessment/aiOfflineGenerator.js";
import type { AiAssessmentConfig, AiGeneratedQuestion } from "../src/services/assessmentStudio/aiAssessment/types.js";
import { randomUUID } from "crypto";

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

function baseConfig(overrides: Partial<AiAssessmentConfig> = {}): AiAssessmentConfig {
  return {
    quizName: "Test Quiz",
    subject: "Computer Science",
    topic: "Data structures",
    questionCount: 10,
    questionTypes: ["multiple_choice"],
    questionTypeDistribution: { multiple_choice: 10 },
    ...overrides,
  };
}

function mockQuestions(count: number, types?: string[]): AiGeneratedQuestion[] {
  return Array.from({ length: count }, (_, i) => ({
    id: randomUUID(),
    stem: `Question ${i + 1} about data structures`,
    type: types?.[i] || "multiple_choice",
    difficulty: "medium",
    bloomLevel: "L3",
    options: [
      { text: "A", isCorrect: true },
      { text: "B", isCorrect: false },
    ],
    selected: true,
    confidence: 0.9,
    estimatedSeconds: 60,
    marks: 1,
  }));
}

function runValidationTests() {
  const valid = validateQuizGenerationConfiguration(baseConfig({ questionCount: 20, questionTypeDistribution: { multiple_choice: 12, true_false: 8 } }));
  assert(valid.valid, "valid config passes");

  const mismatch = validateQuizGenerationConfiguration(baseConfig({ questionCount: 20, questionTypeDistribution: { multiple_choice: 10, true_false: 5 } }));
  assert(!mismatch.valid, "mismatched distribution fails");
  assert(Boolean(mismatch.error?.includes("20")), "mismatch error mentions total");
}

function runDistributionTests() {
  const dist = resolveTypeDistribution(baseConfig({
    questionCount: 30,
    questionTypeDistribution: { multiple_choice: 12, true_false: 8, multiple_select: 5, essay: 3, ordering: 2 },
  }));
  assert(dist.multiple_choice === 12, "MCQ count preserved");
  assert(dist.ordering === 2, "ordering count preserved");
  assert(Object.values(dist).reduce((a, b) => a + b, 0) === 30, "distribution sums to total");

  const seq = expandTypeSequence(baseConfig({
    questionCount: 5,
    questionTypeDistribution: { multiple_choice: 3, true_false: 2 },
  }));
  assert(seq.length === 5, "type sequence length matches total");
  assert(seq.filter((t) => t === "true_false").length === 2, "type sequence respects counts");
}

function runOfflineGeneratorTests() {
  for (const count of [5, 10, 25, 50]) {
    const questions = generateOfflineDemoQuestions(baseConfig({
      questionCount: count,
      questionTypeDistribution: { multiple_choice: count },
    }));
    assert(questions.length === count, `offline generator produces ${count} questions`);
  }

  const mixed = generateOfflineDemoQuestions(baseConfig({
    questionCount: 30,
    questionTypeDistribution: { multiple_choice: 12, true_false: 8, multiple_select: 5, essay: 3, ordering: 2 },
  }));
  assert(mixed.length === 30, "offline mixed types produces 30");
  assert(mixed.filter((q) => q.type === "essay").length === 3, "offline essay count exact");
}

function runAlignTests() {
  const config = baseConfig({
    questionCount: 20,
    questionTypeDistribution: { multiple_choice: 12, true_false: 8 },
  });
  const raw = mockQuestions(22);
  const aligned = alignQuestionsToSpec(raw, config);
  assert(aligned.length === 20, "extras discarded when AI returns too many");
  assert(aligned.filter((q) => q.type === "true_false").length === 8, "aligned types match distribution");

  const short = mockQuestions(18);
  const alignedShort = alignQuestionsToSpec(short, config);
  assert(alignedShort.length === 18, "short batch not padded without fill");
}

function runAssembleTests() {
  const config = baseConfig({
    questionCount: 30,
    questionTypeDistribution: { multiple_choice: 12, true_false: 8, multiple_select: 5, essay: 3, ordering: 2 },
  });
  const assembled = assembleQuestionsFromTypeBuckets(
    {
      multiple_choice: mockQuestions(12, ["multiple_choice"]),
      true_false: mockQuestions(8, ["true_false"]),
      multiple_select: mockQuestions(5, ["multiple_select"]),
      essay: mockQuestions(3, ["essay"]),
      ordering: mockQuestions(2, ["ordering"]),
    },
    config
  );
  assert(assembled.length === 30, "assembled bucket count matches total");
  assert(assembled.filter((q) => q.type === "essay").length === 3, "assembled essay count exact");
}

function runTokenBudgetTests() {
  assert(computeMaxTokensForQuestionCount(5) >= 3300, "token budget scales for small sets");
  assert(computeMaxTokensForQuestionCount(50) <= 16384, "token budget capped for large sets");
  assert(computeMaxTokensForQuestionCount(50) > computeMaxTokensForQuestionCount(10), "larger sets get more tokens");
}

function runCoverageTests() {
  const config = baseConfig({ questionCount: 20, questionTypeDistribution: { multiple_choice: 20 } });
  const coverage = buildGenerationCoverage(config, mockQuestions(18));
  assert(coverage.generated === 18, "coverage tracks generated count");
  assert(coverage.requested === 20, "coverage tracks requested count");
  assert(!coverage.isComplete, "incomplete when short");
  assert(coverage.coveragePercent === 90, "coverage percent correct");
}

async function runGenerationIntegrationTests() {
  const result5 = await generateAssessment("Topic: arrays and linked lists", baseConfig({
    questionCount: 5,
    questionTypeDistribution: { multiple_choice: 5 },
  }));
  assert(result5.questions.length === 5, "generateAssessment request 5 → 5");

  const result10 = await generateAssessment("Topic: trees", baseConfig({
    questionCount: 10,
    questionTypeDistribution: { multiple_choice: 6, true_false: 4 },
  }));
  assert(result10.questions.length === 10, "generateAssessment request 10 → 10");

  const result25 = await generateAssessment("Topic: graphs", baseConfig({
    questionCount: 25,
    questionTypeDistribution: { multiple_choice: 15, true_false: 10 },
  }));
  assert(result25.questions.length === 25, "generateAssessment request 25 → 25");

  const result50 = await generateAssessment("Topic: algorithms", baseConfig({
    questionCount: 50,
    questionTypeDistribution: { multiple_choice: 30, true_false: 20 },
  }));
  assert(result50.questions.length === 50, "generateAssessment request 50 → 50");

  const mixed = await generateAssessment("Topic: OOP", baseConfig({
    questionCount: 30,
    questionTypeDistribution: { multiple_choice: 12, true_false: 8, multiple_select: 5, essay: 3, ordering: 2 },
    bloomDistribution: { Remember: 10, Understand: 25, Apply: 30, Analyze: 20, Evaluate: 10, Create: 5 },
    difficultyMix: { easy: 30, medium: 50, hard: 20, expert: 0 },
  }));
  assert(mixed.questions.length === 30, "mixed types request 30 → 30");
  assert(mixed.coverage.isComplete, "mixed generation complete in mock mode");
}

async function main() {
  console.log("Assessment generation validation\n");
  runValidationTests();
  runDistributionTests();
  runOfflineGeneratorTests();
  runAlignTests();
  runAssembleTests();
  runTokenBudgetTests();
  runCoverageTests();
  await runGenerationIntegrationTests();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All assessment generation tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
