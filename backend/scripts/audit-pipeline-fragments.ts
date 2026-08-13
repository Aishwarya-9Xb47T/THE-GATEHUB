/**
 * CI guard — fails if forbidden legacy pipeline patterns reappear in production code.
 * Run: npm run audit:pipeline-fragments
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const SCAN_DIRS = [
  path.join(ROOT, "backend/src"),
  path.join(ROOT, "frontend/src"),
  path.join(ROOT, "shared/lesson-body"),
];

const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "assessment-platform", "__tests__"]);

/** Patterns that must not appear in production render/publish paths (tests/scripts excluded). */
const FORBIDDEN: Array<{ id: string; pattern: RegExp; allowIn?: RegExp }> = [
  {
    id: "injectAllIncludeGraphicsForPublish",
    pattern: /injectAllIncludeGraphicsForPublish\s*\(/,
    allowIn: /luIncludeGraphicsInjector\.ts$/,
  },
  {
    id: "enrichLessonToDocumentBlocks",
    pattern: /enrichLessonToDocumentBlocks\s*\(/,
    allowIn: /documentPipeline\.(ts|d\.ts)$/,
  },
  {
    id: "parseLessonDocument in student/preview renderers",
    pattern: /parseLessonDocument\s*\(/,
    allowIn: /(componentPreview|luAuthoring|visualBuilder|LessonContainer|DocumentRenderer|LessonDocumentReader|LessonDocumentView)/,
  },
  {
    id: "legacy OverviewReader import",
    pattern: /from\s+["'].*OverviewReader["']/,
  },
  {
    id: "legacy TheoryReader import",
    pattern: /from\s+["'].*TheoryReader["']/,
  },
  {
    id: "LessonTexBody",
    pattern: /LessonTexBody/,
  },
  {
    id: "publish without projectId bypass comment",
    pattern: /Legacy DSL-only publish/,
    allowIn: /learning-universe\.ts$/,
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

function isFrontendRendererPath(r: string): boolean {
  return (
    r.startsWith("frontend/src/learning-engine/") ||
    r.startsWith("frontend/src/components/learning/") ||
    r.startsWith("frontend/src/components/experience-studio/") ||
    r.startsWith("frontend/src/components/visual-authoring/")
  );
}

function rel(p: string): string {
  return path.relative(ROOT, p).replace(/\\/g, "/");
}

function main() {
  const files = SCAN_DIRS.flatMap((d) => walk(d));
  const violations: string[] = [];

  for (const file of files) {
    const r = rel(file);
    if (r.includes("/scripts/") || r.startsWith("backend/scripts/")) continue;
    if (r.includes("test-") || r.includes(".spec.")) continue;

    const text = readFileSync(file, "utf8");
    for (const rule of FORBIDDEN) {
      if (!rule.pattern.test(text)) continue;
      if (rule.allowIn?.test(r)) continue;
      if (rule.id === "parseLessonDocument in student/preview renderers") {
        if (!isFrontendRendererPath(r)) continue;
        if (/(componentPreview|luAuthoring|visualBuilder)/.test(r)) continue;
      }
      violations.push(`${rule.id} → ${r}`);
    }
  }

  console.log("=".repeat(72));
  console.log("PIPELINE FRAGMENT AUDIT");
  console.log("Scanned files:", files.length);
  console.log("=".repeat(72));

  if (violations.length) {
    console.log("\nFORBIDDEN PATTERNS FOUND:");
    for (const v of violations) console.log(" -", v);
    process.exit(1);
  }

  console.log("\nNo forbidden pipeline fragments detected.");
}

main();
