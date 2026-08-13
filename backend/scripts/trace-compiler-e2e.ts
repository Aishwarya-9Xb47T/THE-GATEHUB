/**
 * End-to-end compiler trace for one lesson file (default: summary.tex).
 * Shows document content, image count, asset paths at every stage.
 *
 * Run: npx tsx backend/scripts/trace-compiler-e2e.ts [projectId] [lessonFileSuffix]
 */
import { prisma } from "../src/utils/prisma.js";
import { loadProjectFiles } from "../src/services/luProject/luProjectFiles.js";
import { resolveLuV2ContentSnapshot } from "../src/services/luProject/luCompileSource.js";
import { sanitizeProjectFileContent } from "../src/services/latexContentSanitizer.js";
import { compileTexFile } from "../src/services/luProject/luLessonCompiler.js";
import { parseLessonTexCommand } from "../../shared/lesson-body/parseTexCommand.js";
import { parseDocumentBody } from "../../shared/lesson-body/parseDocument.js";
import { buildLearnerExperienceFromPublishedUniverse } from "../src/services/learningExperience/learningExperienceEngine.js";
import type { DocumentNode } from "../../shared/lesson-body/documentTypes.js";

const projectId = process.argv[2] || "cmr1t3kgu00032biyhmh22894";
const fileSuffix = process.argv[3] || "summary.tex";

interface StageReport {
  stage: string;
  byteLength: number;
  imageCount: number;
  nodeTypes: string;
  assetPaths: string[];
  prosePreview: string;
  divergesFromEditor: boolean;
}

function countImages(nodes: DocumentNode[]): number {
  return nodes.filter((n) => n.type === "image").length;
}

function assetPathsFromNodes(nodes: DocumentNode[]): string[] {
  return nodes
    .filter((n) => n.type === "image" || n.type === "video")
    .map((n) => (n.type === "image" ? n.ref : n.ref));
}

function proseFromNodes(nodes: DocumentNode[]): string {
  return nodes
    .filter((n) => n.type === "markdown")
    .map((n) => (n as { content: string }).content.trim())
    .join("\n---\n")
    .slice(0, 200);
}

function nodesFromBlock(block: { type: string; content: unknown } | undefined): DocumentNode[] {
  if (!block) return [];
  if (block.type !== "document" || typeof block.content !== "object" || !block.content) return [];
  const c = block.content as { nodes?: DocumentNode[] };
  return Array.isArray(c.nodes) ? c.nodes : [];
}

function report(
  stage: string,
  nodes: DocumentNode[],
  sourceTex: string,
  baselineNodes: DocumentNode[]
): StageReport {
  return {
    stage,
    byteLength: sourceTex.length,
    imageCount: countImages(nodes),
    nodeTypes: nodes.map((n) => n.type).join(",") || "(empty)",
    assetPaths: assetPathsFromNodes(nodes),
    prosePreview: proseFromNodes(nodes) || sourceTex.slice(0, 120).replace(/\n/g, "\\n"),
    divergesFromEditor:
      countImages(nodes) !== countImages(baselineNodes) ||
      nodes.map((n) => n.type).join(",") !== baselineNodes.map((n) => n.type).join(","),
  };
}

function printReport(r: StageReport) {
  console.log(`\n[${r.stage}]`);
  console.log("  source bytes:", r.byteLength);
  console.log("  images:", r.imageCount);
  console.log("  node types:", r.nodeTypes);
  console.log("  asset paths:", r.assetPaths.length ? r.assetPaths.join(", ") : "(none)");
  console.log("  prose preview:", JSON.stringify(r.prosePreview));
  console.log("  DIVERGES from editor AST:", r.divergesFromEditor ? "YES" : "no");
}

async function main() {
  const files = await loadProjectFiles(projectId);
  const target = files.find((f) => f.path.toLowerCase().endsWith(fileSuffix.toLowerCase()));
  if (!target) {
    console.error(`File ending with ${fileSuffix} not found in project ${projectId}`);
    process.exit(1);
  }

  console.log("=".repeat(72));
  console.log("COMPILER E2E TRACE");
  console.log("=".repeat(72));
  console.log("Project:", projectId);
  console.log("File:", target.path);

  const editorTex = target.content ?? "";
  const sanitized = sanitizeProjectFileContent(target.path, editorTex);
  const cmd = parseLessonTexCommand(editorTex);
  const editorNodes = parseDocumentBody(cmd?.body ?? editorTex);

  const baseline = editorNodes;
  const reports: StageReport[] = [];

  reports.push(report("1 Editor (DB latexFile.content)", editorNodes, editorTex, baseline));
  reports.push(report("2 Save path (sanitizeProjectFileContent)", editorNodes, sanitized, baseline));

  const { compiled, issues } = compileTexFile(target.path, editorTex, files);
  if (issues.length) {
    console.log("\nCompile diagnostics:");
    for (const i of issues) console.log(`  [${i.severity}] ${i.file}:${i.line ?? "?"} ${i.code} — ${i.message}`);
  }
  reports.push(
    report("3 Per-file compiler (compileTexFile)", compiled?.nodes ?? [], compiled?.sourceTex ?? "", baseline)
  );

  const snapshot = await resolveLuV2ContentSnapshot(projectId, { runBuild: false });
  if (!snapshot) {
    console.error("Could not resolve compile snapshot");
    process.exit(1);
  }

  const compiledFromPackage = snapshot.compiledPackage.files[target.path.replace(/\\/g, "/").replace(/^(?!\/)/, "/")];
  reports.push(
    report(
      "4 Compiled package (course.compiled.json)",
      compiledFromPackage?.nodes ?? [],
      compiledFromPackage?.sourceTex ?? "",
      baseline
    )
  );

  let snapshotBlockNodes: DocumentNode[] = [];
  outer: for (const track of snapshot.parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const block of lesson.contentBlocks) {
          if (block.type !== "document") continue;
          const c = block.content as { title?: string; nodes?: DocumentNode[]; sourceTex?: string };
          if (c.sourceTex?.includes(target.path.split("/").pop() ?? "") || /summary/i.test(c.title ?? "")) {
            snapshotBlockNodes = c.nodes ?? [];
            reports.push(
              report("5 Compile snapshot contentBlocks", snapshotBlockNodes, c.sourceTex ?? "", baseline)
            );
            break outer;
          }
        }
      }
    }
  }

  const universe = await prisma.learningUniverse.findFirst({
    where: { sourceProjectId: projectId },
    include: {
      tracks: {
        include: {
          modules: {
            include: {
              lessons: { select: { id: true, title: true, contentBlocks: true } },
            },
          },
        },
      },
    },
  });

  if (universe) {
    for (const track of universe.tracks) {
      for (const mod of track.modules) {
        for (const lesson of mod.lessons) {
          for (const block of (lesson.contentBlocks as Array<{ type: string; content: unknown }>) ?? []) {
            const nodes = nodesFromBlock(block);
            if (!nodes.length) continue;
            const c = block.content as { title?: string; sourceTex?: string };
            if (/summary/i.test(c.title ?? "")) {
              reports.push(
                report("6 Published DB contentBlocks", nodes, c.sourceTex ?? "", baseline)
              );
            }
          }
        }
      }
    }

    const exp = buildLearnerExperienceFromPublishedUniverse({
      universeId: universe.id,
      universe: { title: universe.title, description: universe.description ?? "" },
      tracks: universe.tracks.map((t) => ({
        id: t.id,
        title: t.title,
        modules: t.modules.map((m) => ({
          id: m.id,
          title: m.title,
          lessons: m.lessons.map((l) => ({
            id: l.id,
            title: l.title,
            contentBlocks: l.contentBlocks as never,
          })),
        })),
      })),
    });

    for (const lesson of Object.values(exp.lessons)) {
      const step = lesson.steps.find((s) => /summary/i.test(String(s.payload.title ?? s.title)));
      if (!step) continue;
      const nodes = (step.payload.nodes as DocumentNode[]) ?? [];
      reports.push(report("7 Experience engine step.payload.nodes", nodes, String(step.payload.sourceTex ?? ""), baseline));
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log("STAGE REPORTS");
  console.log("=".repeat(72));
  for (const r of reports) printReport(r);

  const firstDivergence = reports.find((r) => r.divergesFromEditor && !r.stage.startsWith("1"));
  console.log("\n" + "=".repeat(72));
  if (firstDivergence) {
    console.log(">>> FIRST AST DIVERGENCE:", firstDivergence.stage);
    console.log(">>> Fix the compiler/publish path at this stage before patching renderers.");
  } else {
    console.log(">>> All stages match editor Document AST (image count + node sequence).");
  }
  console.log("=".repeat(72));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
