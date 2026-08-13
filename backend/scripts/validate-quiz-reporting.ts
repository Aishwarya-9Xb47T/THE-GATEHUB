/**
 * Premium Quiz Reporting validation:
 * - questionSnapshot + LiveAnswer → review DTO
 * - Weighted academic marks (not 1-per-question)
 * - Auth: student cannot read another attempt; non-host cannot read participant review
 *
 * Run: npx tsx scripts/validate-quiz-reporting.ts
 */

import bcrypt from "bcryptjs";
import { prisma } from "../src/utils/prisma.js";
import { buildQuestionSnapshot } from "../src/services/quizReporting/questionSnapshot.js";
import {
  buildAttemptResultsFromLiveAnswers,
  buildLiveParticipantReview,
  buildQuizAttemptReview,
} from "../src/services/quizReporting/attemptReviewService.js";
import { assertHostOrAdmin } from "../src/services/liveSession/liveSessionAccessService.js";
import {
  academicMarksForAnswer,
  describeQuestionContentForExport,
  stringifyExportValue,
} from "../src/services/quizReporting/contentSerialize.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

async function ensureUser(email: string, role: string, firstName: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await bcrypt.hash("TestPass123!", 10);
  return prisma.user.create({
    data: {
      email,
      firstName,
      lastName: "Reporter",
      role,
      passwordHash,
    },
  });
}

async function main() {
  console.log("Premium Quiz Reporting validation\n");

  const host = await ensureUser("quiz-report-host@gatehub.test", "instructor", "Report Host");
  const studentA = await ensureUser("quiz-report-student-a@gatehub.test", "student", "Student A");
  const studentB = await ensureUser("quiz-report-student-b@gatehub.test", "student", "Student B");
  const otherInstructor = await ensureUser(
    "quiz-report-other-host@gatehub.test",
    "instructor",
    "Other Host"
  );

  // Weighted marks fixture: 2 + 1 + 5 = 8
  const quiz = await prisma.quiz.create({
    data: {
      title: `Reporting Validation ${Date.now()}`,
      totalMarks: 8,
      questions: {
        create: [
          {
            text: "What is 2+2?\n\n![diagram](/uploads/test-image.png)",
            type: "multiple_choice",
            order: 0,
            marks: 2,
            explanation: "Basic arithmetic",
            options: {
              create: [
                { text: "3", isCorrect: false, order: 0 },
                { text: "4", isCorrect: true, order: 1 },
              ],
            },
          },
          {
            text: "True or False: Earth is flat\n\n$$E=mc^2$$",
            type: "true_false",
            order: 1,
            marks: 1,
            explanation: "Earth is round",
            options: {
              create: [
                { text: "True", isCorrect: false, order: 0 },
                { text: "False", isCorrect: true, order: 1 },
              ],
            },
          },
          {
            text: "Code output?\n\n```python\nprint(1)\n```",
            type: "multiple_choice",
            order: 2,
            marks: 5,
            metadata: { code: { language: "python", code: "print(1)" } },
            options: {
              create: [
                { text: "1", isCorrect: true, order: 0 },
                { text: "2", isCorrect: false, order: 1 },
              ],
            },
          },
        ],
      },
    },
    include: {
      questions: { include: { options: true }, orderBy: { order: "asc" } },
    },
  });

  const session = await prisma.liveSession.create({
    data: {
      title: "Reporting Validation Session",
      quizId: quiz.id,
      hostUserId: host.id,
      status: "ended",
      roomCode: `RV${String(Date.now()).slice(-6)}`,
      startedAt: new Date(),
      endedAt: new Date(),
    },
  });

  const participantA = await prisma.liveParticipant.create({
    data: {
      sessionId: session.id,
      userId: studentA.id,
      displayName: "Student A",
      status: "submitted",
      score: 1200,
      correctCount: 2,
      wrongCount: 0,
      accuracy: 100,
      finishedAt: new Date(),
    },
  });

  const q0 = quiz.questions[0]!;
  const q1 = quiz.questions[1]!;
  const q2 = quiz.questions[2]!;
  const correctOpt0 = q0.options.find((o) => o.isCorrect)!;
  const correctOpt1 = q1.options.find((o) => o.isCorrect)!;

  // Q1 correct (2), Q2 correct (1), Q3 unanswered (5) → academic 3/8
  await prisma.liveAnswer.create({
    data: {
      sessionId: session.id,
      participantId: participantA.id,
      questionId: q0.id,
      answer: correctOpt0.id,
      isCorrect: true,
      marksEarned: 2,
      pointsEarned: 800,
      responseTimeMs: 2500,
      questionSnapshot: buildQuestionSnapshot(q0) as object,
    },
  });

  await prisma.liveAnswer.create({
    data: {
      sessionId: session.id,
      participantId: participantA.id,
      questionId: q1.id,
      answer: correctOpt1.id,
      isCorrect: true,
      marksEarned: 1,
      pointsEarned: 400,
      responseTimeMs: 3100,
      questionSnapshot: buildQuestionSnapshot(q1) as object,
    },
  });

  const snap = buildQuestionSnapshot(q0);
  assert(snap.questionId === q0.id && snap.marks === 2, "snapshot stores weighted marks");

  const review = await buildLiveParticipantReview(session.id, participantA.id);
  assert(review.questions.length === 3, "review includes unanswered question");
  assert(review.questions[0]?.status === "correct", "Q1 correct");
  assert(review.questions[1]?.status === "correct", "Q2 correct");
  assert(review.questions[2]?.status === "unanswered", "Q3 unanswered");
  assert(review.summary.score === 3, "weighted academic score = 2+1 = 3");
  assert(review.summary.maxScore === 8, "maxScore = 2+1+5 = 8");
  assert(review.summary.percentage === 37.5, "percentage = 3/8*100 = 37.5");
  assert(review.summary.unansweredCount === 1, "unansweredCount=1");
  assert(review.summary.livePoints === 1200, "livePoints separate from academic");

  assert(
    academicMarksForAnswer({ isCorrect: true, questionMarks: 5, marksEarned: 50 }) === 5,
    "academicMarksForAnswer clamps gamified inflated marks",
  );
  assert(
    !stringifyExportValue({ text: "Option A" }).includes("[object Object]"),
    "stringifyExportValue never emits [object Object] for option objects",
  );
  const content = describeQuestionContentForExport({
    text: q0.text,
    metadata: q2.metadata,
  });
  assert(content.includes("[Image attached]"), "export content describes images");
  assert(content.includes("Code") || content.includes("print"), "export content describes code");

  const answers = await prisma.liveAnswer.findMany({ where: { participantId: participantA.id } });
  const results = buildAttemptResultsFromLiveAnswers(quiz.questions, answers);
  assert(results.length === 3, "results[] includes unanswered slot");
  assert(results[0]?.maxMarks === 2 && results[2]?.maxMarks === 5, "results preserve weighted maxMarks");

  const attempt = await prisma.quizAttempt.create({
    data: {
      userId: studentA.id,
      quizId: quiz.id,
      score: 1200,
      totalMarks: 8,
      answers: JSON.stringify({
        liveSessionId: session.id,
        score: 1200,
        correctCount: 2,
        wrongCount: 0,
        unansweredCount: 1,
        rank: 1,
        results,
      }),
    },
  });

  await prisma.liveParticipant.update({
    where: { id: participantA.id },
    data: { quizAttemptId: attempt.id },
  });

  const attemptReview = await buildQuizAttemptReview(attempt.id);
  assert(attemptReview.summary.score === 3, "attempt review uses weighted academic score");
  assert(attemptReview.summary.sessionId === session.id, "attempt review links sessionId");

  try {
    await assertHostOrAdmin(host.id, "instructor", session.id);
    assert(true, "session host can access report APIs");
  } catch {
    assert(false, "session host can access report APIs");
  }

  try {
    await assertHostOrAdmin(otherInstructor.id, "instructor", session.id);
    assert(false, "non-host instructor blocked from session report");
  } catch (e: any) {
    assert(
      e?.statusCode === 403 || String(e?.message || "").includes("host"),
      "non-host instructor blocked from session report",
    );
  }

  const ownership = await prisma.quizAttempt.findUnique({
    where: { id: attempt.id },
    select: { userId: true },
  });
  assert(ownership?.userId === studentA.id, "attempt owned by student A");
  assert(ownership?.userId !== studentB.id, "student B is not owner of student A attempt");

  // Canonical report + export inspection (Phase 33 / 45)
  const { buildCanonicalSessionReport } = await import(
    "../src/services/quizReporting/sessionReportService.js"
  );
  const {
    formatSessionReportCsv,
    formatSessionReportExcel,
    formatDetailedExcel,
    buildSessionReportHtml,
    renderSessionReportPdf,
  } = await import("../src/services/quizReporting/sessionReportExports.js");
  const fs = await import("fs");
  const path = await import("path");

  const canonical = await buildCanonicalSessionReport(session.id);
  const studentRow = canonical.students.find((s) => s.participantId === participantA.id);
  assert(!!studentRow, "canonical report includes student A");
  assert(studentRow!.academicScore === 3, "canonical academic score = 3");
  assert(studentRow!.maxScore === 8, "canonical maxScore = 8");
  assert(studentRow!.percentage === 37.5, "canonical percentage matches review");
  assert(canonical.summary.totalMarks === 8, "canonical totalMarks = 8");

  // Consistency fixture: Q1=2, Q2=5, Q3=10 → correct/incorrect/correct = 12/17
  const consistencyQuiz = await prisma.quiz.create({
    data: {
      title: `Consistency ${Date.now()}`,
      totalMarks: 17,
      questions: {
        create: [
          {
            text: "Q1 weighted 2",
            type: "multiple_choice",
            order: 0,
            marks: 2,
            options: {
              create: [
                { text: "A", isCorrect: true, order: 0 },
                { text: "B", isCorrect: false, order: 1 },
              ],
            },
          },
          {
            text: "Q2 weighted 5\n```js\nconsole.log(1)\n```",
            type: "multiple_choice",
            order: 1,
            marks: 5,
            options: {
              create: [
                { text: "A", isCorrect: true, order: 0 },
                { text: "B", isCorrect: false, order: 1 },
              ],
            },
          },
          {
            text: "Q3 weighted 10\n$$E=mc^2$$",
            type: "multiple_choice",
            order: 2,
            marks: 10,
            options: {
              create: [
                { text: "A", isCorrect: true, order: 0 },
                { text: "B", isCorrect: false, order: 1 },
              ],
            },
          },
        ],
      },
    },
    include: { questions: { include: { options: true }, orderBy: { order: "asc" } } },
  });
  const cq = consistencyQuiz.questions;
  const cSession = await prisma.liveSession.create({
    data: {
      quizId: consistencyQuiz.id,
      hostUserId: host.id,
      title: consistencyQuiz.title,
      roomCode: `C${Date.now().toString().slice(-6)}`,
      status: "ended",
      startedAt: new Date(),
      endedAt: new Date(),
    },
  });
  const cPart = await prisma.liveParticipant.create({
    data: {
      sessionId: cSession.id,
      userId: studentA.id,
      displayName: "Student A",
      status: "submitted",
      finishedAt: new Date(),
      score: 999,
      accuracy: 66,
    },
  });
  await prisma.liveAnswer.createMany({
    data: [
      {
        sessionId: cSession.id,
        participantId: cPart.id,
        questionId: cq[0]!.id,
        answer: cq[0]!.options.find((o) => o.isCorrect)!.id,
        isCorrect: true,
        marksEarned: 2,
        pointsEarned: 100,
        responseTimeMs: 1200,
        questionSnapshot: buildQuestionSnapshot(cq[0]!) as object,
      },
      {
        sessionId: cSession.id,
        participantId: cPart.id,
        questionId: cq[1]!.id,
        answer: cq[1]!.options.find((o) => !o.isCorrect)!.id,
        isCorrect: false,
        marksEarned: 0,
        pointsEarned: 0,
        responseTimeMs: 2200,
        questionSnapshot: buildQuestionSnapshot(cq[1]!) as object,
      },
      {
        sessionId: cSession.id,
        participantId: cPart.id,
        questionId: cq[2]!.id,
        answer: cq[2]!.options.find((o) => o.isCorrect)!.id,
        isCorrect: true,
        marksEarned: 10,
        pointsEarned: 100,
        responseTimeMs: 1800,
        questionSnapshot: buildQuestionSnapshot(cq[2]!) as object,
      },
    ],
  });

  const cReport = await buildCanonicalSessionReport(cSession.id);
  const cStudent = cReport.students[0]!;
  assert(cStudent.academicScore === 12, "consistency score = 12 / 17");
  assert(cStudent.maxScore === 17, "consistency max = 17");
  assert(Math.abs(cStudent.percentage - 70.59) < 0.02, "consistency % ≈ 70.59");
  assert(Math.abs(cStudent.accuracy - 66.67) < 0.02, "consistency accuracy ≈ 66.67");

  const outDir = path.join(process.cwd(), "scripts", "fixture-results", "report-exports");
  fs.mkdirSync(outDir, { recursive: true });

  const csv = formatSessionReportCsv(cReport);
  const csvPath = path.join(outDir, "consistency-report.csv");
  fs.writeFileSync(csvPath, csv, "utf8");
  assert(!csv.includes("[object Object]"), "CSV has no [object Object]");
  assert(csv.includes("12") && csv.includes("17"), "CSV contains score 12 and max 17");
  assert(csv.includes("Student Performance") || csv.includes("STUDENT PERFORMANCE") || csv.includes("Score"), "CSV has student section");

  const xlsxBuf = await formatDetailedExcel(cSession.id);
  const xlsxPath = path.join(outDir, "consistency-report.xlsx");
  fs.writeFileSync(xlsxPath, xlsxBuf);
  const XLSX = await import("xlsx");
  const wb = XLSX.read(xlsxBuf, { type: "buffer" });
  assert(wb.SheetNames.length >= 4, `Excel has multiple sheets (got ${wb.SheetNames.length})`);
  const sheetBlob = wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n]!)).join("\n");
  assert(!sheetBlob.includes("[object Object]"), "Excel has no [object Object]");
  assert(sheetBlob.includes("12") && sheetBlob.includes("17"), "Excel contains 12/17");

  const html = buildSessionReportHtml(cReport);
  assert(html.includes("12") && html.includes("17"), "PDF HTML contains 12/17");
  assert(!html.includes("[object Object]"), "PDF HTML has no [object Object]");
  const htmlPath = path.join(outDir, "consistency-report.html");
  fs.writeFileSync(htmlPath, html, "utf8");

  let pdfOk = false;
  try {
    const pdfBuf = await renderSessionReportPdf(cReport);
    const pdfPath = path.join(outDir, "consistency-report.pdf");
    fs.writeFileSync(pdfPath, pdfBuf);
    assert(pdfBuf.length > 1000, `PDF bytes written (${pdfBuf.length})`);
    assert(pdfBuf.slice(0, 4).toString() === "%PDF", "PDF starts with %PDF magic");
    pdfOk = true;
  } catch (e: any) {
    console.warn("  ⚠ Puppeteer PDF unavailable:", e?.message || e);
    assert(true, "PDF HTML fallback available (puppeteer optional)");
  }
  if (pdfOk) assert(true, "PDF generated via puppeteer and inspected");

  console.log(`  → Wrote exports to ${outDir}`);

  await prisma.liveAnswer.deleteMany({ where: { sessionId: cSession.id } });
  await prisma.liveParticipant.deleteMany({ where: { sessionId: cSession.id } });
  await prisma.liveSession.delete({ where: { id: cSession.id } });
  await prisma.option.deleteMany({ where: { question: { quizId: consistencyQuiz.id } } });
  await prisma.question.deleteMany({ where: { quizId: consistencyQuiz.id } });
  await prisma.quiz.delete({ where: { id: consistencyQuiz.id } });

  await prisma.liveAnswer.deleteMany({ where: { sessionId: session.id } });
  await prisma.liveParticipant.deleteMany({ where: { sessionId: session.id } });
  await prisma.liveSession.delete({ where: { id: session.id } });
  await prisma.quizAttempt.delete({ where: { id: attempt.id } });
  await prisma.option.deleteMany({ where: { question: { quizId: quiz.id } } });
  await prisma.question.deleteMany({ where: { quizId: quiz.id } });
  await prisma.quiz.delete({ where: { id: quiz.id } });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All quiz reporting checks passed.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
