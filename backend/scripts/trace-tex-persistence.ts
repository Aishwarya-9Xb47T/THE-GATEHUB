/**
 * Trace TeX persistence: save payload → DB → repairLuProject → reload.
 * Run: npx tsx scripts/trace-tex-persistence.ts [projectId] [summaryPath]
 */
import { prisma } from "../src/utils/prisma.js";
import { loadProjectFiles, filesToContentMap, getProjectJsonFromFiles } from "../src/services/luProject/luProjectFiles.js";
import { repairLuProject } from "../src/services/luProject/luProjectRepair.js";
import { sanitizeProjectFileContent } from "../src/services/latexContentSanitizer.js";

const projectId = process.argv[2] || "cmr1t3kgu00032biyhmh22894";
const summaryPath = process.argv[3] || "/track-01/module-01/lesson-01/summary.tex";

const SAMPLE_WITH_IMAGE = `\\theory{title={Summary},body={
Foundations text here.
\\begin{center}
\\includegraphics[width=0.7\\textwidth]{assets/images/img.png}
\\end{center}
}}`;

function logStage(label: string, content: string | null | undefined) {
  const text = content ?? "";
  console.log(`\n[${label}]`);
  console.log("  bytes:", text.length);
  console.log("  has \\includegraphics:", text.includes("\\includegraphics"));
  console.log("  snippet:", text.slice(0, 220).replace(/\n/g, "\\n"));
}

async function main() {
  console.log("\n=== TeX Persistence Trace ===");
  console.log("project:", projectId);
  console.log("file:", summaryPath);

  logStage("Editor payload (simulated)", SAMPLE_WITH_IMAGE);

  const sanitized = sanitizeProjectFileContent(summaryPath, SAMPLE_WITH_IMAGE);
  logStage("After sanitizeProjectFileContent", sanitized);

  const files = await loadProjectFiles(projectId);
  const summary = files.find((f) => f.path.replace(/\\/g, "/") === summaryPath.replace(/\\/g, "/"));
  if (!summary) {
    console.error("summary.tex not found in project");
    return;
  }

  logStage("DB before simulated save", summary.content);

  await prisma.latexFile.update({
    where: { id: summary.id },
    data: { content: sanitized },
  });
  logStage("DB after simulated save", sanitized);

  const project = getProjectJsonFromFiles(files);
  if (!project) {
    console.error("project.json missing");
    return;
  }

  const refreshed = await loadProjectFiles(projectId);
  const contentMap = filesToContentMap(refreshed);
  const { texChanged } = await repairLuProject(projectId, project, contentMap);

  const afterRepair = await prisma.latexFile.findUnique({ where: { id: summary.id } });
  logStage("DB after repairLuProject (publish build pass)", afterRepair?.content ?? "");
  console.log("\n[repairLuProject] texChanged:", texChanged);

  const match = (afterRepair?.content ?? "") === sanitized;
  console.log("\n[byte-for-byte] saved === after repair:", match ? "PASS" : "FAIL");

  if (!match) {
    console.log("\nROOT CAUSE: repairLuProject overwrote instructor .tex from project.json config.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
