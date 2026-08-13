import "dotenv/config";
import { prisma } from "../src/utils/prisma.js";

async function main() {
  const lus = await prisma.learningUniverse.findMany({
    select: { id: true, title: true, structuredData: true },
    take: 20,
    orderBy: { updatedAt: "desc" },
  });
  for (const lu of lus) {
    const sd = (lu.structuredData as Record<string, unknown> | null) ?? {};
    const le = sd.learnerExperience as { completionRules?: unknown } | undefined;
    console.log({
      id: lu.id,
      title: lu.title,
      hasCompletionRules: Boolean(sd.completionRules || le?.completionRules),
      sdCompletionRules: sd.completionRules ?? null,
      leCompletionRules: le?.completionRules ?? null,
      keys: Object.keys(sd).slice(0, 20),
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
