import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function purgeData() {
  console.log("Starting Production Data Purge (Clearing all demo & sample rows)...");

  try {
    // 1. Delete Student & Assessment Submissions & Attempts
    console.log("Clearing attempts, responses, and submissions...");
    await prisma.quizAttempt.deleteMany({});
    await prisma.assessmentAttempt.deleteMany({});
    await prisma.learningUniverseProjectSubmission.deleteMany({});
    await prisma.learningUniverseComponentSubmission.deleteMany({});
    await prisma.liveParticipant.deleteMany({});
    await prisma.studentWorkspaceSnapshot.deleteMany({});
    await prisma.learningUniverseStepProgress.deleteMany({});

    // 2. Delete Live Sessions & Deployments
    console.log("Clearing live sessions and deployments...");
    await prisma.liveSession.deleteMany({});
    await prisma.assessmentDeployment.deleteMany({});

    // 3. Delete Universal Assessment Platform Data
    console.log("Clearing universal assessment platform data...");
    await prisma.assessQuestionCollectionItem.deleteMany({});
    await prisma.assessQuestionVersion.deleteMany({});
    await prisma.assessQuestion.deleteMany({});
    await prisma.assessmentVersion.deleteMany({});
    await prisma.assessment.deleteMany({});

    // 4. Delete Quizzes & Questions
    console.log("Clearing quizzes, questions, options...");
    await prisma.option.deleteMany({});
    await prisma.question.deleteMany({});
    await prisma.quiz.deleteMany({});

    // 5. Delete Assessment Studio Bank Data & Import Jobs
    console.log("Clearing assessment studio question bank and import jobs...");
    await prisma.bankQuestionReview.deleteMany({});
    await prisma.bankQuestion.deleteMany({});
    await prisma.bankQuestionCollectionItem.deleteMany({});
    await prisma.bankQuestionCollection.deleteMany({});
    await prisma.bankQuestionImportJob.deleteMany({});

    // 6. Delete Learning Universes
    console.log("Clearing learning universes...");
    await prisma.learningUniverseCertificate.deleteMany({});
    await prisma.learningUniverseEnrollment.deleteMany({});
    await prisma.learningUniverseLesson.deleteMany({});
    await prisma.learningUniverseModule.deleteMany({});
    await prisma.learningUniverseProject.deleteMany({});
    await prisma.learningUniverse.deleteMany({});

    // 7. Delete Notes & LaTeX Projects
    console.log("Clearing notes and LaTeX projects...");
    await prisma.studentNote.deleteMany({});
    await prisma.latexCollaborator.deleteMany({});
    await prisma.latexProjectVersion.deleteMany({});
    await prisma.latexProjectTimelineEvent.deleteMany({});
    await prisma.latexDocument.deleteMany({});
    await prisma.latexProject.deleteMany({});

    // 8. Delete Enrollments, Reviews, Commerce Data
    console.log("Clearing enrollments, reviews, payments, orders...");
    await prisma.enrollment.deleteMany({});
    await prisma.certificate.deleteMany({});
    await prisma.review.deleteMany({});
    await prisma.wishlistItem.deleteMany({});
    await prisma.cartItem.deleteMany({});
    await prisma.cart.deleteMany({});
    await prisma.orderItem.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.payoutWithdrawal.deleteMany({});
    await prisma.instructorPayoutProfile.deleteMany({});
    await prisma.refundRequest.deleteMany({});
    await prisma.referral.deleteMany({});
    await prisma.referralCode.deleteMany({});
    await prisma.giftPurchase.deleteMany({});

    // 9. Delete Courses & Lectures
    console.log("Clearing courses, sections, lectures...");
    await prisma.lecture.deleteMany({});
    await prisma.section.deleteMany({});
    await prisma.course.deleteMany({});

    // 10. Delete Activity Logs, Notifications, Sessions
    console.log("Clearing notifications, logs, sessions...");
    await prisma.notification.deleteMany({});
    await prisma.adminAuditLog.deleteMany({});
    await prisma.userSession.deleteMany({});
    await prisma.loginHistory.deleteMany({});
    await prisma.userIntegration.deleteMany({});
    await prisma.xPTransaction.deleteMany({});

    // 11. Delete Uploaded Media Asset Metadata
    console.log("Clearing media asset records...");
    await prisma.mediaAsset.deleteMany({});

    console.log("SUCCESS: All demo, sample, and test rows purged successfully.");
  } catch (err) {
    console.error("Error purging database rows:", err);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

purgeData();
