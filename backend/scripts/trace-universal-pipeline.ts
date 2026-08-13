/**
 * Full pipeline trace: Overview vs Summary for one lesson.
 * Run: npx tsx backend/scripts/trace-universal-pipeline.ts [universeId] [lessonId]
 */
import { prisma } from "../src/utils/prisma.js";
import { loadProjectFiles } from "../src/services/luProject/luProjectFiles.js";
import { resolveLuV2ContentSnapshot } from "../src/services/luProject/luCompileSource.js";
import {
  extractLessonBodyFromTex,
  parseLessonDocument,
  parseLessonTexCommand,
  parseDocumentBody,
} from "../../shared/lesson-body/index.js";
import {
  buildLearnerExperienceFromPublishedUniverse,
} from "../src/services/learningExperience/learningExperienceEngine.js";
import {
  parseLessonDocumentFromContent,
} from "../../shared/lesson-body/index.js";
import type { LuContentBlock } from "../src/services/learningUniverseSchema.js";

const universeId = process.argv[2] || "cmr1t3kg100012biy19hs4d11";
const lessonId = process.argv[3] || "cmrayq9fa000bnxx6m30void3";

function stageHeader(label: string) {
  console.log(`\n${"=".repeat(72)}\n${label}\n${"=".repeat(72)}`);
}

function printAst(nodes: ReturnType<typeof parseDocumentBody>) {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.type === "markdown") {
      console.log(`  [${i}] markdown: ${JSON.stringify(n.content.slice(0, 120))}${n.content.length > 120 ? "…" : ""}`);
    } else if (n.type === "image") {
      console.log(`  [${i}] image: ref=${n.ref} centered=${n.centered} width=${n.widthOption ?? "(none)"}`);
    } else {
      console.log(`  [${i}] ${n.type}: ${JSON.stringify(n).slice(0, 100)}`);
    }
  }
}

function traceTexSource(name: string, tex: string | undefined | null) {
  stageHeader(`STAGE 1 — Raw file: ${name}`);
  if (!tex?.trim()) {
    console.log("  (empty or missing)");
    return null;
  }
  console.log(tex.slice(0, 800));
  if (tex.length > 800) console.log(`  … (${tex.length} chars total)`);

  stageHeader(`STAGE 2 — parseLessonTexCommand(): ${name}`);
  const cmd = parseLessonTexCommand(tex);
  if (!cmd) {
    console.log("  (null — no wrapper detected)");
  } else {
    console.log("  command:", cmd.command);
    console.log("  title:", cmd.title ?? "(none)");
    console.log("  body length:", cmd.body.length);
    console.log("  body has includegraphics:", /\\includegraphics/i.test(cmd.body));
    console.log("  body snippet:", cmd.body.slice(0, 300));
  }

  const body = extractLessonBodyFromTex(tex) || tex;
  stageHeader(`STAGE 3 — parseDocumentBody(): ${name}`);
  const nodes = parseDocumentBody(body);
  console.log(`  node count: ${nodes.length}`);
  console.log(`  node types: ${nodes.map((n) => n.type).join(", ")}`);
  printAst(nodes);

  stageHeader(`STAGE 3b — parseLessonDocument(): ${name}`);
  const doc = parseLessonDocument(tex);
  console.log("  title:", doc.title ?? "(none)");
  console.log(`  nodes: ${doc.nodes.map((n) => n.type).join(", ")}`);
  return { tex, cmd, body, nodes, doc };
}

function traceBlock(name: string, block: LuContentBlock | undefined, overviewMarkdown?: string) {
  stageHeader(`STAGE 1 — Published block: ${name}`);
  if (!block && !overviewMarkdown) {
    console.log("  (missing)");
    return null;
  }

  if (name === "overview" && overviewMarkdown) {
    console.log("  source: lesson.overviewMarkdown");
    console.log("  length:", overviewMarkdown.length);
    console.log("  has includegraphics:", /\\includegraphics/i.test(overviewMarkdown));
    console.log("  snippet:", overviewMarkdown.slice(0, 400));
    return traceTexSource(name, overviewMarkdown);
  }

  if (!block) return null;
  console.log("  block.type:", block.type);
  console.log("  content:", JSON.stringify(block.content, null, 2).slice(0, 600));

  const c = typeof block.content === "object" && block.content ? (block.content as Record<string, unknown>) : {};
  const body = String(
    typeof block.content === "string"
      ? block.content
      : c.body ?? c.text ?? c.markdown ?? c.content ?? ""
  );
  console.log("  extracted body length:", body.length);
  console.log("  body has includegraphics:", /\\includegraphics/i.test(body));

  return traceTexSource(name, body);
}

async function main() {
  console.log("Universe:", universeId);
  console.log("Lesson:", lessonId);

  const universe = await prisma.learningUniverse.findUnique({
    where: { id: universeId },
    select: {
      id: true,
      title: true,
      sourceProjectId: true,
      currentPublishVersionId: true,
      structuredData: true,
      tracks: {
        include: {
          modules: {
            include: {
              lessons: {
                where: { id: lessonId },
                select: {
                  id: true,
                  title: true,
                  overviewMarkdown: true,
                  overviewHtml: true,
                  contentBlocks: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!universe) {
    console.error("Universe not found");
    process.exit(1);
  }

  let lesson: {
    id: string;
    title: string;
    overviewMarkdown: string | null;
    overviewHtml: string | null;
    contentBlocks: unknown;
  } | null = null;

  for (const track of universe.tracks) {
    for (const mod of track.modules) {
      for (const les of mod.lessons) {
        if (les.id === lessonId) lesson = les;
      }
    }
  }

  if (!lesson) {
    console.error("Lesson not found in universe");
    process.exit(1);
  }

  const blocks = (lesson.contentBlocks as LuContentBlock[]) ?? [];
  const overviewBlock = blocks.find((b) => b.type === "overview");
  const summaryBlock = blocks.find((b) => b.type === "summary" || (b.type === "theory" && String((b.content as Record<string, unknown>)?.title ?? "").toLowerCase() === "summary"));

  console.log("\nAll content block types in lesson:", blocks.map((b) => b.type).join(", "));

  const overviewTrace = traceBlock(
    "overview",
    overviewBlock,
    lesson.overviewMarkdown ?? undefined
  );
  const summaryTrace = traceBlock("summary", summaryBlock);

  stageHeader("STAGE 4 — Experience engine step payloads");
  const pkg = buildLearnerExperienceFromPublishedUniverse({
    id: universe.id,
    title: universe.title,
    description: "",
    tracks: universe.tracks.map((t) => ({
      id: t.id,
      title: t.title,
      modules: t.modules.map((m) => ({
        id: m.id,
        title: m.title,
        lessons: m.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          overviewMarkdown: l.overviewMarkdown,
          overviewHtml: l.overviewHtml,
          contentBlocks: (l.contentBlocks as LuContentBlock[]) ?? [],
          videos: [],
          practice: null,
          quiz: null,
          project: null,
          resources: [],
        })),
      })),
    })),
  });

  const lessonExp = pkg.lessons[lessonId];
  const overviewStep = lessonExp?.steps.find((s) => s.kind === "overview");
  const summaryStep = lessonExp?.steps.find(
    (s) =>
      s.kind === "theory" &&
      (String(s.payload.title ?? s.title).toLowerCase().includes("summary") ||
        s.id.includes("block"))
  );

  for (const [label, step] of [
    ["overview step", overviewStep],
    ["summary step", summaryStep],
  ] as const) {
    console.log(`\n--- ${label} ---`);
    if (!step) {
      console.log("  (not found)");
      continue;
    }
    console.log("  id:", step.id);
    console.log("  kind:", step.kind);
    console.log("  title:", step.title);
    const body = String(step.payload.body ?? step.payload.text ?? step.payload.markdown ?? "");
    console.log("  payload.body length:", body.length);
    console.log("  payload has includegraphics:", /\\includegraphics/i.test(body));
    console.log("  payload.nodes:", Array.isArray(step.payload.nodes) ? (step.payload.nodes as unknown[]).map((n: unknown) => (n as { type: string }).type).join(", ") : "(none)");
    console.log("  body snippet:", body.slice(0, 300));

    const doc = parseLessonDocumentFromContent(step.payload);
    console.log("  parseLessonDocumentFromContent nodes:", doc.nodes.map((n) => n.type).join(", "));
  }

  stageHeader("DIVERGENCE ANALYSIS");
  const ovNodes = overviewTrace?.doc.nodes.map((n) => n.type).join(",") ?? "MISSING";
  const sumNodes = summaryTrace?.doc.nodes.map((n) => n.type).join(",") ?? "MISSING";
  console.log("Overview AST:", ovNodes);
  console.log("Summary AST:", sumNodes);
  if (ovNodes !== sumNodes) {
    console.log("\n>>> FIRST DIVERGENCE: STAGE 1/3 — source data or parse output differs");
    if (overviewTrace && !overviewTrace.body.includes("\\includegraphics") && summaryTrace && !summaryTrace.body.includes("\\includegraphics")) {
      console.log(">>> Both bodies lack includegraphics in DB — image never reached publish pipeline");
    } else if (overviewTrace?.body.includes("\\includegraphics") && summaryTrace && !summaryTrace.body.includes("\\includegraphics")) {
      console.log(">>> Summary body missing includegraphics while Overview has it — publish/compile strips or fails to inject for summary");
    }
  } else {
    console.log("ASTs match at parse stage — bug is downstream (experience engine or React)");
  }

  if (universe.sourceProjectId) {
    stageHeader("STAGE 1 — Raw .tex files from project DB");
    const projectId = universe.sourceProjectId;
    const files = await loadProjectFiles(projectId);
    const snapshot = await resolveLuV2ContentSnapshot(projectId, { runBuild: false });

    for (const stem of ["overview", "summary"]) {
      const texFile = files.find((f) => f.path.toLowerCase().replace(/\\/g, "/").includes(`/${stem}.tex`));
      console.log(`\n--- ${stem}.tex ---`);
      console.log("  path:", texFile?.path ?? "(not found)");
      if (texFile?.content) {
        console.log("  has includegraphics:", texFile.content.includes("\\includegraphics"));
        console.log("  snippet:", texFile.content.slice(0, 400));
        traceTexSource(`${stem}.tex (project file)`, texFile.content);
      }
    }

    if (snapshot) {
      stageHeader("Compiled snapshot blocks for lesson");
      for (const track of snapshot.parsed.tracks) {
        for (const mod of track.modules) {
          for (const les of mod.lessons) {
            if (!les.title.toLowerCase().includes(lesson.title.toLowerCase().slice(0, 20))) continue;
            for (const b of les.contentBlocks) {
              if (b.type !== "overview" && b.type !== "summary" && b.type !== "theory") continue;
              const c = b.content as Record<string, unknown>;
              const title = String(c?.title ?? b.type);
              if (!/overview|summary/i.test(title) && b.type !== "overview") continue;
              const body = String(c?.body ?? c?.text ?? (typeof b.content === "string" ? b.content : ""));
              console.log(`\n  block type=${b.type} title=${title}`);
              console.log("    has includegraphics:", body.includes("\\includegraphics"));
              console.log("    snippet:", body.slice(0, 200));
            }
            if (les.overviewMarkdown) {
              console.log("\n  overviewMarkdown has includegraphics:", les.overviewMarkdown.includes("\\includegraphics"));
            }
          }
        }
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
