import { prisma } from "../utils/prisma.js";

async function clearDatabase() {
  console.log("--- FULL DATABASE CLEAR INITIATED ---");
  console.warn("WARNING: This will delete ALL records from the database permanently!");
  
  try {
    // 1. Delete deeply nested / child records first
    console.log("Cleaning up Yjs data...");
    await prisma.yjsUpdate.deleteMany();
    await prisma.yjsSnapshot.deleteMany();

    console.log("Cleaning up Latex data...");
    await prisma.latexFile.deleteMany();
    await prisma.latexCollaborator.deleteMany();
    await prisma.latexProject.deleteMany();

    console.log("Cleaning up Student interactions (Notes, Reviews, Wishlist)...");
    await prisma.studentNote.deleteMany();
    await prisma.review.deleteMany();
    await prisma.wishlistItem.deleteMany();

    console.log("Cleaning up Course progress and Quiz attempts...");
    await prisma.lectureProgress.deleteMany();
    await prisma.courseProgress.deleteMany();
    await prisma.quizAttempt.deleteMany();

    console.log("Cleaning up Quiz structure (Options, Questions, Quizzes)...");
    await prisma.option.deleteMany();
    await prisma.question.deleteMany();
    await prisma.quiz.deleteMany();

    console.log("Cleaning up Course content (Attachments, Lectures, Sections)...");
    await prisma.attachment.deleteMany();
    await prisma.lecture.deleteMany();
    await prisma.section.deleteMany();

    console.log("Cleaning up Transactions (Payments, Certificates, Enrollments)...");
    await prisma.payment.deleteMany();
    await prisma.certificate.deleteMany();
    await prisma.enrollment.deleteMany();

    console.log("Cleaning up Core entities (Courses, Categories, Users)...");
    await prisma.course.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();

    console.log("--- ALL DATA CLEARED SUCCESSFULLY ---");
    console.log("Database is now completely empty.");

  } catch (error) {
    console.error("ERROR DURING CLEARING:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

clearDatabase();
