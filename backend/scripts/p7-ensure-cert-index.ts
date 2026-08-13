import "dotenv/config";
import { prisma } from "../src/utils/prisma.js";

async function main() {
  const before = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
    `SELECT indexname FROM pg_indexes WHERE indexname = 'LearningUniverseCertificate_user_lu_active_key'`
  );
  console.log("before", before);
  if (!before.length) {
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "LearningUniverseCertificate_user_lu_active_key"
      ON "LearningUniverseCertificate" ("user_id", "learning_universe_id")
      WHERE "status" = 'active';
    `);
    console.log("index_created");
  } else {
    console.log("index_already_present");
  }
  const after = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
    `SELECT indexname FROM pg_indexes WHERE indexname = 'LearningUniverseCertificate_user_lu_active_key'`
  );
  console.log("after", after);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
