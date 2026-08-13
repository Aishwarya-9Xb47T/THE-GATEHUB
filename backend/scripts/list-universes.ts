import { prisma } from "../src/utils/prisma.js";

const universes = await prisma.learningUniverse.findMany({
  take: 8,
  select: { id: true, title: true, sourceProjectId: true },
  orderBy: { updatedAt: "desc" },
});
console.log("Universes:", universes);

const projects = await prisma.luProject.findMany({
  take: 8,
  select: { id: true, title: true },
  orderBy: { updatedAt: "desc" },
});
console.log("Projects:", projects);

await prisma.$disconnect();
