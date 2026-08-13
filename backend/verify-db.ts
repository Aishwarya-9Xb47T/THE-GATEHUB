import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const universeId = "cmqncn7ab0002v5dwo81ktbqz"; // from test-publish.ts output

async function main() {
  console.log("=== LearningUniverse ===");
  const lu = await prisma.learningUniverse.findUnique({ where: { id: universeId } });
  console.log(JSON.stringify(lu, null, 2));

  console.log("\n=== Tracks ===");
  const tracks = await prisma.learningUniverseTrack.findMany({ where: { learningUniverseId: universeId } });
  console.log(JSON.stringify(tracks, null, 2));

  console.log("\n=== Modules ===");
  const modules = await prisma.learningUniverseModule.findMany({ 
    where: { trackId: { in: tracks.map(t => t.id) } } 
  });
  console.log(JSON.stringify(modules, null, 2));

  console.log("\n=== Lessons ===");
  const lessons = await prisma.learningUniverseLesson.findMany({ 
    where: { moduleId: { in: modules.map(m => m.id) } } 
  });
  console.log(JSON.stringify(lessons, null, 2));

  console.log("\n=== Videos ===");
  const videos = await prisma.learningUniverseVideo.findMany({ 
    where: { lessonId: { in: lessons.map(l => l.id) } } 
  });
  console.log(JSON.stringify(videos, null, 2));

  console.log("\n=== Quizzes ===");
  const quizIds = lessons.filter(l => l.quizId).map(l => l.quizId!);
  const quizzes = quizIds.length > 0 ? await prisma.quiz.findMany({ where: { id: { in: quizIds } } }) : [];
  console.log(JSON.stringify(quizzes, null, 2));

  console.log("\n=== Projects ===");
  const projects = await prisma.learningUniverseProject.findMany({ 
    where: { lessonId: { in: lessons.map(l => l.id) } } 
  });
  console.log(JSON.stringify(projects, null, 2));

  console.log("\n=== Resources ===");
  const resources = await prisma.learningUniverseResource.findMany({ 
    where: { lessonId: { in: lessons.map(l => l.id) } } 
  });
  console.log(JSON.stringify(resources, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
