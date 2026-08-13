/**
 * Phase 1 Module 3 — Assessment Service integration checks.
 * Run: npx tsx src/assessment-platform/scripts/validate-assessment-service.ts
 */

import { prisma } from "../../utils/prisma.js";
import {
  createAssessment,
  publishAssessment,
  transitionAssessmentLifecycle,
  getAssessmentVersion,
} from "../services/assessmentService.js";
import { isContentFrozen } from "../domain/lifecycle.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

async function cleanup(ids: { assessmentId?: string; userId?: string }) {
  if (ids.assessmentId) {
    await prisma.assessmentVersion.deleteMany({ where: { assessmentId: ids.assessmentId } });
    await prisma.assessmentSection.deleteMany({ where: { assessmentId: ids.assessmentId } });
    await prisma.assessment.deleteMany({ where: { id: ids.assessmentId } });
  }
}

async function main() {
  const instructor = await prisma.user.findFirst({
    where: { role: "instructor" },
    select: { id: true },
  });
  if (!instructor) {
    console.error("No instructor user found — create one first.");
    process.exit(1);
  }

  const mcqType = await prisma.assessQuestionType.findUnique({ where: { slug: "multiple_choice" } });
  if (!mcqType) {
    console.error("Run seed-question-types.ts first.");
    process.exit(1);
  }

  const created = await createAssessment(instructor.id, {
    title: "Module 3 Validation Assessment",
    kind: "formative",
  });
  assert(created.lifecycle === "draft", "created as draft");

  const assessmentId = created.id;

  const section = await prisma.assessmentSection.findFirst({
    where: { assessmentId },
  });
  assert(!!section, "default section created");

  const question = await prisma.assessQuestion.create({
    data: {
      authorId: instructor.id,
      typeId: mcqType.id,
      stem: "What is 2 + 2?",
      choices: {
        create: [
          { text: "3", isCorrect: false, order: 0 },
          { text: "4", isCorrect: true, order: 1 },
        ],
      },
    },
  });

  await prisma.assessmentItem.create({
    data: {
      sectionId: section!.id,
      questionId: question.id,
      order: 0,
      marks: 1,
    },
  });

  await transitionAssessmentLifecycle(assessmentId, instructor.id, "instructor", "submit_for_review");
  const reviewed = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  assert(reviewed?.lifecycle === "review", "transition to review");

  await transitionAssessmentLifecycle(assessmentId, instructor.id, "instructor", "approve");
  const approved = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  assert(approved?.lifecycle === "approved", "transition to approved");

  const published = await publishAssessment(assessmentId, instructor.id, "instructor", "Initial publish");
  assert(published.assessment.lifecycle === "published", "published lifecycle");
  assert(published.version.version === 1, "version 1");
  assert(published.version.snapshot.sections.length >= 1, "snapshot has sections");
  assert(isContentFrozen("published"), "published is frozen");

  const version = await getAssessmentVersion(
    assessmentId,
    published.version.id,
    instructor.id,
    "instructor"
  );
  assert(version.snapshot.totalMarks === 1, "total marks in snapshot");

  const events = await prisma.platformAnalyticsEvent.count({
    where: { assessmentId, eventType: { in: ["AssessmentCreated", "AssessmentPublished"] } },
  });
  assert(events >= 2, "domain events persisted");

  await cleanup({ assessmentId });
  await prisma.assessQuestionVersion.deleteMany({ where: { questionId: question.id } });
  await prisma.assessChoice.deleteMany({ where: { questionId: question.id } });
  await prisma.assessQuestion.delete({ where: { id: question.id } });

  console.log(`\nAssessment service validation: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All assessment service checks passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
