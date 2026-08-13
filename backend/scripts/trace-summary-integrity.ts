/**
 * Data integrity trace: Summary from DB → compile → experience → API.
 * Run: npx tsx backend/scripts/trace-summary-integrity.ts [projectId] [universeId] [lessonId]
 */
import { prisma } from "../src/utils/prisma.js";
import { loadProjectFiles } from "../src/services/luProject/luProjectFiles.js";
import { resolveLuV2ContentSnapshot } from "../src/services/luProject/luCompileSource.js";
import { sanitizeProjectFileContent } from "../src/services/latexContentSanitizer.js";
import { parseCommandBlock } from "../src/controllers/learning-universe-parser.js";
import { parseLessonTexCommand, parseLessonDocumentFromContent } from "../../shared/lesson-body/index.js";
import { buildLearnerExperienceFromPublishedUniverse } from "../src/services/learningExperience/learningExperienceEngine.js";
import { getLearnerExperience } from "../src/controllers/learningExperienceController.js";
import type { LuContentBlock } from "../src/services/learningUniverseSchema.js";

const projectId = process.argv[2] || "cmr1t3kgu00032biyhmh22894";
const universeId = process.argv[3] || "cmr1t3kg100012biy19hs4d1l";
const lessonId = process.argv[4] || "cmraz5lun000f48sygoozirrg";

interface StageRow {
  stage: string;
  length: number;
  first100: string;
  last100: string;
  full?: string;
  hasGraphics: boolean;
  startsWithBrace: boolean;
}

function snapshot(stage: string, text: string | null | undefined): StageRow {
  const body = text ?? "";
  const row: StageRow = {
    stage,
    length: body.length,
    first100: body.slice(0, 100).replace(/\n/g, "\\n"),
    last100: body.slice(-100).replace(/\n/g, "\\n"),
    hasGraphics: body.includes("\\includegraphics"),
    startsWithBrace: body.trimStart().startsWith("{"),
  };
  if (body.length <= 1000) row.full = body;
  return row;
}

function printRow(row: StageRow) {
  console.log(`\n[${row.stage}]`);
  console.log("  length:", row.length);
  console.log("  first100:", JSON.stringify(row.first100));
  console.log("  last100:", JSON.stringify(row.last100));
  console.log("  has \\includegraphics:", row.hasGraphics);
  console.log("  startsWith '{':", row.startsWithBrace);
  if (row.full) console.log("  FULL:\n", row.full);
}

function compareStages(a: StageRow, b: StageRow): boolean {
  return a.length === b.length && a.first100 === b.first100 && a.last100 === b.last100;
}

async function main() {
  const rows: StageRow[] = [];

  const files = await loadProjectFiles(projectId);
  const summaryFile = files.find((f) => /summary\.tex$/i.test(f.path));
  if (!summaryFile) {
    console.error("summary.tex not found in project", projectId);
    process.exit(1);
  }

  const editorValue = summaryFile.content ?? "";
  rows.push(snapshot("1 DB latexFile.content (editor source of truth)", editorValue));

  const sanitized = sanitizeProjectFileContent(summaryFile.path, editorValue);
  rows.push(snapshot("2 After sanitizeProjectFileContent (save path)", sanitized));

  const texCmd = parseLessonTexCommand(editorValue);
  rows.push(
    snapshot(
      "3 parseLessonTexCommand().body (shared parser)",
      texCmd?.body ?? "(null)"
    )
  );

  const cmdBlock = parseCommandBlock(
    editorValue.replace(/^\\theory\s*\{/, "").replace(/\}\s*$/, "") ||
      editorValue
  );
  console.log("\n[3b parseCommandBlock keys]", Object.keys(cmdBlock));
  console.log("  title:", cmdBlock.title?.slice(0, 80));
  rows.push(snapshot("3b parseCommandBlock body (DSL publish parser)", cmdBlock.body ?? cmdBlock.content ?? "(missing)"));

  const snapshotResult = await resolveLuV2ContentSnapshot(projectId, { runBuild: false });
  if (!snapshotResult) {
    console.error("Could not resolve compile snapshot");
    process.exit(1);
  }

  let compiledSummaryBody = "";
  for (const track of snapshotResult.parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        if (lessonId && lesson.id !== lessonId) continue;
        for (const block of lesson.contentBlocks) {
          const c = block.content as Record<string, unknown>;
          const title = String(c?.title ?? "");
          if (!/^summary$/i.test(title) && block.type !== "summary") continue;
          compiledSummaryBody = String(c?.body ?? c?.text ?? c?.content ?? "");
          rows.push(
            snapshot(
              `5 Compile/parsed contentBlock (type=${block.type} title=${title})`,
              compiledSummaryBody
            )
          );
        }
      }
    }
  }

  const universe = await prisma.learningUniverse.findUnique({
    where: { id: universeId },
    include: {
      tracks: {
        include: {
          modules: {
            include: {
              lessons: {
                where: lessonId ? { id: lessonId } : undefined,
                select: { id: true, title: true, contentBlocks: true, overviewMarkdown: true },
              },
            },
          },
        },
      },
    },
  });

  let publishedSummaryBody = "";
  for (const track of universe?.tracks ?? []) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const block of (lesson.contentBlocks as LuContentBlock[]) ?? []) {
          const c = block.content as Record<string, unknown>;
          const title = String(c?.title ?? "");
          if (!/^summary$/i.test(title)) continue;
          publishedSummaryBody = String(c?.body ?? c?.text ?? "");
          rows.push(snapshot("4 Published DB lesson.contentBlocks (Summary)", publishedSummaryBody));
        }
      }
    }
  }

  const pkg = await getLearnerExperience(universeId);
  const expLesson = pkg?.lessons[lessonId];
  const summaryStep = expLesson?.steps.find(
    (s) => String(s.payload.title ?? s.title).trim().toLowerCase() === "summary"
  );
  const expBody = String(summaryStep?.payload.body ?? summaryStep?.payload.text ?? "");
  rows.push(snapshot("6 Experience API step.payload.body", expBody));

  const doc = parseLessonDocumentFromContent(summaryStep?.payload ?? {});
  rows.push(
    snapshot(
      "7 parseLessonDocumentFromContent (React would receive)",
      doc.nodes
        .map((n) => (n.type === "markdown" ? n.content : n.type === "image" ? `[image:${(n as { ref: string }).ref}]` : n.type))
        .join("\n---\n")
    )
  );

  console.log("\n" + "=".repeat(72));
  console.log("INTEGRITY TABLE");
  console.log("=".repeat(72));
  for (const row of rows) printRow(row);

  console.log("\n" + "=".repeat(72));
  console.log("DIVERGENCE SCAN (byte identity vs stage 1)");
  console.log("=".repeat(72));
  const baseline = rows[0];
  let firstDivergence: string | null = null;
  for (let i = 1; i < rows.length; i++) {
    const same = compareStages(baseline, rows[i]);
    console.log(`${rows[i].stage}: ${same ? "MATCH" : "DIFFERS"}`);
    if (!same && !firstDivergence) {
      firstDivergence = rows[i].stage;
    }
  }

  if (firstDivergence) {
    console.log("\n>>> FIRST DIVERGENCE:", firstDivergence);
    if (firstDivergence.includes("sanitize")) {
      console.log(">>> Responsible: frontend/backend sanitizeProjectFileContent");
    } else if (firstDivergence.includes("parseCommandBlock")) {
      console.log(">>> Responsible: backend/src/controllers/learning-universe-parser.ts parseCommandBlock()");
    } else if (firstDivergence.includes("Compile/parsed")) {
      console.log(">>> Responsible: publish compile parse pipeline (DSL → contentBlocks)");
    } else if (firstDivergence.includes("Published DB")) {
      console.log(">>> Responsible: luPublishPipeline persisting parsed blocks to Prisma");
    } else if (firstDivergence.includes("Experience")) {
      console.log(">>> Responsible: learningExperienceEngine / lessonContentRepair");
    }
  } else {
    console.log("\n>>> All stages match editor bytes (corruption may be React-only)");
  }

  if (baseline.startsWithBrace || rows.some((r) => r.stage.includes("parseCommandBlock") && r.startsWithBrace)) {
    console.log("\n>>> LEADING '{' ARTIFACT: body field contains wrapper residue — DSL param extraction bug");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
