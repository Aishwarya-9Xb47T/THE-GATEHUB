
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('=== Deleting old test data ===');

  await prisma.learningUniverseResource.deleteMany();
  await prisma.learningUniverseProject.deleteMany();
  await prisma.question.deleteMany();
  await prisma.quiz.deleteMany();
  await prisma.learningUniversePractice.deleteMany();
  await prisma.learningUniverseVideo.deleteMany();
  await prisma.learningUniverseLesson.deleteMany();
  await prisma.learningUniverseModule.deleteMany();
  await prisma.learningUniverseTrack.deleteMany();
  await prisma.learningUniverse.deleteMany();

  console.log('=== Database cleaned! ===');
}

main()
  .catch(e => {
    console.error('Error cleaning up:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
