/**
 * Post-implementation verification — compiled document counts must match across all stages.
 * Run: npx tsx backend/scripts/verify-compiled-pipeline.ts [projectId]
 */
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
import type { DocumentNode } from "../../shared/lesson-body/documentTypes.js";

const projectId = process.argv[2] || "cmr1t3kgu00032biyhmh22894";

function imgCount(nodes: DocumentNode[] | undefined): number {
  return (nodes ?? []).filter((n) => n.type === "image").length;
}

function countExperienceDocumentSteps(
  pkg: ReturnType<typeof buildLearnerExperienceFromPublishedUniverse>
): { steps: number; images: number } {
  let steps = 0;
  let images = 0;
  for (const lesson of Object.values(pkg.lessons)) {
    for (const step of lesson.steps) {
      const nodes = step.payload.nodes as DocumentNode[] | undefined;
      if (!Array.isArray(nodes) || nodes.length === 0) continue;
      steps++;
      images += imgCount(nodes);
    }
  }
  return { steps, images };
}

function countPdfDocumentRenders(parsed: import("../src/controllers/learning-universe-parser.js").ParsedLearningUniverse): {
  blocks: number;
  images: number;
  nonEmpty: number;
} {
  let blocks = 0;
  let images = 0;
  let nonEmpty = 0;
  const latex = renderParsedUniverseToLatex(parsed);
  for (const track of parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const block of lesson.contentBlocks) {
          if (block.type !== "document") continue;
          blocks++;
          const c = block.content as { nodes?: DocumentNode[]; title?: string };
          const nodeImgs = imgCount(c.nodes);
          images += nodeImgs;
          const title = String(c.title ?? "");
          if (nodeImgs > 0 || (title && latex.includes(title))) nonEmpty++;
        }
      }
    }
  }
  return { blocks, images, nonEmpty: blocks > 0 ? blocks : nonEmpty };
}

function parsedToEngineUniverse(
  parsed: import("../src/controllers/learning-universe-parser.js").ParsedLearningUniverse,
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
  const metadataDoc = snapshot.compiledPackage.files["/metadata.tex"] ? 1 : 0;

  const snapshotDocs = countDocumentBlocks(snapshot.parsed);
  const snapshotImages = countDocumentImages(snapshot.parsed);

  const expPkg = buildLearnerExperienceFromPublishedUniverse(
    parsedToEngineUniverse(snapshot.parsed, "verify-snapshot")
  );
  const expCounts = countExperienceDocumentSteps(expPkg);

  const pdfCounts = countPdfDocumentRenders(snapshot.parsed);

  const universe = await prisma.learningUniverse.findFirst({
    where: { sourceProjectId: projectId },
    include: {
      tracks: {
        include: {
          modules: {
            include: {
              lessons: { select: { contentBlocks: true } },
            },
          },
        },
      },
    },
  });

  let dbDocs = 0;
  let dbImages = 0;
  if (universe) {
    const dbParsed = {
      tracks: universe.tracks.map((t) => ({
        modules: t.modules.map((m) => ({
          lessons: m.lessons.map((l) => ({
            contentBlocks: (typeof l.contentBlocks === "string"
              ? JSON.parse(l.contentBlocks)
              : l.contentBlocks) as Array<{ type: string; content: unknown }>,
          })),
        })),
      })),
    } as import("../src/controllers/learning-universe-parser.js").ParsedLearningUniverse;
    dbDocs = countDocumentBlocks(dbParsed);
    dbImages = countDocumentImages(dbParsed);
  }

  console.log("=".repeat(72));
  console.log("COMPILED PIPELINE VERIFICATION");
  console.log("Project:", projectId);
  console.log("Universe (DB):", universe?.id ?? "(not published yet)");
  console.log("=".repeat(72));
  console.log("");
  console.log("Compiled documents :", compiledDocs, metadataDoc ? `(+${metadataDoc} metadata.tex at project root)` : "");
  console.log("Published documents:", snapshotDocs, "(snapshot — post applyCompiledPackageToParsed)");
  console.log("DB published       :", dbDocs, universe ? "" : "(republish required)");
  console.log("Experience steps   :", expCounts.steps, "(student + instructor consume these)");
  console.log("PDF document blocks:", pdfCounts.blocks);
  console.log("");
  console.log("Compiled images    :", compiledImages);
  console.log("Snapshot images    :", snapshotImages);
  console.log("DB images          :", dbImages);
  console.log("Experience images  :", expCounts.images);
  console.log("PDF images         :", pdfCounts.images);
  console.log("");

  const pipelineMatch =
    compiledDocs === snapshotDocs &&
    snapshotDocs === expCounts.steps &&
    expCounts.steps === pdfCounts.blocks &&
    compiledImages === snapshotImages &&
    snapshotImages === expCounts.images &&
    expCounts.images === pdfCounts.images;

  const dbMatch = universe ? compiledDocs === dbDocs && compiledImages === dbImages : null;

  if (pipelineMatch) {
    console.log("PIPELINE (compiler → snapshot → experience → PDF): MATCH");
  } else {
    console.log("PIPELINE (compiler → snapshot → experience → PDF): MISMATCH");
    if (compiledDocs !== snapshotDocs) console.log("  compiled vs snapshot docs:", compiledDocs, "vs", snapshotDocs);
    if (snapshotDocs !== expCounts.steps) console.log("  snapshot vs experience:", snapshotDocs, "vs", expCounts.steps);
    if (expCounts.steps !== pdfCounts.blocks) console.log("  experience vs PDF:", expCounts.steps, "vs", pdfCounts.blocks);
    if (compiledImages !== snapshotImages) console.log("  compiled vs snapshot images:", compiledImages, "vs", snapshotImages);
    if (snapshotImages !== expCounts.images) console.log("  snapshot vs experience images:", snapshotImages, "vs", expCounts.images);
    if (expCounts.images !== pdfCounts.images) console.log("  experience vs PDF images:", expCounts.images, "vs", pdfCounts.images);
  }

  if (dbMatch === true) {
    console.log("DATABASE (published): MATCH");
  } else if (dbMatch === false) {
    console.log("DATABASE (published): MISMATCH — republish to LU required");
    console.log("  compiled vs DB docs:", compiledDocs, "vs", dbDocs);
    console.log("  compiled vs DB images:", compiledImages, "vs", dbImages);
  } else {
    console.log("DATABASE (published): SKIPPED (no universe linked to project)");
  }

  if (!pipelineMatch) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
