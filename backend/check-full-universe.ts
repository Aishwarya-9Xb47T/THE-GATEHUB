import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Get ALL published universes
  const universes = await prisma.learningUniverse.findMany({
    where: { status: "published" },
    include: {
      tracks: {
        include: {
          modules: {
            include: {
              lessons: {
                include: {
                  videos: true,
                  practice: true,
                  quiz: {
                    include: {
                      questions: {
                        include: {
                          options: true
                        }
                      }
                    }
                  },
                  project: true,
                  resources: true
                }
              }
            }
          }
        }
      }
    }
  });

  for (const universe of universes) {
    console.log("\n\n\n=== FULL PUBLISHED LEARNING UNIVERSE: ", universe.title, " ===");
    console.log("ID:", universe.id);
    console.log("DSL Source:\n", universe.dslSource);
    console.dir(universe, { depth: null });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });