import { prisma } from "../src/utils/prisma.js";
import { loadProjectFiles } from "../src/services/luProject/luProjectFiles.js";

const files = await loadProjectFiles("cmr1t3kgu00032biyhmh22894");
for (const s of files.filter((f) => /summary\.tex$/i.test(f.path))) {
  console.log("---", s.path, "len", s.content?.length);
  console.log(s.content);
  console.log();
}

const lesson = await prisma.learningUniverseLesson.findFirst({
  where: { id: "cmraz5lun000f48sygoozirrg" },
  select: { contentBlocks: true },
});
const blocks = (lesson?.contentBlocks as Array<{ type: string; content: Record<string, string> }>) ?? [];
const sum = blocks.find((b) => String(b.content?.title) === "Summary");
console.log("=== Published Summary block ===");
console.log("type:", sum?.type);
console.log("body:", JSON.stringify(sum?.content?.body));

await prisma.$disconnect();
