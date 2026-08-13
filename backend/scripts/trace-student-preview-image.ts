/**
 * End-to-end trace: \includegraphics{assets/images/img.png} through compile → lesson JSON → URL.
 * Run: npx tsx scripts/trace-student-preview-image.ts [projectId] [summaryPath]
 */
import { prisma } from "../src/utils/prisma.js";
import { loadProjectFiles } from "../src/services/luProject/luProjectFiles.js";
import { resolveLuV2ContentSnapshot } from "../src/services/luProject/luCompileSource.js";
import { buildLessonPreviewForFile } from "../src/services/luProject/luIncludeGraphicsInjector.js";
import { resolveProjectAssetRef } from "../src/services/luProject/luProjectAssetResolver.js";
import fs from "fs";
import path from "path";

const projectId = process.argv[2] || "cmr1t3kgu00032biyhmh22894";
const activePath = process.argv[3] || "/track-01/module-01/lesson-01/summary.tex";
const ref = "assets/images/img.png";

async function main() {
  console.log("\n[TeX] ref =", ref);

  const files = await loadProjectFiles(projectId);
  const imgFiles = files.filter((f) => /img\.png/i.test(f.path) || /img\.png/i.test(f.name));
  console.log("\n[DB assets] img.png rows:", imgFiles.length);
  for (const f of imgFiles) {
    console.log("  path:", f.path, "| s3Url:", f.s3Url ?? "(null)");
  }

  const hit = resolveProjectAssetRef(ref, files);
  console.log("\n[Backend resolveProjectAssetRef]");
  if (!hit) {
    console.log("  MISS — PDF would also fail to find this ref in DB");
  } else {
    console.log("  logical path:", hit.path);
    console.log("  s3Url:", hit.s3Url);
    if (hit.s3Url) {
      const physical = path.basename(hit.s3Url.replace(/\\/g, "/").split("?")[0]);
      const disk = path.join(process.cwd(), process.env.UPLOAD_DIR || "uploads", "projects", projectId, physical);
      console.log("  filesystem:", disk);
      console.log("  exists:", fs.existsSync(disk));
      const publicUrl = hit.s3Url.startsWith("http")
        ? hit.s3Url
        : `http://localhost:${process.env.PORT || 5000}${hit.s3Url.startsWith("/") ? hit.s3Url : `/${hit.s3Url}`}`;
      console.log("  public URL:", publicUrl);
    }
  }

  console.log("\n[Snapshot] resolving (runBuild: false)...");
  const snapshot = await resolveLuV2ContentSnapshot(projectId, { runBuild: false });
  if (!snapshot) {
    console.log("  snapshot null");
    return;
  }

  const preview = buildLessonPreviewForFile(snapshot.parsed, snapshot.project, activePath);
  console.log("\n[Lesson JSON] lesson:", preview?.lessonTitle, "| focus:", preview?.focusComponentId);
  console.log("  total blocks:", preview?.blocks.length ?? 0);

  let imageBlockCount = 0;
  for (const b of preview?.blocks ?? []) {
    if (b.type === "image") {
      imageBlockCount++;
      console.log("\n  [image block]", JSON.stringify(b, null, 2));
    }
  }
  console.log("\n[Lesson JSON] image blocks:", imageBlockCount);

  for (const b of preview?.blocks ?? []) {
    if (b.type !== "theory" && b.type !== "summary") continue;
    const c = b.content as Record<string, unknown>;
    const title = String(c.title ?? "");
    if (!title.toLowerCase().includes("summary")) continue;
    const body = String(c.body ?? c.text ?? "");
    console.log("\n  [theory block] title:", title);
    console.log("  body has includegraphics:", body.includes("\\includegraphics"));
    console.log("  body snippet:", body.slice(0, 200));
  }

  const summaryTex = files.find(
    (f) => f.path.replace(/\\/g, "/").toLowerCase() === activePath.replace(/\\/g, "/").toLowerCase()
  );
  console.log("\n[TeX file] path:", summaryTex?.path);
  console.log("  has includegraphics:", summaryTex?.content?.includes("\\includegraphics"));
  console.log("  snippet:", summaryTex?.content?.slice(0, 300));

  const overviewPath = "/track-01/module-01/lesson-01/overview.tex";
  const overviewTex = files.find((f) => f.path.replace(/\\/g, "/") === overviewPath);
  console.log("\n[overview.tex DB]");
  console.log("  has includegraphics:", overviewTex?.content?.includes("\\includegraphics"));
  console.log("  snippet:", overviewTex?.content?.slice(0, 400));

  const overviewPreview = buildLessonPreviewForFile(snapshot.parsed, snapshot.project, overviewPath);
  const overviewImages = overviewPreview?.blocks.filter((b) => b.type === "image") ?? [];
  console.log("\n[overview lesson] image blocks:", overviewImages.length);
  overviewImages.forEach((b) => console.log(" ", JSON.stringify(b.content)));

  const overlayTex = `\\theory{title={Summary},body={
Foundations text here.
\\begin{center}
\\includegraphics[width=0.7\\textwidth]{assets/images/img.png}
\\end{center}
}}`;
  const overlay = new Map<string, string>([[activePath, overlayTex]]);
  console.log("\n[Simulated compile overlay] summary.tex with includegraphics");
  const snapOverlay = await resolveLuV2ContentSnapshot(projectId, {
    runBuild: false,
    fileOverlay: overlay,
  });
  const previewOverlay = buildLessonPreviewForFile(
    snapOverlay!.parsed,
    snapOverlay!.project,
    activePath
  );
  const overlayImages = previewOverlay?.blocks.filter((b) => b.type === "image") ?? [];
  console.log("  image blocks after overlay:", overlayImages.length);
  overlayImages.forEach((b) => console.log(" ", JSON.stringify(b.content)));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
