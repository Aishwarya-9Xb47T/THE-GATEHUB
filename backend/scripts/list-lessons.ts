import { prisma } from "../src/utils/prisma.js";

const universeId = process.argv[2] || "cmr1t3kg100012biy19hs4d1l";
const u = await prisma.learningUniverse.findUnique({
  where: { id: universeId },
  include: {
    tracks: {
      include: {
        modules: {
          include: { lessons: { select: { id: true, title: true } } },
        },
      },
    },
  },
});
for (const t of u?.tracks ?? []) {
  for (const m of t.modules) {
    for (const l of m.lessons) {
      console.log(l.id, "|", l.title);
    }
  }
}
await prisma.$disconnect();
