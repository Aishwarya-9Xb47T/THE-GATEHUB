
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("=".repeat(80));
  console.log("1. DATABASE VERIFICATION");
  console.log("=".repeat(80));

  // Get latest published universe
  const universe = await prisma.learningUniverse.findFirst({
    where: { status: "published" },
    orderBy: { createdAt: "desc" },
    include: {
      tracks: {
        orderBy: { order: "asc" },
        include: {
          modules: {
            orderBy: { order: "asc" },
            include: {
              lessons: {
                orderBy: { order: "asc" },
                include: {
                  videos: true,
                  practice: true,
                  quiz: {
                    include: { questions: { include: { options: true } } },
                  },
                  project: true,
                  resources: true,
                },
              },
            },
          },
        },
      },
      assets: true,
    },
  });

  if (!universe) {
    console.log("No published universe found!");
    return;
  }

  console.log(`Universe ID: ${universe.id}`);
  console.log(`Universe Title: ${universe.title}`);

  console.log("\n--- structuredData field ---");
  console.log(JSON.stringify(universe.structuredData, null, 2));

  console.log("\n--- dslSource field ---");
  console.log(universe.dslSource);

  // Find lesson "Introduction to Transformers"
  let targetLesson;
  for (const track of universe.tracks) {
    for (const module of track.modules) {
      for (const lesson of module.lessons) {
        if (lesson.title === "Introduction to Transformers") {
          targetLesson = lesson;
          break;
        }
      }
    }
  }

  if (!targetLesson) {
    console.log('Lesson "Introduction to Transformers" not found!');
    return;
  }

  console.log("\n--- Lesson contentBlocks ---");
  console.log("Block types in order:");
  const blockTypes = [];
  if (targetLesson.contentBlocks) {
    const blocks = Array.isArray(targetLesson.contentBlocks)
      ? targetLesson.contentBlocks
      : JSON.parse(JSON.stringify(targetLesson.contentBlocks));
    for (const block of blocks) {
      blockTypes.push(block.type);
      console.log(`  - ${block.type}`);
      // Also log full content for quiz blocks
      if (block.type === "quiz") {
        console.log(`  - Full quiz content: ${JSON.stringify(block, null, 2)}`);
      }
    }
  } else {
    console.log("  No contentBlocks found!");
  }

  console.log("\n--- Quiz Verification ---");
  console.log(`Has lesson.quiz property: ${!!targetLesson.quiz}`);
  if (targetLesson.quiz) {
    console.log(`Quiz title: ${targetLesson.quiz.title}`);
    console.log(`Number of questions: ${targetLesson.quiz.questions.length}`);
    for (let i = 0; i < targetLesson.quiz.questions.length; i++) {
      const q = targetLesson.quiz.questions[i];
      console.log(`  Q${i+1}: ${q.text}`);
      console.log(`  Number of options: ${q.options.length}`);
      for (let j = 0; j < q.options.length; j++) {
        const o = q.options[j];
        console.log(`    - ${o.text} (correct: ${o.isCorrect})`);
      }
    }
  }

  console.log("\n--- Assets Verification ---");
  console.log(`Number of assets: ${universe.assets.length}`);
  for (const asset of universe.assets) {
    console.log(`  - ${asset.filename} (stored as: ${asset.storedFilename})`);
  }

  console.log("\n--- Colab Verification ---");
  console.log(`Has project: ${!!targetLesson.project}`);
  if (targetLesson.project) {
    console.log(`Project title: ${targetLesson.project.title}`);
    console.log(`Project colabUrl: ${JSON.stringify(targetLesson.project.colabUrl)}`);
  }

  console.log("\n--- Video Verification ---");
  console.log(`Number of videos: ${targetLesson.videos.length}`);
  for (const video of targetLesson.videos) {
    console.log(`  - ${video.title}: type=${video.type}, url=${video.url}`);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
