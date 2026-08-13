import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const assets = await prisma.learningUniverseAsset.findMany();
  console.log(JSON.stringify(assets, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
