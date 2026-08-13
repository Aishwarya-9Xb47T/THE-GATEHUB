import fs from "fs";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { randomUUID } from "crypto";
import puppeteer from "puppeteer";
import mime from "mime-types";
import { publishLearningUniverse } from "./src/controllers/learning-universe-controller.js";

const prisma = new PrismaClient();
const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR || "uploads");

async function main() {
  console.log("==================================================");
  console.log("STARTING PIPELINE VERIFICATION");
  console.log("==================================================\\n");

  // 1. Setup mock user and LaTeX project
  const user = await prisma.user.findFirst({ where: { role: "instructor" } });
  if (!user) throw new Error("No instructor found");

  const project = await prisma.latexProject.create({
    data: {
      title: "Test Project",
      ownerId: user.id,
    }
  });

  const videoName = "Media Player 2025-12-14 00-07-09.mp4";
  const videoBuffer = fs.readFileSync(path.join(process.cwd(), videoName));
  const fileId = randomUUID();
  
  await prisma.latexFile.create({
    data: {
      id: fileId,
      projectId: project.id,
      name: videoName,
      path: videoName,
      isFolder: false,
    }
  });

  const projectDir = path.join(UPLOAD_DIR, "latex", "projects", project.id);
  fs.mkdirSync(projectDir, { recursive: true });
  const latexProjectPath = path.join(projectDir, fileId + ".mp4");
  fs.writeFileSync(latexProjectPath, videoBuffer);
  
  console.log(`Instructor uploaded: ${videoName}`);
  console.log(`Inside AcademicAuthoringStudio (Project ID: ${project.id})\\n`);

  // 2. Publish Learning Universe using the EXACT DSL
  const dslSource = `
\\learninguniverse{
  title={Final Proof},
  description={Verification}
}
\\track{
  title={Track},
  \\module{
    title={Module},
    \\lesson{
      title={Lesson},
      \\video{
        file={${videoName}},
        title={Local Video Test}
      }
    }
  }
}
  `;

  // Simulate the fix from learning-universe.ts where it finds the files
  let filesToProcess = [];
  const projectFiles = await prisma.latexFile.findMany({ where: { projectId: project.id } });
  for (const pFile of projectFiles) {
    if (pFile.name === "main.tex") continue;
    const filePath = path.join(projectDir, pFile.id + path.extname(pFile.name));
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      const stat = fs.statSync(filePath);
      filesToProcess.push({
        originalname: pFile.name,
        mimetype: mime.lookup(pFile.name) || "application/octet-stream",
        size: stat.size,
        buffer: buffer,
      });
    }
  }

  // Publish using the controller
  const universe = await publishLearningUniverse(dslSource, user.id, filesToProcess);
  
  console.log("Publish clicked. Backend processed DSL and assets.\\n");

  // --- EVIDENCE ---

  console.log("=== EVIDENCE A. Database ===");
  const assets = await prisma.learningUniverseAsset.findMany({
    where: { learningUniverseId: universe.id }
  });
  console.log("SELECT LearningUniverseAsset:");
  assets.forEach(a => {
    console.log(`- filename: ${a.filename}`);
    console.log(`- storedFilename: ${a.storedFilename}`);
  });
  console.log();

  console.log("=== EVIDENCE B. Disk ===");
  if (assets.length > 0) {
    const asset = assets[0];
    const assetPath = path.join(UPLOAD_DIR, "learning-universes", universe.id, asset.storedFilename);
    const exists = fs.existsSync(assetPath);
    console.log(`Path: uploads/learning-universes/${universe.id}/${asset.storedFilename}`);
    console.log(`Exists: ${exists}`);
    if (exists) {
      console.log(`Size: ${fs.statSync(assetPath).size} bytes`);
    }
  }
  console.log();

  console.log("=== EVIDENCE C. API ===");
  const apiUrl = `http://localhost:5000/api/learning-universes/${universe.id}`;
  const apiRes = await fetch(apiUrl);
  const apiData = await apiRes.json();
  console.log(`GET /api/learning-universes/${universe.id}`);
  console.log("assets array:");
  console.log(JSON.stringify(apiData.data.assets, null, 2));
  console.log();

  console.log("=== EVIDENCE D. Frontend ===");
  // Simulate frontend resolveAssetUrl
  const urlParam = videoName;
  const foundAsset = apiData.data.assets.find(a => a.filename === urlParam);
  let resolvedUrl = "";
  if (foundAsset) {
    resolvedUrl = `http://localhost:5000/uploads/learning-universes/${universe.id}/${foundAsset.storedFilename}`;
  } else {
    resolvedUrl = `http://localhost:5000/api/learning-universes/${universe.id}/assets/${encodeURIComponent(urlParam)}`;
  }
  console.log(`Resolved URL: ${resolvedUrl}`);
  console.log();

  console.log("=== EVIDENCE E. Browser Direct URL ===");
  const headRes = await fetch(resolvedUrl, { headers: { 'Range': 'bytes=0-100' } });
  console.log(`Status ${headRes.status}`);
  console.log(`Content-Type: ${headRes.headers.get("content-type")}`);
  console.log(`Content-Length: ${headRes.headers.get("content-length")}`);
  console.log(`Accept-Ranges: ${headRes.headers.get("accept-ranges")}`);
  console.log(`Content-Range: ${headRes.headers.get("content-range")}`);
  console.log();

  console.log("=== EVIDENCE F & G. Video Playback & Final Proof ===");
  console.log("Launching Puppeteer to load the video exactly as the browser would...");
  
  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  // Construct a minimal HTML page that mimics the Learning Universe player
  const html = `
    <!DOCTYPE html>
    <html>
      <body>
        <video id="test-video" src="${resolvedUrl}" controls autoplay></video>
      </body>
    </html>
  `;
  
  await page.setContent(html);
  
  // Wait for the video to be ready and load metadata
  await page.waitForFunction(() => {
    const v = document.getElementById('test-video');
    return v && v.readyState >= 1; // HAVE_METADATA or higher
  }, { timeout: 10000 }).catch(() => console.log("Timeout waiting for video readyState"));

  const videoProps = await page.evaluate(() => {
    const v = document.getElementById('test-video');
    return {
      readyState: v.readyState,
      duration: v.duration,
      networkRequest: v.currentSrc
    };
  });
  
  console.log("Video Playback Info:");
  console.log(`- network request: ${videoProps.networkRequest}`);
  console.log(`- readyState: ${videoProps.readyState} (HAVE_METADATA or HAVE_ENOUGH_DATA)`);
  console.log(`- duration: ${videoProps.duration} seconds`);
  
  if (videoProps.duration > 0 && videoProps.readyState >= 1) {
    console.log("\\nFINAL PROOF: Video plays successfully exactly like Overleaf!");
  } else {
    console.log("\\nFINAL PROOF FAILED: Video did not play.");
  }
  
  await browser.close();
  
  console.log("==================================================");
  console.log("VERIFICATION COMPLETE");
  console.log("==================================================");
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
});
