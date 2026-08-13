/**
 * Golden regression — verifies parity across compiler → publish snapshot → experience → PDF.
 *
 * Run: npx tsx backend/scripts/golden-pipeline-regression.ts [projectId]
 */
import { createHash } from "node:crypto";
import { prisma } from "../src/utils/prisma.js";
import { resolveLuV2ContentSnapshot } from "../src/services/luProject/luCompileSource.js";
import {
  countCompiledDocuments,
  countCompiledImages,
  countDocumentBlocks,
  countDocumentImages,
} from "../src/services/luProject/luCompiledPublish.js";
import { buildLearnerExperienceFromPublishedUniverse } from "../src/services/learningExperience/learningExperienceEngine.js";
import { renderParsedUniverseToLatex } from "../src/services/latexPdfRenderer.js";
import { renderDocumentAstToLatex } from "../../shared/lesson-body/parseDocument.js";
import type { DocumentNode } from "../../shared/lesson-body/documentTypes.js";
import { UNIVERSAL_PIPELINE_VERSION } from "../../shared/lesson-body/pipelineContract.js";

const projectId = process.argv[2] || "cmr1t3kgu00032biyhmh22894";

interface NodeStats {
  total: number;
  byType: Record<string, number>;
  imageRefs: string[];
  headingLines: number;
  codeBlocks: number;
  tables: number;
  equations: number;
  lists: number;
  callouts: number;
  links: number;
  videos: number;
  downloads: number;
  fingerprint: string;
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function statsFromNodes(nodes: DocumentNode[]): NodeStats {
  const byType: Record<string, number> = {};
  const imageRefs: string[] = [];
  let headingLines = 0;
  let codeBlocks = 0;
  let tables = 0;

  let equations = 0;
  let lists = 0;
  let callouts = 0;
  let links = 0;
  let videos = 0;
  let downloads = 0;

  for (const node of nodes) {
    byType[node.type] = (byType[node.type] ?? 0) + 1;
    switch (node.type) {
      case "image":
        imageRefs.push(node.ref);
        break;
      case "markdown":
        headingLines += (node.content.match(/^#{1,6}\s+/gm) ?? []).length;
        break;
      case "code":
        codeBlocks++;
        break;
      case "table":
        tables++;
        break;
      case "equation":
        equations++;
        break;
      case "list":
        lists++;
        break;
      case "callout":
        callouts++;
        break;
      case "link":
        links++;
        break;
      case "video":
        videos++;
        break;
      case "download":
        downloads++;
        break;
    }
  }

  const fingerprint = hashText(
    JSON.stringify({
      byType,
      imageRefs: [...imageRefs].sort(),
      headingLines,
      codeBlocks,
      tables,
      equations,
      lists,
      callouts,
      links,
      videos,
      downloads,
      total: nodes.length,
    })
  );

  return {
    total: nodes.length,
    byType,
    imageRefs: [...imageRefs].sort(),
    headingLines,
    codeBlocks,
    tables,
    equations,
    lists,
    callouts,
    links,
    videos,
    downloads,
    fingerprint,
  };
}

function collectCompiledLessonDocs(
  pkg: NonNullable<Awaited<ReturnType<typeof resolveLuV2ContentSnapshot>>>["compiledPackage"]
): Map<string, NodeStats> {
  const out = new Map<string, NodeStats>();
  for (const [path, file] of Object.entries(pkg.files)) {
    if (!path.endsWith(".tex") || path === "/metadata.tex") continue;
    const doc = file.document;
    if (!doc?.nodes?.length) continue;
    const key = path.replace(/^\//, "").replace(/\.tex$/, "");
    out.set(key, statsFromNodes(doc.nodes));
  }
  return out;
}

function collectSnapshotLessonDocs(
  parsed: NonNullable<Awaited<ReturnType<typeof resolveLuV2ContentSnapshot>>>["parsed"]
): Map<string, NodeStats> {
  const out = new Map<string, NodeStats>();
  for (const track of parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const block of lesson.contentBlocks) {
          if (block.type !== "document") continue;
          const c = block.content as { nodes?: DocumentNode[]; title?: string };
          if (!c.nodes?.length) continue;
          const title = String(c.title ?? lesson.title ?? "document");
          const key = `${lesson.id}::${title}`;
          out.set(key, statsFromNodes(c.nodes));
        }
      }
    }
  }
  return out;
}

function collectExperienceDocs(
  pkg: ReturnType<typeof buildLearnerExperienceFromPublishedUniverse>
): { steps: number; images: number; stats: NodeStats } {
  const merged: DocumentNode[] = [];
  for (const lesson of Object.values(pkg.lessons)) {
    for (const step of lesson.steps) {
      const nodes = step.payload.nodes as DocumentNode[] | undefined;
      if (!Array.isArray(nodes) || nodes.length === 0) continue;
      merged.push(...nodes);
    }
  }
  const stats = statsFromNodes(merged);
  return { steps: stats.total > 0 ? countDocSteps(pkg) : 0, images: stats.imageRefs.length, stats };
}

function countDocSteps(pkg: ReturnType<typeof buildLearnerExperienceFromPublishedUniverse>): number {
  let steps = 0;
  for (const lesson of Object.values(pkg.lessons)) {
    for (const step of lesson.steps) {
      const nodes = step.payload.nodes as DocumentNode[] | undefined;
      if (Array.isArray(nodes) && nodes.length > 0) steps++;
    }
  }
  return steps;
}

function collectPdfDocStats(
  parsed: NonNullable<Awaited<ReturnType<typeof resolveLuV2ContentSnapshot>>>["parsed"]
): { blocks: number; images: number; stats: NodeStats; droppedNodes: number } {
  const merged: DocumentNode[] = [];
  let blocks = 0;
  let droppedNodes = 0;

  for (const track of parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const block of lesson.contentBlocks) {
          if (block.type !== "document") continue;
          blocks++;
          const c = block.content as { nodes?: DocumentNode[] };
          const nodes = c.nodes ?? [];
          merged.push(...nodes);
          const latex = renderDocumentAstToLatex(nodes);
          for (const node of nodes) {
            if (node.type === "image" && !latex.includes(node.ref)) droppedNodes++;
            if (node.type === "code" && !latex.includes(node.content.slice(0, 12))) droppedNodes++;
          }
        }
      }
    }
  }

  const fullLatex = renderParsedUniverseToLatex(parsed);
  for (const ref of statsFromNodes(merged).imageRefs) {
    if (!fullLatex.includes(ref)) droppedNodes++;
  }

  const stats = statsFromNodes(merged);
  return { blocks, images: stats.imageRefs.length, stats, droppedNodes };
}

function parsedToEngineUniverse(
  parsed: NonNullable<Awaited<ReturnType<typeof resolveLuV2ContentSnapshot>>>["parsed"],
  universeId: string
) {
  return {
    id: universeId,
    title: parsed.universe.title,
    description: parsed.universe.description ?? "",
    tracks: parsed.tracks.map((track, ti) => ({
      id: `track-${ti}`,
      title: track.title,
      modules: track.modules.map((mod, mi) => ({
        id: `mod-${ti}-${mi}`,
        title: mod.title,
        lessons: mod.lessons.map((lesson, li) => ({
          id: lesson.id ?? `lesson-${ti}-${mi}-${li}`,
          title: lesson.title,
          overviewMarkdown: lesson.overviewMarkdown,
          overviewHtml: lesson.overviewHtml,
          contentBlocks: lesson.contentBlocks,
          videos: lesson.videos,
          practice: lesson.practice,
          quiz: lesson.quiz,
          project: lesson.project,
          resources: lesson.resources,
        })),
      })),
    })),
  };
}

async function main() {
  const snapshot = await resolveLuV2ContentSnapshot(projectId, { runBuild: false });
  if (!snapshot) throw new Error("Could not resolve LU v2 snapshot");

  const compiledDocs = countCompiledDocuments(snapshot.compiledPackage);
  const compiledImages = countCompiledImages(snapshot.compiledPackage);
  const snapshotDocs = countDocumentBlocks(snapshot.parsed);
  const snapshotImages = countDocumentImages(snapshot.parsed);

  const expPkg = buildLearnerExperienceFromPublishedUniverse(
    parsedToEngineUniverse(snapshot.parsed, "golden-regression")
  );
  const expCounts = collectExperienceDocs(expPkg);
  const expSteps = countDocSteps(expPkg);

  const pdfCounts = collectPdfDocStats(snapshot.parsed);

  const compiledByPath = collectCompiledLessonDocs(snapshot.compiledPackage);
  const snapshotByLesson = collectSnapshotLessonDocs(snapshot.parsed);

  const failures: string[] = [];

  if (compiledDocs !== snapshotDocs) {
    failures.push(`document count: compiled ${compiledDocs} vs snapshot ${snapshotDocs}`);
  }
  if (snapshotDocs !== expSteps) {
    failures.push(`document steps: snapshot ${snapshotDocs} vs experience ${expSteps}`);
  }
  if (expSteps !== pdfCounts.blocks) {
    failures.push(`experience steps ${expSteps} vs PDF blocks ${pdfCounts.blocks}`);
  }
  if (compiledImages !== snapshotImages) {
    failures.push(`images: compiled ${compiledImages} vs snapshot ${snapshotImages}`);
  }
  if (snapshotImages !== expCounts.images) {
    failures.push(`images: snapshot ${snapshotImages} vs experience ${expCounts.images}`);
  }
  if (expCounts.images !== pdfCounts.images) {
    failures.push(`images: experience ${expCounts.images} vs PDF ${pdfCounts.images}`);
  }
  if (expCounts.stats.fingerprint !== pdfCounts.stats.fingerprint) {
    failures.push("node fingerprint: experience vs PDF AST render mismatch");
  }
  if (pdfCounts.droppedNodes > 0) {
    failures.push(`PDF dropped ${pdfCounts.droppedNodes} node reference(s)`);
  }

  const snapshotFp = hashText(
    JSON.stringify({
      docs: snapshotDocs,
      images: snapshotImages,
      headings: expCounts.stats.headingLines,
      code: expCounts.stats.codeBlocks,
      tables: expCounts.stats.tables,
      types: expCounts.stats.byType,
    })
  );
  const pdfFp = hashText(
    JSON.stringify({
      docs: pdfCounts.blocks,
      images: pdfCounts.images,
      headings: pdfCounts.stats.headingLines,
      code: pdfCounts.stats.codeBlocks,
      tables: pdfCounts.stats.tables,
      types: pdfCounts.stats.byType,
    })
  );
  if (snapshotFp !== pdfFp) {
    failures.push("aggregate content fingerprint: snapshot experience vs PDF mismatch");
  }

  console.log("=".repeat(72));
  console.log("GOLDEN PIPELINE REGRESSION");
  console.log("Pipeline version:", UNIVERSAL_PIPELINE_VERSION);
  console.log("Project:", projectId);
  console.log("=".repeat(72));
  console.log("");
  console.log("✅ Editor output = Student output   :", snapshotDocs === expSteps ? "PASS" : "FAIL");
  console.log("✅ Student output = Published output:", snapshotDocs === expSteps ? "PASS" : "FAIL");
  console.log(
    "✅ Published output = PDF output    :",
    expSteps === pdfCounts.blocks && expCounts.stats.fingerprint === pdfCounts.stats.fingerprint
      ? "PASS"
      : "FAIL"
  );
  console.log("✅ Image counts match               :", compiledImages === pdfCounts.images ? "PASS" : "FAIL");
  console.log("✅ Heading counts match             :", expCounts.stats.headingLines === pdfCounts.stats.headingLines ? "PASS" : "FAIL");
  console.log("✅ Table counts match               :", expCounts.stats.tables === pdfCounts.stats.tables ? "PASS" : "FAIL");
  console.log("✅ Code block counts match          :", expCounts.stats.codeBlocks === pdfCounts.stats.codeBlocks ? "PASS" : "FAIL");
  console.log("✅ Equation counts match            :", expCounts.stats.equations === pdfCounts.stats.equations ? "PASS" : "FAIL");
  console.log("✅ List counts match                :", expCounts.stats.lists === pdfCounts.stats.lists ? "PASS" : "FAIL");
  console.log("✅ Callout counts match             :", expCounts.stats.callouts === pdfCounts.stats.callouts ? "PASS" : "FAIL");
  console.log("✅ No dropped nodes in PDF          :", pdfCounts.droppedNodes === 0 ? "PASS" : "FAIL");
  console.log("");
  console.log("Compiled documents :", compiledDocs);
  console.log("Snapshot documents :", snapshotDocs);
  console.log("Experience steps   :", expSteps);
  console.log("PDF document blocks:", pdfCounts.blocks);
  console.log("Images (all stages):", compiledImages, snapshotImages, expCounts.images, pdfCounts.images);
  console.log("Compiled .tex docs :", compiledByPath.size);
  console.log("Snapshot lesson doc blocks:", snapshotByLesson.size);

  if (failures.length) {
    console.log("");
    console.log("FAILURES:");
    for (const f of failures) console.log(" -", f);
    process.exit(1);
  }

  console.log("");
  console.log("ALL GOLDEN CHECKS PASSED");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
