import { compileLatexLocally } from "./services/latexCompileService.js";
import { prisma } from "./utils/prisma.js";

async function main() {
  const projects = await prisma.latexProject.findMany({
    orderBy: { updatedAt: "desc" },
    take: 3,
    select: { id: true, title: true },
  });

  for (const p of projects) {
    console.log(`\nCompiling project ${p.id} (${p.title})...`);
    const mainFile = await prisma.latexFile.findFirst({
      where: { projectId: p.id, name: "main.tex" },
    });
    if (!mainFile) {
      console.log(`  No main.tex found for project ${p.id}`);
      continue;
    }

    const res = await compileLatexLocally(p.id, mainFile.content, {
      compilerFallback: true,
    });

    console.log(`  Compile result: success=${res.success}, time=${res.compilationTime}ms`);
    if (!res.success) {
      console.log("  Errors:", res.errors);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
