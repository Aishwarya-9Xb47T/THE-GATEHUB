import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const universeId = "cmqnudjsh000113no2599qhcx"; // Replace with actual ID if different

async function main() {
  const lu = await prisma.learningUniverse.findUnique({
    where: { id: universeId },
    include: {
      tracks: {
        orderBy: { order: "asc" },
        include: {
          modules: {
            orderBy: { order: "asc" },
            include: {
              lessons: {
                orderBy: { order: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!lu) {
    console.error("Universe not found");
    return;
  }

  for (const track of lu.tracks) {
    console.log(`\nTrack: ${track.title}`);
    for (const mod of track.modules) {
      console.log(`  Module: ${mod.title}`);
      for (const lesson of mod.lessons) {
        console.log(`    Lesson: ${lesson.title}`);
        console.log("    Block order:");
        const blocks = lesson.contentBlocks as any[];
        if (blocks && Array.isArray(blocks)) {
          blocks.forEach(b => console.log(`      - ${b.type.toUpperCase()}`));
        } else {
          console.log("      (No blocks found)");
        }
      }
    }
  }
}

main().finally(() => prisma.$disconnect());
