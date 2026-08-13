import { prisma } from "./src/utils/prisma.js";

async function main() {
  const learningUniverses = await prisma.learningUniverse.findMany({
    take: 5
  });

  console.log("Learning Universes found:");
  learningUniverses.forEach(lu => {
    console.log(`ID: ${lu.id}, Title: ${lu.title}`);
  });
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
});
