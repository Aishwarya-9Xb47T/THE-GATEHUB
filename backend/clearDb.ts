import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing all database tables...');

  // The order matters if there are foreign key constraints, 
  // but Prisma deleteMany generally handles them or we can just delete from the leaves up.
  // Although with SQLite and onDelete: Cascade, deleting root objects should also cascade.
  // We'll delete everything to be safe.

  const tables = [
    prisma.lectureProgress.deleteMany(),
    prisma.courseProgress.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.studentNote.deleteMany(),
    prisma.wishlistItem.deleteMany(),
    prisma.review.deleteMany(),
    prisma.quizAttempt.deleteMany(),
    prisma.option.deleteMany(),
    prisma.question.deleteMany(),
    prisma.quiz.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.lecture.deleteMany(),
    prisma.section.deleteMany(),
    prisma.course.deleteMany(),
    prisma.category.deleteMany(),
    prisma.user.deleteMany()
  ];

  await prisma.$transaction(tables);
  
  console.log('All existing data has been removed from the database tables.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
