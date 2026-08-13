import "dotenv/config";
import { prisma } from "../src/utils/prisma.js";

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "LearningUniverseCertificate_user_lu_active_key"
    ON "LearningUniverseCertificate" ("user_id", "learning_universe_id")
    WHERE "status" = 'active';
  `);
  console.log("Partial unique index applied");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
