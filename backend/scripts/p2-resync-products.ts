import "dotenv/config";
import { syncProductFromCourse } from "../src/services/productCatalogService.js";
import { prisma } from "../src/utils/prisma.js";

async function main() {
  const ids = [
    "cmsq2oect00e3jn2afshiac8r",
    "cmsq35sy20049rqqoktf3xovz",
    "cmsq4gel20049yfk4tcy7diy8",
    "cmskja18z0003vqx8iwdp6lhu",
  ];
  for (const id of ids) {
    await syncProductFromCourse(id);
  }
  const products = await prisma.product.findMany({
    where: { courseId: { in: ids } },
    select: { courseId: true, displayName: true, price: true, published: true, visible: true },
  });
  console.log(products);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
