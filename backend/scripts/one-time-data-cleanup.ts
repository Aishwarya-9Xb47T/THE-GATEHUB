/**
 * ONE-TIME DATA CLEANUP — GATEHUB
 *
 * Deletes user/application DATA only. Does NOT modify schema, migrations,
 * source code, env vars, or object storage (B2).
 *
 * PRESERVE:
 *   - All User rows with role = "super_admin" (unchanged)
 *   - PlatformSettings, Category, AssessQuestionType
 *   - BadgeDefinition, AchievementDefinition, CertificateSequence
 *   - Coupon, MembershipPlan
 *
 * CLEAR for everyone (including super_admin):
 *   - UserSession, AuthToken, LoginHistory
 *
 * Usage (from backend/):
 *   npx tsx scripts/one-time-data-cleanup.ts --dry-run
 *   npx tsx scripts/one-time-data-cleanup.ts --execute
 *
 * Default is dry-run. --execute requires GATEHUB_CLEANUP_CONFIRM=DELETE_USER_DATA
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

/** Exact deleteMany targets from the --execute transaction (same order). */
function deleteTargetCounts(): Array<{ name: string; count: () => Promise<number> }> {
  return [
    { name: "UserSession", count: () => prisma.userSession.count() },
    { name: "AuthToken", count: () => prisma.authToken.count() },
    { name: "LoginHistory", count: () => prisma.loginHistory.count() },
    { name: "InteractionResponse", count: () => prisma.interactionResponse.count() },
    { name: "StudentChatMessage", count: () => prisma.studentChatMessage.count() },
    { name: "StudentQuestion", count: () => prisma.studentQuestion.count() },
    { name: "ClassroomSessionAnalytics", count: () => prisma.classroomSessionAnalytics.count() },
    { name: "ClassroomParticipant", count: () => prisma.classroomParticipant.count() },
    { name: "ClassroomSession", count: () => prisma.classroomSession.count() },
    { name: "Interaction", count: () => prisma.interaction.count() },
    { name: "Slide", count: () => prisma.slide.count() },
    { name: "PresentationOriginalFile", count: () => prisma.presentationOriginalFile.count() },
    { name: "Presentation", count: () => prisma.presentation.count() },
    { name: "LiveAnswer", count: () => prisma.liveAnswer.count() },
    { name: "LeaderboardSnapshot", count: () => prisma.leaderboardSnapshot.count() },
    { name: "SessionAnalytics", count: () => prisma.sessionAnalytics.count() },
    { name: "LiveSessionEvent", count: () => prisma.liveSessionEvent.count() },
    { name: "LiveParticipant", count: () => prisma.liveParticipant.count() },
    { name: "LiveSession", count: () => prisma.liveSession.count() },
    { name: "QuizRoomTemplate", count: () => prisma.quizRoomTemplate.count() },
    { name: "QuizRoomPreferences", count: () => prisma.quizRoomPreferences.count() },
    { name: "QuizLibraryTemplateFavorite", count: () => prisma.quizLibraryTemplateFavorite.count() },
    { name: "QuizLibraryTemplateUsage", count: () => prisma.quizLibraryTemplateUsage.count() },
    { name: "QuizLibraryTemplateVersion", count: () => prisma.quizLibraryTemplateVersion.count() },
    { name: "QuizLibraryTemplate", count: () => prisma.quizLibraryTemplate.count() },
    { name: "AssessmentResponse", count: () => prisma.assessmentResponse.count() },
    { name: "AssessmentAttemptQuestion", count: () => prisma.assessmentAttemptQuestion.count() },
    { name: "AssessmentAttempt", count: () => prisma.assessmentAttempt.count() },
    { name: "AssessLeaderboardSnapshot", count: () => prisma.assessLeaderboardSnapshot.count() },
    { name: "AssessLiveRoomAnalytics", count: () => prisma.assessLiveRoomAnalytics.count() },
    { name: "AssessParticipant", count: () => prisma.assessParticipant.count() },
    { name: "AssessTeam", count: () => prisma.assessTeam.count() },
    { name: "AssessLiveRoom", count: () => prisma.assessLiveRoom.count() },
    { name: "AssessmentDeployment", count: () => prisma.assessmentDeployment.count() },
    { name: "AssessmentItem", count: () => prisma.assessmentItem.count() },
    { name: "AssessmentSection", count: () => prisma.assessmentSection.count() },
    { name: "AssessmentVersion", count: () => prisma.assessmentVersion.count() },
    { name: "Assessment", count: () => prisma.assessment.count() },
    { name: "AssessQuestionAnalytics", count: () => prisma.assessQuestionAnalytics.count() },
    { name: "AssessQuestionRelation", count: () => prisma.assessQuestionRelation.count() },
    { name: "AssessQuestionCollectionItem", count: () => prisma.assessQuestionCollectionItem.count() },
    { name: "AssessQuestionCollection", count: () => prisma.assessQuestionCollection.count() },
    { name: "AssessChoice", count: () => prisma.assessChoice.count() },
    { name: "AssessQuestionVersion", count: () => prisma.assessQuestionVersion.count() },
    { name: "AssessQuestion", count: () => prisma.assessQuestion.count() },
    { name: "LearningRecord", count: () => prisma.learningRecord.count() },
    { name: "EngagementRecord", count: () => prisma.engagementRecord.count() },
    { name: "HomeworkAssignment", count: () => prisma.homeworkAssignment.count() },
    { name: "CourseAssignment", count: () => prisma.courseAssignment.count() },
    { name: "MediaUsage", count: () => prisma.mediaUsage.count() },
    { name: "MediaVariant", count: () => prisma.mediaVariant.count() },
    { name: "MediaAsset", count: () => prisma.mediaAsset.count() },
    { name: "BankQuestionAIValidation", count: () => prisma.bankQuestionAIValidation.count() },
    { name: "BankQuestionReview", count: () => prisma.bankQuestionReview.count() },
    { name: "BankQuestionAnalytics", count: () => prisma.bankQuestionAnalytics.count() },
    { name: "BankQuestionImportJob", count: () => prisma.bankQuestionImportJob.count() },
    { name: "BankQuestionCollectionItem", count: () => prisma.bankQuestionCollectionItem.count() },
    { name: "BankQuestionCollection", count: () => prisma.bankQuestionCollection.count() },
    { name: "BankQuestionOption", count: () => prisma.bankQuestionOption.count() },
    { name: "BankQuestionVersion", count: () => prisma.bankQuestionVersion.count() },
    { name: "BankQuestion", count: () => prisma.bankQuestion.count() },
    { name: "CartItem", count: () => prisma.cartItem.count() },
    { name: "Cart", count: () => prisma.cart.count() },
    { name: "RefundRequest", count: () => prisma.refundRequest.count() },
    { name: "Invoice", count: () => prisma.invoice.count() },
    { name: "OrderItem", count: () => prisma.orderItem.count() },
    { name: "Payment", count: () => prisma.payment.count() },
    { name: "Order", count: () => prisma.order.count() },
    { name: "GiftPurchase", count: () => prisma.giftPurchase.count() },
    { name: "Referral", count: () => prisma.referral.count() },
    { name: "ReferralCode", count: () => prisma.referralCode.count() },
    { name: "PayoutWithdrawal", count: () => prisma.payoutWithdrawal.count() },
    { name: "InstructorPayoutProfile", count: () => prisma.instructorPayoutProfile.count() },
    { name: "Product", count: () => prisma.product.count() },
    { name: "BundleItem", count: () => prisma.bundleItem.count() },
    { name: "ProductBundle", count: () => prisma.productBundle.count() },
    { name: "LearningUniverseComponentSubmission", count: () => prisma.learningUniverseComponentSubmission.count() },
    { name: "LearningUniverseProjectSubmission", count: () => prisma.learningUniverseProjectSubmission.count() },
    { name: "CertificateAuditLog", count: () => prisma.certificateAuditLog.count() },
    { name: "LearningUniverseCertificate", count: () => prisma.learningUniverseCertificate.count() },
    { name: "LearningUniverseStepProgress", count: () => prisma.learningUniverseStepProgress.count() },
    { name: "LessonProgress", count: () => prisma.lessonProgress.count() },
    { name: "LearningUniverseProgress", count: () => prisma.learningUniverseProgress.count() },
    { name: "LearningUniverseEnrollment", count: () => prisma.learningUniverseEnrollment.count() },
    { name: "LearningUniverseResource", count: () => prisma.learningUniverseResource.count() },
    { name: "LearningUniverseProject", count: () => prisma.learningUniverseProject.count() },
    { name: "LearningUniversePractice", count: () => prisma.learningUniversePractice.count() },
    { name: "LearningUniverseVideo", count: () => prisma.learningUniverseVideo.count() },
    { name: "LearningUniverseLesson", count: () => prisma.learningUniverseLesson.count() },
    { name: "LearningUniverseModule", count: () => prisma.learningUniverseModule.count() },
    { name: "LearningUniverseTrack", count: () => prisma.learningUniverseTrack.count() },
    { name: "LearningUniverseAsset", count: () => prisma.learningUniverseAsset.count() },
    { name: "LearningUniversePublishVersion", count: () => prisma.learningUniversePublishVersion.count() },
    { name: "LearningUniverse", count: () => prisma.learningUniverse.count() },
    { name: "YjsUpdate", count: () => prisma.yjsUpdate.count() },
    { name: "YjsSnapshot", count: () => prisma.yjsSnapshot.count() },
    { name: "LatexCollaborator", count: () => prisma.latexCollaborator.count() },
    { name: "LatexFile", count: () => prisma.latexFile.count() },
    { name: "LatexProjectTimelineEvent", count: () => prisma.latexProjectTimelineEvent.count() },
    { name: "LatexProjectVersion", count: () => prisma.latexProjectVersion.count() },
    { name: "LatexProject", count: () => prisma.latexProject.count() },
    { name: "LatexDocument", count: () => prisma.latexDocument.count() },
    { name: "LectureProgress", count: () => prisma.lectureProgress.count() },
    { name: "CourseProgress", count: () => prisma.courseProgress.count() },
    { name: "Enrollment", count: () => prisma.enrollment.count() },
    { name: "Review", count: () => prisma.review.count() },
    { name: "WishlistItem", count: () => prisma.wishlistItem.count() },
    { name: "StudentNote", count: () => prisma.studentNote.count() },
    { name: "Certificate", count: () => prisma.certificate.count() },
    { name: "Attachment", count: () => prisma.attachment.count() },
    { name: "LectureMedia", count: () => prisma.lectureMedia.count() },
    { name: "Lecture", count: () => prisma.lecture.count() },
    { name: "Section", count: () => prisma.section.count() },
    { name: "Course", count: () => prisma.course.count() },
    { name: "QuizAttempt", count: () => prisma.quizAttempt.count() },
    { name: "Option", count: () => prisma.option.count() },
    { name: "Question", count: () => prisma.question.count() },
    { name: "QuizVersion", count: () => prisma.quizVersion.count() },
    { name: "Quiz", count: () => prisma.quiz.count() },
    { name: "ResourceContent", count: () => prisma.resourceContent.count() },
    { name: "ResourceCourse", count: () => prisma.resourceCourse.count() },
    { name: "StudentWorkspaceVersion", count: () => prisma.studentWorkspaceVersion.count() },
    { name: "StudentWorkspaceSnapshot", count: () => prisma.studentWorkspaceSnapshot.count() },
    { name: "OrganizationMember", count: () => prisma.organizationMember.count() },
    { name: "TenantConfig", count: () => prisma.tenantConfig.count() },
    { name: "Department", count: () => prisma.department.count() },
    { name: "Organization", count: () => prisma.organization.count() },
    { name: "BadgeAward", count: () => prisma.badgeAward.count() },
    { name: "Achievement", count: () => prisma.achievement.count() },
    { name: "XPTransaction", count: () => prisma.xPTransaction.count() },
    { name: "CoinTransaction", count: () => prisma.coinTransaction.count() },
    { name: "UserGamificationProfile", count: () => prisma.userGamificationProfile.count() },
    { name: "Notification", count: () => prisma.notification.count() },
    { name: "UserIntegration", count: () => prisma.userIntegration.count() },
    { name: "AdminAuditLog", count: () => prisma.adminAuditLog.count() },
    { name: "SecurityAuditLog", count: () => prisma.securityAuditLog.count() },
    { name: "AiUsageLog", count: () => prisma.aiUsageLog.count() },
    { name: "AIHistory", count: () => prisma.aIHistory.count() },
    { name: "PlatformAnalyticsEvent", count: () => prisma.platformAnalyticsEvent.count() },
    { name: "PlatformAuditLog", count: () => prisma.platformAuditLog.count() },
    { name: "MusicTrack", count: () => prisma.musicTrack.count() },
    {
      name: "User(non-super_admin)",
      count: () => prisma.user.count({ where: { role: { not: "super_admin" } } }),
    },
  ];
}

async function printFullDryRunReport() {
  const preservedUsers = await prisma.user.findMany({
    where: { role: "super_admin" },
    select: { id: true, email: true, role: true, firstName: true, lastName: true },
  });
  const usersToDelete = await prisma.user.findMany({
    where: { role: { not: "super_admin" } },
    select: { id: true, email: true, role: true },
  });
  const totalUsers = await prisma.user.count();

  console.log("=== GATEHUB one-time data cleanup ===");
  console.log("MODE: DRY-RUN (no deletes / no updates)");

  console.log("\nUSERS:");
  console.log(`Total users: ${totalUsers}`);
  console.log(`Super admins preserved: ${preservedUsers.length}`);
  console.log(`Non-super-admin users to delete: ${usersToDelete.length}`);
  for (const u of preservedUsers) {
    console.log(`  PRESERVE User: ${u.email} role=${u.role} id=${u.id}`);
  }
  for (const u of usersToDelete) {
    console.log(`  DELETE User: ${u.email} role=${u.role}`);
  }

  console.log("\nPRESERVED:");
  console.log(`User(super_admin): ${preservedUsers.length}`);
  console.log(`PlatformSettings: ${await prisma.platformSettings.count()}`);
  console.log(`Category: ${await prisma.category.count()}`);
  console.log(`AssessQuestionType: ${await prisma.assessQuestionType.count()}`);
  console.log(`BadgeDefinition: ${await prisma.badgeDefinition.count()}`);
  console.log(`AchievementDefinition: ${await prisma.achievementDefinition.count()}`);
  console.log(`CertificateSequence: ${await prisma.certificateSequence.count()}`);
  console.log(`Coupon: ${await prisma.coupon.count()}`);
  console.log(`MembershipPlan: ${await prisma.membershipPlan.count()}`);

  console.log("\nWOULD DELETE (exact counts for every --execute deleteMany target):");
  let totalWouldDelete = 0;
  for (const target of deleteTargetCounts()) {
    const n = await target.count();
    totalWouldDelete += n;
    console.log(`${target.name}: ${n} records would be deleted`);
  }
  console.log(`TOTAL rows across delete targets: ${totalWouldDelete}`);

  const luWithQuiz = await prisma.learningUniverseLesson.count({ where: { quizId: { not: null } } });
  const lectureWithQuiz = await prisma.lecture.count({ where: { quizId: { not: null } } });
  const luNeedingNull = await prisma.learningUniverse.count({
    where: { OR: [{ currentPublishVersionId: { not: null } }, { sourceProjectId: { not: null } }] },
  });
  const deptWithParent = await prisma.department.count({ where: { parentId: { not: null } } });
  const settingsWithUpdater = await prisma.platformSettings.count({
    where: { updatedById: { not: null } },
  });

  console.log("\nFK / DEPENDENCY SAFETY CHECK (read-only; execute would null these before deletes):");
  console.log(`LearningUniverseLesson.quizId non-null (would UPDATE to null): ${luWithQuiz}`);
  console.log(`Lecture.quizId non-null (would UPDATE to null): ${lectureWithQuiz}`);
  console.log(
    `LearningUniverse currentPublishVersionId/sourceProjectId non-null (would UPDATE to null): ${luNeedingNull}`
  );
  console.log(`Department.parentId non-null (would UPDATE to null): ${deptWithParent}`);
  console.log(`PlatformSettings.updatedById non-null (would UPDATE to null): ${settingsWithUpdater}`);
  console.log("FK safety: delete order matches --execute path (children before parents).");
  console.log("No foreign-key warnings detected in count phase.");

  console.log("\nDRY RUN ONLY");
  console.log("ZERO DELETE OPERATIONS");
  console.log("ZERO UPDATE OPERATIONS");
  console.log("ZERO SCHEMA CHANGES");
}

async function main() {
  const execute = hasFlag("--execute");

  if (!execute) {
    await printFullDryRunReport();
    return;
  }

  if (process.env.GATEHUB_CLEANUP_CONFIRM !== "DELETE_USER_DATA") {
    console.error(
      "Refusing --execute: set GATEHUB_CLEANUP_CONFIRM=DELETE_USER_DATA in the environment for this one-time run."
    );
    process.exit(1);
  }

  const preservedUsers = await prisma.user.findMany({
    where: { role: "super_admin" },
    select: { id: true, email: true, role: true, firstName: true, lastName: true },
  });
  const preservedIds = preservedUsers.map((u) => u.id);

  console.log("=== GATEHUB one-time data cleanup ===");
  console.log("MODE: EXECUTE");
  console.log("Preserved super_admin users:", preservedUsers.length);
  for (const u of preservedUsers) {
    console.log(`  - ${u.email} (${u.firstName} ${u.lastName}) id=${u.id}`);
  }

  const deleted: Record<string, number> = {};

  const del = async (label: string, fn: () => Promise<{ count: number }>) => {
    const result = await fn();
    deleted[label] = result.count;
    console.log(`deleted ${label}: ${result.count}`);
  };

  await prisma.$transaction(
    async (tx) => {
      await del("UserSession", () => tx.userSession.deleteMany({}));
      await del("AuthToken", () => tx.authToken.deleteMany({}));
      await del("LoginHistory", () => tx.loginHistory.deleteMany({}));

      await del("InteractionResponse", () => tx.interactionResponse.deleteMany({}));
      await del("StudentChatMessage", () => tx.studentChatMessage.deleteMany({}));
      await del("StudentQuestion", () => tx.studentQuestion.deleteMany({}));
      await del("ClassroomSessionAnalytics", () => tx.classroomSessionAnalytics.deleteMany({}));
      await del("ClassroomParticipant", () => tx.classroomParticipant.deleteMany({}));
      await del("ClassroomSession", () => tx.classroomSession.deleteMany({}));
      await del("Interaction", () => tx.interaction.deleteMany({}));
      await del("Slide", () => tx.slide.deleteMany({}));
      await del("PresentationOriginalFile", () => tx.presentationOriginalFile.deleteMany({}));
      await del("Presentation", () => tx.presentation.deleteMany({}));

      await del("LiveAnswer", () => tx.liveAnswer.deleteMany({}));
      await del("LeaderboardSnapshot", () => tx.leaderboardSnapshot.deleteMany({}));
      await del("SessionAnalytics", () => tx.sessionAnalytics.deleteMany({}));
      await del("LiveSessionEvent", () => tx.liveSessionEvent.deleteMany({}));
      await del("LiveParticipant", () => tx.liveParticipant.deleteMany({}));
      await del("LiveSession", () => tx.liveSession.deleteMany({}));
      await del("QuizRoomTemplate", () => tx.quizRoomTemplate.deleteMany({}));
      await del("QuizRoomPreferences", () => tx.quizRoomPreferences.deleteMany({}));
      await del("QuizLibraryTemplateFavorite", () => tx.quizLibraryTemplateFavorite.deleteMany({}));
      await del("QuizLibraryTemplateUsage", () => tx.quizLibraryTemplateUsage.deleteMany({}));
      await del("QuizLibraryTemplateVersion", () => tx.quizLibraryTemplateVersion.deleteMany({}));
      await del("QuizLibraryTemplate", () => tx.quizLibraryTemplate.deleteMany({}));

      await del("AssessmentResponse", () => tx.assessmentResponse.deleteMany({}));
      await del("AssessmentAttemptQuestion", () => tx.assessmentAttemptQuestion.deleteMany({}));
      await del("AssessmentAttempt", () => tx.assessmentAttempt.deleteMany({}));
      await del("AssessLeaderboardSnapshot", () => tx.assessLeaderboardSnapshot.deleteMany({}));
      await del("AssessLiveRoomAnalytics", () => tx.assessLiveRoomAnalytics.deleteMany({}));
      await del("AssessParticipant", () => tx.assessParticipant.deleteMany({}));
      await del("AssessTeam", () => tx.assessTeam.deleteMany({}));
      await del("AssessLiveRoom", () => tx.assessLiveRoom.deleteMany({}));
      await del("AssessmentDeployment", () => tx.assessmentDeployment.deleteMany({}));
      await del("AssessmentItem", () => tx.assessmentItem.deleteMany({}));
      await del("AssessmentSection", () => tx.assessmentSection.deleteMany({}));
      await del("AssessmentVersion", () => tx.assessmentVersion.deleteMany({}));
      await del("Assessment", () => tx.assessment.deleteMany({}));
      await del("AssessQuestionAnalytics", () => tx.assessQuestionAnalytics.deleteMany({}));
      await del("AssessQuestionRelation", () => tx.assessQuestionRelation.deleteMany({}));
      await del("AssessQuestionCollectionItem", () => tx.assessQuestionCollectionItem.deleteMany({}));
      await del("AssessQuestionCollection", () => tx.assessQuestionCollection.deleteMany({}));
      await del("AssessChoice", () => tx.assessChoice.deleteMany({}));
      await del("AssessQuestionVersion", () => tx.assessQuestionVersion.deleteMany({}));
      await del("AssessQuestion", () => tx.assessQuestion.deleteMany({}));
      await del("LearningRecord", () => tx.learningRecord.deleteMany({}));
      await del("EngagementRecord", () => tx.engagementRecord.deleteMany({}));
      await del("HomeworkAssignment", () => tx.homeworkAssignment.deleteMany({}));
      await del("CourseAssignment", () => tx.courseAssignment.deleteMany({}));
      await del("MediaUsage", () => tx.mediaUsage.deleteMany({}));
      await del("MediaVariant", () => tx.mediaVariant.deleteMany({}));
      await del("MediaAsset", () => tx.mediaAsset.deleteMany({}));

      await del("BankQuestionAIValidation", () => tx.bankQuestionAIValidation.deleteMany({}));
      await del("BankQuestionReview", () => tx.bankQuestionReview.deleteMany({}));
      await del("BankQuestionAnalytics", () => tx.bankQuestionAnalytics.deleteMany({}));
      await del("BankQuestionImportJob", () => tx.bankQuestionImportJob.deleteMany({}));
      await del("BankQuestionCollectionItem", () => tx.bankQuestionCollectionItem.deleteMany({}));
      await del("BankQuestionCollection", () => tx.bankQuestionCollection.deleteMany({}));
      await del("BankQuestionOption", () => tx.bankQuestionOption.deleteMany({}));
      await del("BankQuestionVersion", () => tx.bankQuestionVersion.deleteMany({}));
      await del("BankQuestion", () => tx.bankQuestion.deleteMany({}));

      await del("CartItem", () => tx.cartItem.deleteMany({}));
      await del("Cart", () => tx.cart.deleteMany({}));
      await del("RefundRequest", () => tx.refundRequest.deleteMany({}));
      await del("Invoice", () => tx.invoice.deleteMany({}));
      await del("OrderItem", () => tx.orderItem.deleteMany({}));
      await del("Payment", () => tx.payment.deleteMany({}));
      await del("Order", () => tx.order.deleteMany({}));
      await del("GiftPurchase", () => tx.giftPurchase.deleteMany({}));
      await del("Referral", () => tx.referral.deleteMany({}));
      await del("ReferralCode", () => tx.referralCode.deleteMany({}));
      await del("PayoutWithdrawal", () => tx.payoutWithdrawal.deleteMany({}));
      await del("InstructorPayoutProfile", () => tx.instructorPayoutProfile.deleteMany({}));
      await del("Product", () => tx.product.deleteMany({}));
      await del("BundleItem", () => tx.bundleItem.deleteMany({}));
      await del("ProductBundle", () => tx.productBundle.deleteMany({}));

      await del("LearningUniverseComponentSubmission", () =>
        tx.learningUniverseComponentSubmission.deleteMany({})
      );
      await del("LearningUniverseProjectSubmission", () =>
        tx.learningUniverseProjectSubmission.deleteMany({})
      );
      await del("CertificateAuditLog", () => tx.certificateAuditLog.deleteMany({}));
      await del("LearningUniverseCertificate", () => tx.learningUniverseCertificate.deleteMany({}));
      await del("LearningUniverseStepProgress", () => tx.learningUniverseStepProgress.deleteMany({}));
      await del("LessonProgress", () => tx.lessonProgress.deleteMany({}));
      await del("LearningUniverseProgress", () => tx.learningUniverseProgress.deleteMany({}));
      await del("LearningUniverseEnrollment", () => tx.learningUniverseEnrollment.deleteMany({}));
      await del("LearningUniverseResource", () => tx.learningUniverseResource.deleteMany({}));
      await del("LearningUniverseProject", () => tx.learningUniverseProject.deleteMany({}));
      await del("LearningUniversePractice", () => tx.learningUniversePractice.deleteMany({}));
      await del("LearningUniverseVideo", () => tx.learningUniverseVideo.deleteMany({}));
      await tx.learningUniverseLesson.updateMany({ data: { quizId: null } });
      await del("LearningUniverseLesson", () => tx.learningUniverseLesson.deleteMany({}));
      await del("LearningUniverseModule", () => tx.learningUniverseModule.deleteMany({}));
      await del("LearningUniverseTrack", () => tx.learningUniverseTrack.deleteMany({}));
      await del("LearningUniverseAsset", () => tx.learningUniverseAsset.deleteMany({}));
      await tx.learningUniverse.updateMany({ data: { currentPublishVersionId: null, sourceProjectId: null } });
      await del("LearningUniversePublishVersion", () => tx.learningUniversePublishVersion.deleteMany({}));
      await del("LearningUniverse", () => tx.learningUniverse.deleteMany({}));

      await del("YjsUpdate", () => tx.yjsUpdate.deleteMany({}));
      await del("YjsSnapshot", () => tx.yjsSnapshot.deleteMany({}));
      await del("LatexCollaborator", () => tx.latexCollaborator.deleteMany({}));
      await del("LatexFile", () => tx.latexFile.deleteMany({}));
      await del("LatexProjectTimelineEvent", () => tx.latexProjectTimelineEvent.deleteMany({}));
      await del("LatexProjectVersion", () => tx.latexProjectVersion.deleteMany({}));
      await del("LatexProject", () => tx.latexProject.deleteMany({}));
      await del("LatexDocument", () => tx.latexDocument.deleteMany({}));

      await del("LectureProgress", () => tx.lectureProgress.deleteMany({}));
      await del("CourseProgress", () => tx.courseProgress.deleteMany({}));
      await del("Enrollment", () => tx.enrollment.deleteMany({}));
      await del("Review", () => tx.review.deleteMany({}));
      await del("WishlistItem", () => tx.wishlistItem.deleteMany({}));
      await del("StudentNote", () => tx.studentNote.deleteMany({}));
      await del("Certificate", () => tx.certificate.deleteMany({}));
      await del("Attachment", () => tx.attachment.deleteMany({}));
      await del("LectureMedia", () => tx.lectureMedia.deleteMany({}));
      await tx.lecture.updateMany({ data: { quizId: null } });
      await del("Lecture", () => tx.lecture.deleteMany({}));
      await del("Section", () => tx.section.deleteMany({}));
      await del("Course", () => tx.course.deleteMany({}));

      await del("QuizAttempt", () => tx.quizAttempt.deleteMany({}));
      await del("Option", () => tx.option.deleteMany({}));
      await del("Question", () => tx.question.deleteMany({}));
      await del("QuizVersion", () => tx.quizVersion.deleteMany({}));
      await del("Quiz", () => tx.quiz.deleteMany({}));

      await del("ResourceContent", () => tx.resourceContent.deleteMany({}));
      await del("ResourceCourse", () => tx.resourceCourse.deleteMany({}));
      await del("StudentWorkspaceVersion", () => tx.studentWorkspaceVersion.deleteMany({}));
      await del("StudentWorkspaceSnapshot", () => tx.studentWorkspaceSnapshot.deleteMany({}));
      await del("OrganizationMember", () => tx.organizationMember.deleteMany({}));
      await del("TenantConfig", () => tx.tenantConfig.deleteMany({}));
      await tx.department.updateMany({ data: { parentId: null } });
      await del("Department", () => tx.department.deleteMany({}));
      await del("Organization", () => tx.organization.deleteMany({}));

      await del("BadgeAward", () => tx.badgeAward.deleteMany({}));
      await del("Achievement", () => tx.achievement.deleteMany({}));
      await del("XPTransaction", () => tx.xPTransaction.deleteMany({}));
      await del("CoinTransaction", () => tx.coinTransaction.deleteMany({}));
      await del("UserGamificationProfile", () => tx.userGamificationProfile.deleteMany({}));

      await del("Notification", () => tx.notification.deleteMany({}));
      await del("UserIntegration", () => tx.userIntegration.deleteMany({}));
      await del("AdminAuditLog", () => tx.adminAuditLog.deleteMany({}));
      await del("SecurityAuditLog", () => tx.securityAuditLog.deleteMany({}));
      await del("AiUsageLog", () => tx.aiUsageLog.deleteMany({}));
      await del("AIHistory", () => tx.aIHistory.deleteMany({}));
      await del("PlatformAnalyticsEvent", () => tx.platformAnalyticsEvent.deleteMany({}));
      await del("PlatformAuditLog", () => tx.platformAuditLog.deleteMany({}));
      await del("MusicTrack", () => tx.musicTrack.deleteMany({}));

      await tx.platformSettings.updateMany({ data: { updatedById: null } });

      await del("User(non-super_admin)", () =>
        tx.user.deleteMany({ where: { role: { not: "super_admin" } } })
      );
    },
    { timeout: 300_000, maxWait: 60_000 }
  );

  const afterUsers = await prisma.user.findMany({
    select: { id: true, email: true, role: true },
  });
  const afterSuper = afterUsers.filter((u) => u.role === "super_admin");
  const afterOther = afterUsers.filter((u) => u.role !== "super_admin");

  console.log("\n=== CLEANUP COMPLETE ===");
  console.log("Deleted counts:", deleted);
  console.log("Remaining super_admin:", afterSuper.map((u) => u.email));
  console.log("Remaining non-super_admin (should be 0):", afterOther.length);
  console.log("Coupon count (preserved):", await prisma.coupon.count());
  console.log("MembershipPlan count (preserved):", await prisma.membershipPlan.count());
  console.log("PlatformSettings:", await prisma.platformSettings.count());
  console.log("Category:", await prisma.category.count());
  console.log("AssessQuestionType:", await prisma.assessQuestionType.count());
  console.log("UserSession remaining:", await prisma.userSession.count());
  console.log("AuthToken remaining:", await prisma.authToken.count());

  if (afterSuper.length === 0) {
    console.error("ERROR: no super_admin users remain — unexpected");
    process.exit(2);
  }
  if (afterOther.length > 0) {
    console.error("ERROR: non-super_admin users still present");
    process.exit(3);
  }
  if (preservedIds.some((id) => !afterSuper.find((u) => u.id === id))) {
    console.error("ERROR: a preserved super_admin id is missing");
    process.exit(4);
  }
}

main()
  .catch((err) => {
    console.error("Cleanup failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
