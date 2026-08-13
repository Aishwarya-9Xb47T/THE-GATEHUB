/**
 * Phase 2: Overleaf Version History & Restore verification
 * Run: npx tsx backend/verify-overleaf-versioning.ts
 */
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { prisma } from "./src/utils/prisma.js";
import { publishLearningUniverse } from "./src/controllers/learning-universe-controller.js";

const BASE = process.env.API_URL || "http://localhost:5000/api";
const JWT_SECRET = process.env.JWT_SECRET || "supersecret_jwt_key_123_456_789";
const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR || "uploads");

type CheckResult = { name: string; pass: boolean; detail: string };
const results: CheckResult[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}`);
  console.log(`  ${detail}\n`);
}

async function api(path: string, token: string, opts: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json };
}

const DSL_V1 = `\\learninguniverse{
title={Version Test LU},
description={Phase 2 verification}
}
\\track{
title={Track A},
\\module{
title={Module 1},
\\lesson{title={Lesson One}}
}
}`;

const DSL_V2 = `\\learninguniverse{
title={Version Test LU Updated},
description={Phase 2 verification — v2}
}
\\track{
title={Track B},
\\module{
title={Module 2},
\\lesson{title={Lesson Two}}
}
}`;

async function main() {
  console.log("=== Phase 2: Overleaf Version History Verification ===\n");

  const instructor = await prisma.user.findFirst({ where: { role: "instructor" } });
  if (!instructor) {
    console.log("FAIL: No instructor user");
    process.exit(1);
  }

  const token = jwt.sign({ userId: instructor.id }, JWT_SECRET);

  const project = await prisma.latexProject.create({
    data: {
      title: "Version History Test Project",
      ownerId: instructor.id,
      files: {
        create: [
          {
            name: "main.tex",
            path: "/main.tex",
            isFolder: false,
            content: DSL_V1,
          },
          {
            name: "notes.tex",
            path: "/notes.tex",
            isFolder: false,
            content: "% auxiliary file v1",
          },
        ],
      },
    },
    include: { files: true },
  });

  check("DB: test project created", !!project.id, project.id);

  // --- Manual snapshot via API ---
  const snapRes = await api(`/latex-projects/${project.id}/versions`, token, {
    method: "POST",
    body: { notes: "Initial manual snapshot" },
  });
  const snapData = (snapRes.json as { success: boolean; data: { id: string; versionNumber: number } }).data;
  check(
    "API: manual snapshot creation",
    snapRes.status === 201 && snapData?.versionNumber === 1,
    JSON.stringify(snapData)
  );

  const dbSnap = await prisma.latexProjectVersion.findFirst({
    where: { projectId: project.id, versionNumber: 1 },
  });
  check(
    "DB: snapshot row with file inventory",
    !!dbSnap && !!dbSnap.fileInventory && Array.isArray(dbSnap.fileInventory) && (dbSnap.fileInventory as unknown[]).length >= 2,
    JSON.stringify({ id: dbSnap?.id, files: Array.isArray(dbSnap?.fileInventory) ? (dbSnap!.fileInventory as unknown[]).length : 0 })
  );

  // --- Publish creates version snapshot ---
  await prisma.latexFile.update({
    where: { id: project.files.find((f) => f.name === "main.tex")!.id },
    data: { content: DSL_V1 },
  });

  const universe = await publishLearningUniverse(DSL_V1, instructor.id, undefined, {
    projectId: project.id,
  });
  check("API: publish creates LU", !!universe.id, universe.id);

  const publishVersion = await prisma.latexProjectVersion.findFirst({
    where: { projectId: project.id, publishType: "publish" },
    orderBy: { versionNumber: "desc" },
  });
  check(
    "DB: publish snapshot exists",
    !!publishVersion && publishVersion.learningUniverseId === universe.id,
    JSON.stringify({ versionNumber: publishVersion?.versionNumber, luId: publishVersion?.learningUniverseId })
  );

  // --- Update and republish for second version ---
  await prisma.latexFile.update({
    where: { id: project.files.find((f) => f.name === "main.tex")!.id },
    data: { content: DSL_V2 },
  });
  await publishLearningUniverse(DSL_V2, instructor.id, undefined, {
    projectId: project.id,
    universeId: universe.id,
  });

  const listRes = await api(`/latex-projects/${project.id}/versions`, token);
  const versions = (listRes.json as { success: boolean; data: { id: string; versionNumber: number; publishType: string }[] }).data;
  check(
    "API: list versions",
    listRes.status === 200 && versions.length >= 3,
    `count=${versions.length}, types=${versions.map((v) => v.publishType).join(",")}`
  );

  const v1 = versions.find((v) => v.publishType === "publish") || versions[versions.length - 1];
  const v2 = versions.find((v) => v.publishType === "republish") || versions[0];

  // --- Version details ---
  const detailRes = await api(`/latex-projects/${project.id}/versions/${v1.id}`, token);
  const detail = (detailRes.json as { success: boolean; data: { dslSnapshot: string; fileInventory: unknown[] } }).data;
  check(
    "API: version details (DSL + files)",
    detailRes.status === 200 && detail.dslSnapshot.includes("Version Test LU") && detail.fileInventory.length >= 1,
    `dslLen=${detail.dslSnapshot?.length}, files=${detail.fileInventory?.length}`
  );

  // --- Compare versions ---
  const compareRes = await api(
    `/latex-projects/${project.id}/versions/compare?a=${v1.id}&b=${v2.id}`,
    token
  );
  const comparison = (compareRes.json as {
    success: boolean;
    data: { changedFiles: string[]; dslDiff: { type: string }[] };
  }).data;
  check(
    "API: compare versions",
    compareRes.status === 200 && (comparison.dslDiff.length > 0 || comparison.changedFiles.length > 0),
    JSON.stringify({ changedFiles: comparison.changedFiles, dslDiffLines: comparison.dslDiff.length })
  );

  // --- Restore older version ---
  const enrollmentBefore = await prisma.learningUniverseEnrollment.count({
    where: { learningUniverseId: universe.id },
  });

  const restoreRes = await api(`/latex-projects/${project.id}/versions/${v1.id}/restore`, token, {
    method: "POST",
  });
  const restoreData = (restoreRes.json as { success: boolean; data: { restoredVersionNumber: number } }).data;
  check(
    "API: restore version",
    restoreRes.status === 200 && restoreData.restoredVersionNumber === v1.versionNumber,
    JSON.stringify(restoreData)
  );

  const safetySnap = await prisma.latexProjectVersion.findFirst({
    where: { projectId: project.id, isSafetySnapshot: true },
    orderBy: { createdAt: "desc" },
  });
  check("DB: safety snapshot before restore", !!safetySnap, JSON.stringify({ id: safetySnap?.id, label: safetySnap?.label }));

  const restoredMain = await prisma.latexFile.findFirst({
    where: { projectId: project.id, name: "main.tex" },
  });
  check(
    "DB: DSL restored in main.tex",
    restoredMain?.content?.includes("Version Test LU") === true,
    `content preview: ${restoredMain?.content?.slice(0, 60)}`
  );

  const enrollmentAfter = await prisma.learningUniverseEnrollment.count({
    where: { learningUniverseId: universe.id },
  });
  check(
    "DB: LU enrollments unchanged after restore",
    enrollmentBefore === enrollmentAfter,
    `before=${enrollmentBefore}, after=${enrollmentAfter}`
  );

  // --- Compile after restore ---
  const compileRes = await fetch(`${BASE}/latex/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: project.id, code: restoredMain?.content || DSL_V1 }),
  });
  const compileJson = (await compileRes.json()) as { success: boolean; fileUrl?: string };
  check(
    "API: compile after restore",
    compileRes.status === 200 && compileJson.success === true,
    JSON.stringify({ success: compileJson.success, fileUrl: compileJson.fileUrl?.slice(0, 60) })
  );

  // --- Publish after restore (republish) ---
  const republishUniverse = await publishLearningUniverse(
    restoredMain?.content || DSL_V1,
    instructor.id,
    undefined,
    { projectId: project.id, universeId: universe.id }
  );
  const luAfterRepublish = await prisma.learningUniverse.findUnique({
    where: { id: republishUniverse.id },
    include: { tracks: { include: { modules: { include: { lessons: true } } } } },
  });
  check(
    "DB: LU integrity after restore + republish",
    luAfterRepublish?.title === "Version Test LU" && (luAfterRepublish.tracks[0]?.title === "Track A"),
    JSON.stringify({ title: luAfterRepublish?.title, track: luAfterRepublish?.tracks[0]?.title })
  );

  // --- Timeline ---
  const timelineRes = await api(`/latex-projects/${project.id}/timeline`, token);
  const timeline = (timelineRes.json as { success: boolean; data: { eventType: string }[] }).data;
  check(
    "API: project timeline",
    timelineRes.status === 200 && timeline.some((e) => e.eventType === "restored") && timeline.some((e) => e.eventType === "published" || e.eventType === "republished"),
    `events=${timeline.map((e) => e.eventType).join(",")}`
  );

  // --- Frontend evidence (component file exists) ---
  const panelPath = path.join(process.cwd(), "..", "frontend", "src", "components", "overleaf", "VersionHistoryPanel.tsx");
  const editorPath = path.join(process.cwd(), "..", "frontend", "src", "components", "overleaf", "EditorLayout.tsx");
  const panelExists = fs.existsSync(panelPath);
  const editorHasHistory = panelExists && fs.readFileSync(editorPath, "utf8").includes("VersionHistoryPanel");
  check(
    "Frontend: VersionHistoryPanel integrated in EditorLayout",
    panelExists && editorHasHistory,
    `panel=${panelExists}, integrated=${editorHasHistory}`
  );

  // Cleanup test universe (keep project for inspection)
  await prisma.learningUniverseTrack.deleteMany({ where: { learningUniverseId: universe.id } });
  await prisma.learningUniverse.delete({ where: { id: universe.id } }).catch(() => {});

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log("=== SUMMARY ===");
  console.log(`${passed}/${results.length} checks passed`);
  if (failed.length) {
    console.log("\nFailed:");
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
  console.log("\nAll Overleaf versioning checks passed.");
  console.log(`\nDatabase evidence: project ${project.id}, versions in latex_project_version table`);
  console.log(`API evidence: ${BASE}/latex-projects/${project.id}/versions`);
  console.log(`Frontend evidence: VersionHistoryPanel in Academic Authoring Studio editor toolbar`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
