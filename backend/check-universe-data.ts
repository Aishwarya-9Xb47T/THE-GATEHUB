import { prisma } from "./src/utils/prisma.js";

async function main() {
  const universeId = "cmqnkt1fl000jwyp5mo4f1kdc";

  const universe = await prisma.learningUniverse.findUnique({
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
                include: {
                    videos: true,
                    resources: true,
                    quiz: true,
                    project: true
                  }
              }
            }
          }
        }
      }
    }
  });

  console.log("=== Learning Universe Data ===\n");
  console.log(JSON.stringify(universe, null, 2));
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
});
