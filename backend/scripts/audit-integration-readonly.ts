/**
 * READ-ONLY integration audit — no fixes, trace only.
 * Run: npx tsx backend/scripts/audit-integration-readonly.ts [projectId]
 */
import { prisma } from "../src/utils/prisma.js";
import { loadProjectFiles, getProjectJsonFromFiles } from "../src/services/luProject/luProjectFiles.js";
import { resolveLuV2ContentSnapshot } from "../src/services/luProject/luCompileSource.js";
import { sanitizeProjectFileContent } from "../src/services/latexContentSanitizer.js";
import { compileTexFile } from "../src/services/luProject/luLessonCompiler.js";
import { getLearnerExperience } from "../src/controllers/learningExperienceController.js";
import { parseLessonTexCommand } from "../../shared/lesson-body/parseTexCommand.js";
import { parseDocumentBody } from "../../shared/lesson-body/parseDocument.js";
import { renderParsedUniverseToLatex } from "../src/services/latexPdfRenderer.js";
import type { DocumentNode } from "../../shared/lesson-body/documentTypes.js";

const projectId = process.argv[2] || "cmr1t3kgu00032biyhmh22894";

function imgCount(nodes: DocumentNode[] | undefined): number {
  return (nodes ?? []).filter((n) => n.type === "image").length;
}

function nodesFromBlock(block: { type: string; content: unknown } | null) {
  if (!block || block.type !== "document" || typeof block.content !== "object" || !block.content) {
    return { nodes: [] as DocumentNode[], title: "", type: block?.type ?? "MISSING" };
  }
  const c = block.content as { nodes?: DocumentNode[]; title?: string };
  return { nodes: Array.isArray(c.nodes) ? c.nodes : [], title: String(c.title ?? ""), type: block.type };
}

/** Count PDF-renderable images for a content block (document uses AST nodes). */
function pdfImageCountForBlock(block: { type: string; content: unknown } | null): number {
  if (!block) return -1;
  if (block.type === "document") {
    const c = block.content as { nodes?: DocumentNode[] };
    return imgCount(c.nodes);
  }
  const c = block.content as Record<string, string>;
  const body = String(
    c?.body ??
      c?.text ??
      c?.content ??
      c?.markdown ??
      (typeof block.content === "string" ? block.content : "")
  );
  return (body.match(/\\includegraphics/g) ?? []).length;
}

async function main() {
  const files = await loadProjectFiles(projectId);
  const project = getProjectJsonFromFiles(files);
  if (!project) throw new Error("No project.json");

  const snapshot = await resolveLuV2ContentSnapshot(projectId, { runBuild: false });
  if (!snapshot) throw new Error("No compile snapshot");

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

  const expPkg = universe ? await getLearnerExperience(universe.id) : null;

  console.log("=".repeat(80));
  console.log("INTEGRATION AUDIT (READ-ONLY)");
  console.log("Project:", projectId);
  console.log("Universe:", universe?.id ?? "(none)");
  console.log("=".repeat(80));

  const compiledCount = Object.keys(snapshot.compiledPackage.files).length;
  let publishedDocBlocks = 0;
  for (const t of universe?.tracks ?? []) {
    for (const m of t.modules) {
      for (const l of m.lessons) {
        for (const b of (l.contentBlocks as Array<{ type: string }>) ?? []) {
          if (b.type === "document") publishedDocBlocks++;
        }
      }
    }
  }

  console.log("\n--- PUBLISH PIPELINE COUNTS ---");
  console.log("Compiled document files (course.compiled.json):", compiledCount);
  console.log("Published document blocks (DB):", publishedDocBlocks);
  console.log(
    "Match:",
    compiledCount === publishedDocBlocks ? "YES" : `NO (delta ${compiledCount - publishedDocBlocks})`
  );

  interface CompRef {
    lessonId: string;
    lessonTitle: string;
    compTitle: string;
    file: string;
  }
  const components: CompRef[] = [];
  for (const track of project.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const comp of lesson.components ?? []) {
          if (comp.kind === "quiz" || comp.kind === "question" || comp.id === "videos") continue;
          components.push({
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            compTitle: comp.title,
            file: comp.file ?? "",
          });
        }
      }
    }
  }

  console.log("\n--- PER-LESSON IMAGE COUNT TABLE ---");
  console.log(
    "Lesson".padEnd(28) +
      " | Ed | Sav | Cmp | Pkg | Pub | Exp | PDF | pubType | renderer"
  );
  console.log("-".repeat(110));

  interface Row {
    name: string;
    lessonId: string;
    file: string;
    editor: number;
    saved: number;
    compiler: number;
    pkg: number;
    published: number;
    exp: number;
    pdf: number;
    pubType: string;
    expStepId: string;
    expRenderer: string;
    firstBadStage: string;
  }
  const rows: Row[] = [];

  for (const item of components) {
    const normPath = item.file.startsWith("/") ? item.file : `/${item.file}`;
    const fileRec = files.find((f) => f.path === normPath || f.path.endsWith(item.file.split("/").pop() ?? ""));
    const tex = fileRec?.content ?? "";
    const cmd = parseLessonTexCommand(tex);
    const editorNodes = parseDocumentBody(cmd?.body ?? tex);
    const saved = sanitizeProjectFileContent(normPath, tex);
    const savedNodes = parseDocumentBody(parseLessonTexCommand(saved)?.body ?? saved);
    const { compiled } = compileTexFile(normPath, tex, files);
    const pkgFile = snapshot.compiledPackage.files[normPath];

    let pubBlock: { type: string; content: unknown } | null = null;
    let pubLessonId = "";
    for (const t of universe?.tracks ?? []) {
      for (const m of t.modules) {
        for (const l of m.lessons) {
          if (l.id !== item.lessonId) continue;
          pubLessonId = l.id;
          for (const b of (l.contentBlocks as Array<{ type: string; content: unknown }>) ?? []) {
            const c = typeof b.content === "object" && b.content ? (b.content as { title?: string }) : {};
            const title = String(c.title ?? "").toLowerCase();
            if (title === item.compTitle.toLowerCase()) {
              pubBlock = b;
              break;
            }
          }
        }
      }
    }
    const pub = nodesFromBlock(pubBlock);

    let expImgs = -1;
    let expStepId = "";
    let expRenderer = "(no step)";
    if (expPkg && pubLessonId) {
      const les = expPkg.lessons[pubLessonId];
      const step = les?.steps.find(
        (s) => String(s.payload.title ?? s.title).toLowerCase() === item.compTitle.toLowerCase()
      );
      if (step) {
        expStepId = step.id;
        expImgs = imgCount(step.payload.nodes as DocumentNode[]);
        if (step.kind === "theory" || step.kind === "overview" || step.kind === "objectives") {
          expRenderer = "LessonDocumentReader→DocumentRenderer";
        } else if (step.kind === "summary") {
          expRenderer = "SummaryCompletion (NO DocumentRenderer)";
        } else {
          expRenderer = step.kind;
        }
      }
    }

    const pdfImgs = pdfImageCountForBlock(pubBlock);

    const compilerImgs = imgCount(compiled?.nodes);
    let firstBadStage = "";
    if (imgCount(editorNodes) !== compilerImgs) firstBadStage = "compiler";
    else if (imgCount(savedNodes) !== compilerImgs) firstBadStage = "save";
    else if (imgCount(pkgFile?.nodes) !== compilerImgs) firstBadStage = "compiled-package";
    else if (imgCount(pub.nodes) !== compilerImgs) firstBadStage = "published-db";
    else if (expImgs >= 0 && expImgs !== compilerImgs) firstBadStage = "experience-api";
    else if (pdfImgs !== compilerImgs) firstBadStage = "pdf";

    const row: Row = {
      name: item.compTitle,
      lessonId: item.lessonId,
      file: normPath,
      editor: imgCount(editorNodes),
      saved: imgCount(savedNodes),
      compiler: compilerImgs,
      pkg: imgCount(pkgFile?.nodes),
      published: imgCount(pub.nodes),
      exp: expImgs,
      pdf: pdfImgs,
      pubType: pub.type,
      expStepId,
      expRenderer,
      firstBadStage,
    };
    rows.push(row);
    console.log(
      `${row.name.padEnd(28)} | ${String(row.editor).padStart(2)} | ${String(row.saved).padStart(3)} | ${String(row.compiler).padStart(3)} | ${String(row.pkg).padStart(3)} | ${String(row.published).padStart(3)} | ${String(row.exp).padStart(3)} | ${String(row.pdf).padStart(3)} | ${row.pubType.padEnd(7)} | ${row.expRenderer}`
    );
  }

  console.log("\n--- FIRST DIVERGENCE BY STAGE ---");
  const stageOrder = ["published-db", "experience-api", "pdf"];
  for (const stage of stageOrder) {
    const hits = rows.filter((r) => r.firstBadStage === stage && r.compiler >= 0);
    if (hits.length) {
      const h = hits[0];
      console.log("\nFIRST DIVERGENCE FOUND:", h.name, `(${h.file})`);
      console.log("Stage:", stage);
      console.log("Lesson id:", h.lessonId);
      console.log("Step id:", h.expStepId || "(n/a)");
      console.log("Compiler images:", h.compiler, "| Published:", h.published, "| Exp:", h.exp, "| PDF:", h.pdf);
      console.log("Published block type:", h.pubType);
      console.log("Renderer:", h.expRenderer);
      if (stage === "published-db") {
        console.log("Reason: Published DB contentBlocks do not match compiled package (stale publish or wrong block type)");
        console.log("Code path: luPublishPipeline → publishLearningUniverse → prisma.lesson.contentBlocks");
      } else if (stage === "experience-api") {
        console.log("Reason: Experience step payload missing nodes[] or repair stripped content");
        console.log("File: backend/src/services/learningExperience/learningExperienceEngine.ts");
        console.log("Functions: buildLessonSteps / stepFromContentBlock / repairLearnerExperienceReading / consolidatePremiumReadingSteps");
      } else if (stage === "pdf") {
        console.log("Reason: renderContentBlock has no case for type=document — returns empty string");
        console.log("File: backend/src/services/latexPdfRenderer.ts");
        console.log("Function: renderContentBlock");
        console.log("Line: 403-404 (default: return \"\")");
      }
      break;
    }
  }

  console.log("\n--- PDF LOOP AUDIT (compile snapshot) ---");
  let idx = 0;
  let docBlocks = 0;
  let renderedNonEmpty = 0;
  let pdfImages = 0;
  for (const track of snapshot.parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const block of lesson.contentBlocks) {
          idx++;
          if (block.type !== "document") continue;
          docBlocks++;
          const c = block.content as { title?: string; nodes?: DocumentNode[] };
          const astCount = c.nodes?.length ?? 0;
          const astImages = imgCount(c.nodes);
          const rImgs = pdfImageCountForBlock(block);
          const rendered = rImgs > 0 ? "(has graphics)" : "";
          if (rImgs > 0 || block.type !== "document") renderedNonEmpty++;
          pdfImages += rImgs;
          if (astImages > 0 && rImgs === 0) {
            console.log(
              `  [${idx}] lesson="${lesson.title}" block="${c.title}" AST nodes=${astCount} images=${astImages} PDF images=${rImgs} RENDERED_EMPTY`
            );
          }
        }
      }
    }
  }
  console.log("Document blocks:", docBlocks, "| Non-empty PDF renders:", renderedNonEmpty, "| Total PDF images:", pdfImages);

  console.log("\n--- RENDERER DEPENDENCY (ExperienceRenderer.tsx) ---");
  console.log("overview/objectives/theory → LessonDocumentReader → LessonContainer → DocumentRenderer");
  console.log("summary (Lesson Complete step) → SummaryCompletion (NO images, message only)");
  console.log("visual builder StudentPreviewPane → MarkdownContent + ContentBlockRenderer (parallel, NOT DocumentRenderer)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
