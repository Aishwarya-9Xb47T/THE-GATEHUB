/**
 * Phase 1 Module 4 — Question Service integration checks.
 * Run: npx tsx src/assessment-platform/scripts/validate-question-service.ts
 */

import { prisma } from "../../utils/prisma.js";
import { registerBuiltinQuestionPlugins } from "../plugins/registerQuestionPlugins.js";
import {
  createQuestion,
  updateQuestion,
  publishQuestion,
  forkQuestion,
  addQuestionRelation,
  evaluateQuestionAnswer,
  validateQuestionDraft,
} from "../services/questionService.js";
import { importQuestions } from "../services/questionImport.js";
import { createCollection, addQuestionToCollection } from "../services/questionCollectionService.js";
import { hasPlugin } from "../infra/pluginRegistry.js";

registerBuiltinQuestionPlugins();

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

async function cleanup(questionIds: string[], collectionId?: string) {
  for (const qid of questionIds) {
    await prisma.assessQuestionVersion.deleteMany({ where: { questionId: qid } });
    await prisma.assessQuestionRelation.deleteMany({
      where: { OR: [{ parentQuestionId: qid }, { childQuestionId: qid }] },
    });
    await prisma.mediaUsage.deleteMany({ where: { questionId: qid } });
    await prisma.assessQuestionAnalytics.deleteMany({ where: { questionId: qid } });
    await prisma.assessChoice.deleteMany({ where: { questionId: qid } });
    await prisma.assessQuestionCollectionItem.deleteMany({ where: { questionId: qid } });
    await prisma.assessQuestion.deleteMany({ where: { id: qid } });
  }
  if (collectionId) {
    await prisma.assessQuestionCollection.delete({ where: { id: collectionId } });
  }
}

async function main() {
  const instructor = await prisma.user.findFirst({
    where: { role: "instructor" },
    select: { id: true },
  });
  if (!instructor) {
    console.error("No instructor user found.");
    process.exit(1);
  }

  const mcqExists = await prisma.assessQuestionType.findUnique({ where: { slug: "multiple_choice" } });
  if (!mcqExists) {
    console.error("Run seed-question-types.ts first.");
    process.exit(1);
  }

  assert(hasPlugin("questionType", "multiple_choice"), "MCQ plugin registered");
  assert(hasPlugin("questionType", "essay"), "Essay plugin registered");

  const created = await createQuestion(instructor.id, {
    typeSlug: "multiple_choice",
    stem: "Module 4 validation: capital of France?",
    subject: "Geography",
    topic: "Europe",
    difficulty: "easy",
    bloomLevel: "remember",
    tags: ["capitals", "europe"],
    marks: 2,
    choices: [
      { text: "London", isCorrect: false, order: 0 },
      { text: "Paris", isCorrect: true, order: 1 },
      { text: "Berlin", isCorrect: false, order: 2 },
    ],
  });
  assert(created.status === "draft", "created as draft");
  assert(created.version === 1, "initial version 1");

  const questionId = created.id;
  const questionIds = [questionId];

  const validation = await validateQuestionDraft(questionId, instructor.id, "instructor");
  assert(validation.valid, "draft validates");

  const updated = await updateQuestion(questionId, instructor.id, "instructor", {
    stem: "Module 4 validation: capital of France? (revised)",
    difficulty: "medium",
  });
  assert(updated.version === 2, "edit creates version 2");

  const versions = await prisma.assessQuestionVersion.findMany({
    where: { questionId },
    orderBy: { version: "asc" },
  });
  assert(versions.length === 2, "two immutable versions");

  const v1 = versions[0]!;
  const snap = v1.snapshot as { choices: Array<{ id: string; isCorrect: boolean }> };
  const correctId = snap.choices.find((c) => c.isCorrect)?.id;
  const graded = await evaluateQuestionAnswer(v1.id, correctId);
  assert(graded.result.isCorrect === true, "plugin evaluates correct answer");

  const child = await createQuestion(instructor.id, {
    typeSlug: "true_false",
    stem: "Paris is in France",
    choices: [
      { text: "True", isCorrect: true, order: 0 },
      { text: "False", isCorrect: false, order: 1 },
    ],
  });
  questionIds.push(child.id);

  const relation = await addQuestionRelation(
    questionId,
    child.id,
    "follow_up",
    instructor.id,
    "instructor"
  );
  assert(!!relation.id, "relation created");

  const forked = await forkQuestion(questionId, instructor.id, "instructor");
  questionIds.push(forked.id);
  assert(forked.id !== questionId, "fork creates new question");

  const published = await publishQuestion(questionId, instructor.id, "instructor");
  assert(published.status === "published", "published status");

  const importResult = await importQuestions(instructor.id, "json", [
    {
      stem: "Imported question 2+2?",
      typeSlug: "multiple_choice",
      choices: [
        { text: "4", isCorrect: true },
        { text: "5", isCorrect: false },
      ],
    },
  ]);
  assert(importResult.imported === 1, "import pipeline works");
  questionIds.push(...importResult.questionIds);

  const collection = await createCollection(instructor.id, {
    name: "Module 4 Test Bank",
    kind: "department_bank",
  });
  await addQuestionToCollection(collection.id, questionId, instructor.id, "instructor");
  const items = await prisma.assessQuestionCollectionItem.count({
    where: { collectionId: collection.id },
  });
  assert(items === 1, "collection membership");

  const events = await prisma.platformAnalyticsEvent.count({
    where: {
      questionId: { in: questionIds },
      eventType: {
        in: ["QuestionCreated", "QuestionVersionCreated", "QuestionPublished", "QuestionImported"],
      },
    },
  });
  assert(events >= 4, "domain events persisted");

  const search = await prisma.assessQuestion.count({
    where: { authorId: instructor.id, subject: "Geography" },
  });
  assert(search >= 1, "searchable metadata stored");

  await cleanup(questionIds, collection.id);

  console.log(`\nQuestion service validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All question service checks passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
