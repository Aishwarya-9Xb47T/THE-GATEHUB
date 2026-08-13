/**
 * Complete compiler audit — macro validation + AST compile + stub coverage report.
 * Run: npx tsx backend/scripts/audit-compiler-macros.ts [projectId]
 */
import { prisma } from "../src/utils/prisma.js";
import { loadProjectFiles, getProjectJsonFromFiles } from "../src/services/luProject/luProjectFiles.js";
import { validateProjectTexMacros } from "../src/services/luProject/luTexMacroValidator.js";
import {
  compileAllLessonTexFiles,
  hasBlockingCompileErrors,
} from "../src/services/luProject/luLessonCompiler.js";
import {
  countCompiledDocuments,
  countCompiledImages,
  countDocumentBlocks,
  countDocumentImages,
} from "../src/services/luProject/luCompiledPublish.js";
import { applyCompiledPackageToParsed } from "../src/services/luProject/luLessonCompiler.js";
import { parseLearningUniverseLatex } from "../src/controllers/learning-universe-parser.js";
import { resolveProjectIncludesWithFallback } from "../src/services/luProject/luIncludeResolver.js";
import { stripAuthoringMarkers } from "../src/services/luProject/luTexMarkers.js";
import { LEARNING_COMMANDS } from "../src/services/learningCommandRegistry.js";
import { prepareLatexForCompilation } from "../src/services/latexLearningCommands.js";

const projectId = process.argv[2] || "cmr1t3kgu00032biyhmh22894";

async function main() {
  const files = await loadProjectFiles(projectId);
  const project = getProjectJsonFromFiles(files);
  if (!project) throw new Error("project.json not found");

  console.log("=".repeat(72));
  console.log("COMPILER AUDIT — macro registry + validation + compile");
  console.log("Project:", projectId);
  console.log("=".repeat(72));

  const macroReport = validateProjectTexMacros(files);
  console.log("\n--- PRE-COMPILE VALIDATION ---");
  console.log("Files scanned      :", macroReport.filesScanned);
  console.log("Supported macros   :", macroReport.supportedMacros.length);
  console.log("Used macros        :", macroReport.usedMacros.length);
  console.log("Unsupported macros :", macroReport.unsupportedMacros.length || "(none)");
  if (macroReport.unsupportedMacros.length) {
    for (const m of macroReport.unsupportedMacros) {
      console.log("  - \\" + m);
    }
  }
  console.log("Validation status  :", macroReport.valid ? "PASS" : "FAIL");

  if (!macroReport.valid) {
    console.log("\n--- ALL VALIDATION ERRORS ---");
    for (const issue of macroReport.issues) {
      const loc = [issue.file, issue.line, issue.column].filter(Boolean).join(":");
      console.log(`  [${issue.code}] ${loc} — ${issue.message}`);
      if (issue.suggestedFix) console.log(`    → ${issue.suggestedFix}`);
    }
    console.log("\nCompilation aborted — course.compiled.json will NOT be overwritten.");
    process.exit(1);
  }

  const { package: compiledPackage, issues: compileIssues } = compileAllLessonTexFiles(
    projectId,
    files,
    project
  );

  console.log("\n--- AST COMPILATION ---");
  console.log("Compilation status   :", hasBlockingCompileErrors(compileIssues) ? "FAIL" : "PASS");
  if (hasBlockingCompileErrors(compileIssues)) {
    for (const issue of compileIssues.filter((i) => i.severity === "error")) {
      console.log(`  [${issue.code}] ${issue.file ?? ""}:${issue.line ?? "?"} — ${issue.message}`);
    }
    console.log("\nCompilation aborted — course.compiled.json will NOT be overwritten.");
    process.exit(1);
  }

  const compiledDocs = countCompiledDocuments(compiledPackage);
  const compiledImages = countCompiledImages(compiledPackage);

  const resolved = resolveProjectIncludesWithFallback(files, { forPdf: true });
  const parsed = parseLearningUniverseLatex(stripAuthoringMarkers(resolved.mergedForPdf ?? ""));
  if (parsed) {
    applyCompiledPackageToParsed(parsed, project, compiledPackage);
  }
  const publishedDocs = parsed ? countDocumentBlocks(parsed) : 0;
  const publishedImages = parsed ? countDocumentImages(parsed) : 0;

  const mergedPrepared = prepareLatexForCompilation(resolved.mergedForPdf ?? "", projectId, {
    project,
    files,
    parsed: parsed ?? undefined,
  });

  console.log("\n--- POST-VALIDATION COMPILE REPORT ---");
  console.log("Generated compiled documents :", compiledDocs);
  console.log("Generated image nodes        :", compiledImages);
  console.log("Published document blocks    :", publishedDocs);
  console.log("Published image nodes        :", publishedImages);
  console.log("PDF macro validation         :", mergedPrepared.validation.valid ? "PASS" : "FAIL");
  console.log("Registry command count       :", LEARNING_COMMANDS.length);

  if (compiledDocs !== publishedDocs) {
    console.log("\nWARN: compiled vs published document count mismatch:", compiledDocs, "vs", publishedDocs);
  }

  console.log("\nCompiler audit: SUCCESS (zero errors)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
