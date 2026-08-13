/**
 * THE GATEHUB — Final stabilization verification harness.
 * Run: npx tsx verify-stabilization-phase.ts
 *
 * Executes all automatable unit, integration, compile, publish-prep,
 * API, and database consistency checks. Produces a structured report.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { prisma } from "./src/utils/prisma.js";
import { compileLatexLocally } from "./src/services/latexCompileService.js";
import { resolveLuV2CompileSource } from "./src/services/luProject/luCompileSource.js";
import { prepareProjectForPublish } from "./src/services/luProject/luPublishPipeline.js";
import { loadProjectFiles, isLuV2Project } from "./src/services/luProject/luProjectFiles.js";
import { resolveApiBase } from "./test-api-base.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = resolveApiBase();
const JWT_SECRET = process.env.JWT_SECRET || "supersecret_jwt_key_123_456_789";

type Status = "PASS" | "FAIL" | "SKIP" | "BLOCKED";
interface Result {
  workflow: string;
  check: string;
  status: Status;
  detail: string;
  ms?: number;
}

const results: Result[] = [];

function record(workflow: string, check: string, status: Status, detail: string, ms?: number) {
  results.push({ workflow, check, status, detail, ms });
  const icon = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : status === "SKIP" ? "○" : "⊘";
  console.log(`${icon} [${workflow}] ${check}${ms != null ? ` (${ms}ms)` : ""}`);
  if (status !== "PASS") console.log(`    ${detail}`);
}

function runScript(name: string, workflow = "Automated Tests"): boolean {
  const start = Date.now();
  const r = spawnSync("npx", ["tsx", name], {
    cwd: __dirname,
    shell: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  const ms = Date.now() - start;
  const ok = r.status === 0;
  record(workflow, name, ok ? "PASS" : "FAIL", ok ? "exit 0" : (r.stderr || r.stdout || "").slice(0, 300), ms);
  return ok;
}

async function api(path: string, token?: string, opts: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

function sign(user: { id: string; email: string; role: string; tokenVersion?: number }) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion ?? 0 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// --- Child test suites ---
const CHILD_TESTS = [
  "test-stabilization-suite.ts",
  "test-lu-production-hardening.ts",
  "test-lu-crud-engine.ts",
  "test-lu-transaction-engine.ts",
  "test-lu-ide-workflows.ts",
  "test-lu-media-e2e.ts",
  "test-learning-experience-engine.ts",
  "test-latex-log-parser.ts",
  "test-latex-utf8-listings.ts",
  "test-ai-video-placeholder.ts",
];

async function verifyApiHealth() {
  const start = Date.now();
  try {
    const health = await api("/health");
    const landing = await api("/learning-universes/catalog/landing");
    const ok = health.status === 200 && landing.status === 200;
    record(
      "Platform",
      "Backend API reachable",
      ok ? "PASS" : "FAIL",
      ok ? `health=${health.status} landing=${landing.status}` : `health=${health.status} landing=${landing.status}`,
      Date.now() - start
    );
  } catch (e) {
    record("Platform", "Backend API reachable", "FAIL", e instanceof Error ? e.message : String(e));
  }
}

async function verifyDbConsistency() {
  const start = Date.now();
  const issues: string[] = [];

  try {
    const publishedNoTracks = await prisma.learningUniverse.count({
      where: { status: "published", tracks: { none: {} } },
    });
    if (publishedNoTracks > 0) issues.push(`${publishedNoTracks} published LU(s) with zero tracks`);

    const allUserIds = (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id);
    if (allUserIds.length) {
      const orphanProjects = await prisma.latexProject.count({
        where: { ownerId: { notIn: allUserIds } },
      });
      if (orphanProjects > 0) issues.push(`${orphanProjects} projects with invalid ownerId`);
    }

    const recentMissingSource = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
      SELECT COUNT(*) as cnt FROM "LearningUniverse"
      WHERE status = 'published'
        AND source_project_id IS NULL
        AND published_at >= NOW() - INTERVAL '7 days'
        AND (structured_data->>'projectType') = 'v2'
        AND (structured_data->>'sourceProjectId') IS NULL
    `;
    const missingCount = Number(recentMissingSource[0]?.cnt ?? 0);
    if (missingCount > 0) {
      issues.push(`${missingCount} v2 publish(es) in last 7d missing sourceProjectId in DB and structuredData`);
    }

    const dupLessonTitles = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
      SELECT COUNT(*) as cnt FROM (
        SELECT module_id, title, COUNT(*) c
        FROM "LearningUniverseLesson"
        GROUP BY module_id, title
        HAVING COUNT(*) > 1
      ) d`;
    const dupCount = Number(dupLessonTitles[0]?.cnt ?? 0);
    if (dupCount > 0) issues.push(`${dupCount} duplicate lesson title groups`);
  } catch (e) {
    issues.push(e instanceof Error ? e.message : String(e));
  }

  record(
    "Database",
    "Consistency checks",
    issues.length === 0 ? "PASS" : "FAIL",
    issues.length ? issues.join("; ") : "no orphan/orphan-track/duplicate issues detected",
    Date.now() - start
  );
}

async function verifyCompileWorkflows() {
  const project = await prisma.latexProject.findFirst({
    where: {
      files: { some: { path: "/project.json" } },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true },
  });

  if (!project) {
    record("LaTeX Compile", "Large LU project compile", "SKIP", "no v2 project in DB");
    return;
  }

  const start = Date.now();
  try {
    const source = await resolveLuV2CompileSource(project.id, { forPdf: true, skipBuild: true });
    const result = await compileLatexLocally(project.id, source.mergedTex, {
      copyReferencedImages: true,
      enableBibtex: false,
      maxPasses: 2,
      preserveProvidedMainTex: true,
      timeoutMs: 120000,
    });
    record(
      "LaTeX Compile",
      `Compile "${project.title}"`,
      result.success ? "PASS" : "FAIL",
      result.success ? `PDF ${result.pdfPath}` : result.errors[0]?.message ?? "unknown",
      Date.now() - start
    );
  } catch (e) {
    record("LaTeX Compile", `Compile "${project.title}"`, "FAIL", e instanceof Error ? e.message : String(e), Date.now() - start);
  }
}

async function verifyPublishPrep() {
  const project = await prisma.latexProject.findFirst({
    where: { files: { some: { path: "/project.json" } } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true },
  });
  if (!project) {
    record("Publish", "Fast publish prep", "SKIP", "no v2 project");
    return;
  }

  const start = Date.now();
  try {
    const build = await prepareProjectForPublish(project.id);
    const files = await loadProjectFiles(project.id);
    const parsed = build.mergedTex
      ? (await import("./src/controllers/learning-universe-parser.js")).parseLearningUniverseLatex(build.mergedTex)
      : null;
    const lessonCount =
      parsed?.tracks.reduce((n, t) => n + t.modules.reduce((m, mod) => m + mod.lessons.length, 0), 0) ?? 0;

    record(
      "Publish",
      `Publish prep (no DB write) "${project.title}"`,
      build.ready && lessonCount > 0 ? "PASS" : "FAIL",
      build.ready
        ? `merged DSL ok, ${lessonCount} lessons, ${files.length} files`
        : build.issues.find((i) => i.severity === "error")?.message ?? "not ready",
      Date.now() - start
    );
  } catch (e) {
    record("Publish", "Publish prep", "FAIL", e instanceof Error ? e.message : String(e), Date.now() - start);
  }
}

async function verifyStudentJourney() {
  const start = Date.now();
  const student = await prisma.user.findFirst({ where: { role: "student" } });
  const published = await prisma.learningUniverse.findFirst({
    where: { status: "published" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true },
  });
  if (!student || !published) {
    record("Student Journey", "API course experience", "SKIP", "missing student or published LU");
    return;
  }

  const token = sign(student);
  const detail = await api(`/learning-universes/${published.id}`, token);
  const exp = await api(`/learning-universes/${published.id}/experience`, token);

  const ok = detail.status === 200 && exp.status === 200;
  const tracks = (detail.json as { data?: { tracks?: unknown[] } })?.data?.tracks?.length ?? 0;
  record(
    "Student Journey",
    "Open published LU + experience API",
    ok ? "PASS" : "FAIL",
    ok ? `${published.title}, ${tracks} tracks` : `detail=${detail.status} exp=${exp.status}`,
    Date.now() - start
  );
}

async function verifyInstructorJourney() {
  const start = Date.now();
  const instructor = await prisma.user.findFirst({ where: { role: "instructor" } });
  if (!instructor) {
    record("Instructor Journey", "Dashboard APIs", "SKIP", "no instructor");
    return;
  }
  const token = sign(instructor);
  const courses = await api("/courses/my-instructor", token);
  const universes = await api("/learning-universes/mine", token);
  const ok = courses.status === 200 && universes.status === 200;
  record(
    "Instructor Journey",
    "My courses + my universes APIs",
    ok ? "PASS" : "FAIL",
    ok ? "HTTP 200" : `courses=${courses.status} universes=${universes.status}`,
    Date.now() - start
  );
}

async function verifyAdminJourney() {
  const start = Date.now();
  const admin = await prisma.user.findFirst({
    where: { role: { in: ["admin", "super_admin"] } },
  });
  if (!admin) {
    record("Admin Journey", "Admin APIs", "SKIP", "no admin user");
    return;
  }
  const token = sign(admin);
  const users = await api("/admin/users?limit=5", token);
  const ok = users.status === 200;
  record(
    "Admin Journey",
    "User management API",
    ok ? "PASS" : "FAIL",
    ok ? "HTTP 200" : `HTTP ${users.status}`,
    Date.now() - start
  );
}

async function verifyCatalogRouting() {
  const start = Date.now();
  const featured = await api("/courses?featured=home&limit=20");
  const landing = await api("/learning-universes/catalog/landing");
  const ok = featured.status === 200 && landing.status === 200;
  record(
    "Catalog",
    "Featured + landing catalog APIs",
    ok ? "PASS" : "FAIL",
    ok ? "HTTP 200" : `featured=${featured.status} landing=${landing.status}`,
    Date.now() - start
  );
}

async function verifyManualStudioProject() {
  const start = Date.now();
  const projectId = "cmqwb6cmd0003psovtvzb7lhb";
  const files = await loadProjectFiles(projectId);
  if (!isLuV2Project(files)) {
    record("Academic Studio", "Web Development project structure", "SKIP", "project not found");
    return;
  }
  const texCount = files.filter((f) => !f.isFolder && f.path.endsWith(".tex")).length;
  const hasManifest = files.some((f) => f.path.includes("course.manifest"));
  record(
    "Academic Studio",
    "Web Development v2 project files",
    texCount > 100 ? "PASS" : "FAIL",
    `${texCount} .tex files, manifest=${hasManifest}`,
    Date.now() - start
  );
}

async function main() {
  console.log("=".repeat(72));
  console.log("THE GATEHUB — FINAL STABILIZATION VERIFICATION");
  console.log(new Date().toISOString());
  console.log("=".repeat(72));
  console.log();

  for (const t of CHILD_TESTS) {
    if (!fs.existsSync(path.join(__dirname, t))) {
      record("Automated Tests", t, "SKIP", "file not found");
      continue;
    }
    runScript(t);
  }

  console.log("\n--- Live integration checks ---\n");

  await verifyApiHealth();
  await verifyDbConsistency();
  await verifyManualStudioProject();
  await verifyCompileWorkflows();
  await verifyPublishPrep();
  await verifyCatalogRouting();
  await verifyStudentJourney();
  await verifyInstructorJourney();
  await verifyAdminJourney();

  // Workflows requiring browser/UI — cannot automate here
  const blocked: Array<[string, string]> = [
    ["Visual Studio", "Requires browser UI automation (no Playwright suite)"],
    ["UI/UX polish", "Requires visual regression / manual viewport audit"],
    ["AI multi-domain quality", "Requires OpenAI calls + human rubric (blocked without API budget gate)"],
    ["Payment purchase flow", "Requires Razorpay/Stripe sandbox credentials"],
  ];
  for (const [wf, reason] of blocked) {
    record(wf, "Full E2E", "BLOCKED", reason);
  }

  // Spawn API-heavy verifiers if backend up
  if (results.find((r) => r.check === "Backend API reachable")?.status === "PASS") {
    for (const script of ["verify-lu-progress-e2e.ts", "verify-certificate-system.ts"]) {
      if (fs.existsSync(path.join(__dirname, script))) {
        runScript(script, script.replace(".ts", ""));
      }
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log("VERIFICATION REPORT");
  console.log("=".repeat(72));

  const byWorkflow = new Map<string, Result[]>();
  for (const r of results) {
    if (!byWorkflow.has(r.workflow)) byWorkflow.set(r.workflow, []);
    byWorkflow.get(r.workflow)!.push(r);
  }

  for (const [wf, items] of byWorkflow) {
    const pass = items.filter((i) => i.status === "PASS").length;
    const fail = items.filter((i) => i.status === "FAIL").length;
    const blocked = items.filter((i) => i.status === "BLOCKED").length;
    console.log(`\n${wf}: ${pass} pass, ${fail} fail, ${blocked} blocked`);
    for (const i of items.filter((x) => x.status === "FAIL")) {
      console.log(`  ✗ ${i.check}: ${i.detail}`);
    }
  }

  const totalFail = results.filter((r) => r.status === "FAIL").length;
  const totalPass = results.filter((r) => r.status === "PASS").length;
  const totalBlocked = results.filter((r) => r.status === "BLOCKED").length;

  console.log("\n" + "-".repeat(72));
  console.log(`TOTAL: ${totalPass} PASS | ${totalFail} FAIL | ${totalBlocked} BLOCKED | ${results.length} checks`);
  console.log("-".repeat(72));

  const reportPath = path.join(__dirname, "verification-report.json");
  fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(`Report written: ${reportPath}`);

  if (totalFail > 0) {
    console.log("\n❌ PLATFORM NOT STABLE — fix failures above before tagging baseline.");
    process.exit(1);
  }

  if (totalBlocked > 0) {
    console.log("\n⚠️  Automated checks passed but some workflows are BLOCKED (need UI/payment/AI rubric).");
    console.log("   Do NOT declare full production-ready until blocked items are addressed.");
    process.exit(2);
  }

  console.log("\n✅ All automatable verification checks passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
