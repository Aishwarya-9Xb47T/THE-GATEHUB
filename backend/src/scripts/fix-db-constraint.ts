import { prisma } from "../utils/prisma.js";

async function main() {
  console.log("Dropping User_google_id_key constraint...");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_google_id_key" CASCADE;
  `).catch(err => console.log("Failed dropping constraint:", err));

  await prisma.$executeRawUnsafe(`
    DROP INDEX IF EXISTS "User_google_id_key" CASCADE;
  `).catch(err => console.log("Failed dropping index:", err));

  console.log("Done!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
