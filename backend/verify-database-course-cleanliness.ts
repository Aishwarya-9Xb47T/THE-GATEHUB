import { prisma } from "./src/utils/prisma.js";
import { sanitizeDslContent } from "../shared/lesson-body/index.js";

async function main() {
  console.log("==================================================");
  console.log("DATABASE COURSE CONTENT CLEANLINESS AUDIT");
  console.log("==================================================\n");

  const universes = await prisma.learningUniverse.findMany({
    take: 5,
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, structuredData: true },
  });

  if (!universes.length) {
    console.log("No universes found in database.");
    return;
  }

  const forbiddenPatterns = [
    /\\theory/i,
    /\\overviewmarkdown/i,
    /\\overview/i,
    /\\callout/i,
    /\\checkpoint/i,
    /title\s*=\s*\{/i,
    /body\s*=\s*\{/i,
    /content\s*=\s*\{/i,
    /\{\{/i,
    /\}\}/i,
  ];

  let totalStepsChecked = 0;
  let totalViolations = 0;

  for (const u of universes) {
    console.log(`Auditing Universe: ${u.title} (${u.id})`);
    const schema = u.structuredData as { tracks?: Array<{ modules?: Array<{ lessons?: Array<{ blocks?: unknown[] }> }> }> };
    if (!schema?.tracks) continue;

    for (const track of schema.tracks) {
      for (const mod of track.modules || []) {
        for (const lesson of mod.lessons || []) {
          for (const block of lesson.blocks || []) {
            totalStepsChecked++;
            const rawText = JSON.stringify(block);
            const cleanedText = sanitizeDslContent(rawText);

            for (const pat of forbiddenPatterns) {
              if (pat.test(cleanedText)) {
                console.error(`  ❌ Leak found in block (type: ${(block as any).type}): pattern ${pat.source}`);
                totalViolations++;
              }
            }
          }
        }
      }
    }
  }

  console.log("\n==================================================");
  console.log(`Audit finished: ${totalStepsChecked} blocks checked across ${universes.length} courses.`);
  if (totalViolations === 0) {
    console.log("✅ PERFECT RESULT — 0 LEAKS FOUND IN DATABASE!");
  } else {
    console.warn(`⚠️ Found ${totalViolations} leaks in existing database records.`);
  }
  console.log("==================================================");
}

main().catch(console.error).finally(() => prisma.$disconnect());
