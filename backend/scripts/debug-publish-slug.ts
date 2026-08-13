import { prisma } from "../src/utils/prisma.js";

async function main() {
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { slug: { contains: "artificial-neural" } },
        { displayName: { contains: "Artificial Neural", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      slug: true,
      learningUniverseId: true,
      courseId: true,
      displayName: true,
    },
  });
  console.log("products:", JSON.stringify(products, null, 2));

  const lu = await prisma.learningUniverse.findFirst({
    where: { title: { contains: "Artificial Neural", mode: "insensitive" } },
    select: {
      id: true,
      title: true,
      status: true,
      sourceProjectId: true,
      structuredData: true,
    },
  });
  console.log("LU:", JSON.stringify(lu, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
