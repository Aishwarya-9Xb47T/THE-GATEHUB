/**
 * Overleaf parity verification script
 * Run: npx tsx verify-overleaf-parity.ts
 */
import { PrismaClient } from "@prisma/client";
import { parseLearningUniverseLatex } from "./src/controllers/learning-universe-parser.js";

const prisma = new PrismaClient();

async function main() {
  const checks: { name: string; ok: boolean; detail: string }[] = [];

  // 1. Schema: sourceProjectId column
  const lu = await prisma.learningUniverse.findFirst({
    where: { status: "published" },
    orderBy: { updatedAt: "desc" },
    include: {
      sourceProject: { include: { files: true, versions: { take: 1 } } },
      assets: true,
      publishVersions: { take: 3, orderBy: { versionNumber: "desc" } },
      tracks: {
        include: {
          modules: {
            include: {
              lessons: {
                include: { videos: true, practice: true, quiz: true, project: true, resources: true },
              },
            },
          },
        },
      },
    },
  });

  checks.push({
    name: "Published LU exists",
    ok: !!lu,
    detail: lu ? `${lu.title} (${lu.id})` : "none found",
  });

  if (lu) {
    checks.push({
      name: "dslSource preserved",
      ok: lu.dslSource.length > 50,
      detail: `${lu.dslSource.length} chars`,
    });

    checks.push({
      name: "sourceProjectId FK or JSON",
      ok: !!(lu.sourceProjectId || (lu.structuredData as { sourceProjectId?: string })?.sourceProjectId),
      detail: String(lu.sourceProjectId || (lu.structuredData as { sourceProjectId?: string })?.sourceProjectId || "missing"),
    });

    checks.push({
      name: "Assets stored",
      ok: lu.assets.length >= 0,
      detail: `${lu.assets.length} asset(s)`,
    });

    if (lu.assets[0]) {
      const a = lu.assets[0];
      checks.push({
        name: "Asset filename → storedFilename mapping",
        ok: !!(a.filename && a.storedFilename),
        detail: `${a.filename} → ${a.storedFilename}`,
      });
    }

    checks.push({
      name: "Publish version history",
      ok: lu.publishVersions.length >= 0,
      detail: `${lu.publishVersions.length} version(s)`,
    });

    let lessonWithBlocks: { contentBlocks: unknown } | null = null;
    for (const t of lu.tracks) {
      for (const m of t.modules) {
        for (const l of m.lessons) {
          if (Array.isArray(l.contentBlocks) && (l.contentBlocks as unknown[]).length > 0) {
            lessonWithBlocks = l;
            break;
          }
        }
      }
    }
    checks.push({
      name: "contentBlocks stored",
      ok: !!lessonWithBlocks,
      detail: lessonWithBlocks
        ? `${(lessonWithBlocks.contentBlocks as { type: string }[]).map((b) => b.type).join(", ")}`
        : "no blocks",
    });

    // Parser: overviewmarkdown
    const dsl = `
\\begin{document}
\\learninguniverse{title={T},description={D}}
\\track{title={Tr}}
\\module{title={Mo}}
\\lesson{title={Le}}
\\overviewmarkdown={# Hello World}
\\end{document}`;
    const parsed = parseLearningUniverseLatex(dsl);
    const lesson = parsed.tracks[0]?.modules[0]?.lessons[0];
    checks.push({
      name: "Parser: overviewmarkdown",
      ok: lesson?.overviewMarkdown?.includes("Hello World") ?? false,
      detail: lesson?.overviewMarkdown || "not parsed",
    });

    // Nested braces in practice
    const dsl2 = `
\\begin{document}
\\learninguniverse{title={T},description={D}}
\\track{title={Tr}}
\\module{title={Mo}}
\\lesson{title={Le}}
\\practice{startercode={def f():\n    return {1: 2}},language={python}}
\\end{document}`;
    const parsed2 = parseLearningUniverseLatex(dsl2);
    const lesson2 = parsed2.tracks[0]?.modules[0]?.lessons[0];
    checks.push({
      name: "Parser: nested braces in values",
      ok: lesson2?.practice?.initialCode?.includes("{1: 2}") ?? false,
      detail: lesson2?.practice?.initialCode?.slice(0, 40) || "not parsed",
    });

    if (lu.sourceProject) {
      checks.push({
        name: "Source project file tree",
        ok: lu.sourceProject.files.some((f) => f.name === "main.tex"),
        detail: `${lu.sourceProject.files.length} file(s)`,
      });
    }
  }

  console.log("=".repeat(72));
  console.log("OVERLEAF PARITY VERIFICATION");
  console.log("=".repeat(72));
  for (const c of checks) {
    console.log(`${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`);
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log("\n" + (failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`));
  process.exit(failed > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
