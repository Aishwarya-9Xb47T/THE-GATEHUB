/**
 * End-to-end LU compile smoke test — run: npx tsx scratch-compile-test.ts [universeId|projectId]
 */
import { prisma } from "./src/utils/prisma.js";
import { loadProjectFiles, isLuV2Project } from "./src/services/luProject/luProjectFiles.js";
import { resolveLuV2CompileSource } from "./src/services/luProject/luCompileSource.js";
import { compileLatexLocally } from "./src/services/latexCompileService.js";
import { prepareLatexForCompilation } from "./src/services/latexLearningCommands.js";

async function resolveProjectId(arg?: string): Promise<string | null> {
  if (!arg) {
    const lu = await prisma.learningUniverse.findFirst({
      where: { sourceProjectId: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: { sourceProjectId: true, title: true, id: true },
    });
    if (lu?.sourceProjectId) {
      console.log(`Using latest LU: ${lu.title} (${lu.id})`);
      return lu.sourceProjectId;
    }
    return null;
  }

  const byLu = await prisma.learningUniverse.findUnique({
    where: { id: arg },
    select: { sourceProjectId: true, title: true },
  });
  if (byLu?.sourceProjectId) {
    console.log(`Using LU: ${byLu.title}`);
    return byLu.sourceProjectId;
  }

  const project = await prisma.latexProject.findUnique({ where: { id: arg }, select: { id: true, title: true } });
  if (project) {
    console.log(`Using project: ${project.title}`);
    return project.id;
  }
  return null;
}

async function main() {
  const arg = process.argv[2];
  const projectId = await resolveProjectId(arg);
  if (!projectId) {
    console.error("No project found. Pass universe id or project id.");
    process.exit(1);
  }

  console.log(`Project ID: ${projectId}`);

  const files = await loadProjectFiles(projectId);
  console.log(`Files: ${files.length}, v2: ${isLuV2Project(files)}`);

  const luSource = await resolveLuV2CompileSource(projectId, { forPdf: true });
  if (!luSource) {
    console.error("Not an LU v2 project");
    process.exit(1);
  }
  const mergedTex = luSource.mergedTex;
  console.log(`Merged DSL length: ${mergedTex.length}`);
  console.log(`Has track: ${mergedTex.includes("\\track{")}`);
  console.log(`Has video: ${mergedTex.includes("\\video{")}`);
  console.log(`Has raw lesson input: ${/\\input\{lesson-\d+\//.test(mergedTex)}`);

  const prepared = prepareLatexForCompilation(mergedTex, projectId);
  console.log(`Validation valid: ${prepared.validation.valid}`);
  if (!prepared.validation.valid) {
    console.log("Validation issues:", prepared.validation.issues.slice(0, 5));
  }

  const result = await compileLatexLocally(projectId, mergedTex, {
    copyReferencedImages: true,
    enableBibtex: true,
    compilerFallback: true,
    maxPasses: 2,
    timeoutMs: 120000,
    preserveProvidedMainTex: true,
  });

  console.log(`Compile success: ${result.success}`);
  if (!result.success) {
    console.log("Errors:", result.errors.slice(0, 5));
    console.log("Log tail:\n", result.logs?.slice(-2000));
    process.exit(1);
  }
  console.log(`PDF: ${result.pdfPath}`);
  console.log(`Time: ${result.compilationTime}ms`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
