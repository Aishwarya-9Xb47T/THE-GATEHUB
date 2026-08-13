
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listAll() {
  console.log("=== All Learning Universes ===");
  const all = await prisma.learningUniverse.findMany();
  for (const lu of all) {
    console.log("-", lu.id, "| Title:", lu.title, "| Published at:", lu.publishedAt);
  }
}

listAll().catch(console.error).finally(() => prisma.$disconnect());
