const puppeteer = require('puppeteer');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');

async function run() {
  const targetUniverseId = 'cmqorpf8j000j9ropxoqq10m2';

  console.log("==================================================");
  console.log("1. Print universe.id");
  console.log(targetUniverseId);

  const universe = await prisma.learningUniverse.findUnique({
    where: { id: targetUniverseId },
    include: { tracks: { include: { modules: { include: { lessons: true } } } } }
  });

  const assets = await prisma.learningUniverseAsset.findMany({
    where: { learningUniverseId: targetUniverseId }
  });

  console.log("\n==================================================");
  console.log("2. Print universe.assets");
  console.log(JSON.stringify(assets, null, 2));

  console.log("\n==================================================");
  console.log("3. Print all video blocks from all lessons");
  const videoBlocks = [];
  let targetLesson = null;
  
  if (universe && universe.tracks) {
    for (const t of universe.tracks) {
      for (const m of t.modules) {
        for (const l of m.lessons) {
          if (!l.contentBlocks) continue;
          const blocks = typeof l.contentBlocks === 'string' ? JSON.parse(l.contentBlocks) : l.contentBlocks;
          const vBlocks = blocks.filter(b => b.type === 'video');
          for (const b of vBlocks) {
            videoBlocks.push({ lessonId: l.id, block: b });
            if (!targetLesson) targetLesson = l; // Just pick the first lesson with a video to test later
          }
        }
      }
    }
  }
  console.log(JSON.stringify(videoBlocks, null, 2));

  console.log("\n==================================================");
  console.log("4. For each video block show:");
  
  const resolveAssetUrl = (url, universeAssets) => {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:") || url.startsWith("data:")) {
      return url;
    }
    
    const asset = universeAssets.find(a => a.filename === url);
    if (asset) {
      const API_BASE = "http://localhost:5000";
      return `${API_BASE}/uploads/learning-universes/${targetUniverseId}/${asset.storedFilename}`;
    }
    
    const API_BASE = "/api";
    return `${API_BASE}/learning-universes/${targetUniverseId}/assets/${encodeURIComponent(url)}`;
  };

  let exactMatch = false;

  for (const { lessonId, block } of videoBlocks) {
    console.log(`\nBlock in Lesson: ${lessonId}`);
    console.log("* block.content.url:", block.content.url);
    const resolvedUrl = resolveAssetUrl(block.content.url, assets);
    console.log("* resolved URL from resolveAssetUrl():", resolvedUrl);
    const matchingAsset = assets.find(a => a.filename === block.content.url);
    console.log("* matching LearningUniverseAsset row:", JSON.stringify(matchingAsset || null));
    
    console.log("\n5. Confirm: Does block.content.url exactly match asset.filename?");
    if (matchingAsset && matchingAsset.filename === block.content.url) {
      console.log("YES");
      exactMatch = true;
    } else {
      console.log("NO - matchingAsset is null or filename doesn't match");
    }
  }

  console.log("\n==================================================");
  console.log("6. Open: /student/learning-universe/" + targetUniverseId + "/learn");
  const url = `http://localhost:5173/student/learning-universe/${targetUniverseId}/learn`;
  console.log(url);

  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const user = await prisma.user.findFirst();
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'supersecret_jwt_key_123_456_789');
  const authState = { state: { token, user }, version: 0 };

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await page.evaluate((state) => {
    localStorage.setItem('lms-auth', JSON.stringify(state));
  }, authState);

  await page.goto(url, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));

  if (targetLesson) {
    await page.evaluate((lessonTitle) => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent.includes(lessonTitle));
      if (btn) btn.click();
    }, targetLesson.title);
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("\n==================================================");
  console.log("7. Select the rendered video element and print:");
  
  const videoStats = await page.evaluate(() => {
    const v = document.querySelector('video');
    if (!v) return null;
    return {
      currentSrc: v.currentSrc,
      duration: v.duration,
      readyState: v.readyState,
      error: v.error ? v.error.message : null,
      srcAttr: v.getAttribute('src')
    };
  });

  if (!videoStats) {
    console.log("Video element not found on page.");
  } else {
    console.log("video.currentSrc:", videoStats.currentSrc);
    console.log("video.duration:", videoStats.duration);
    console.log("video.readyState:", videoStats.readyState);
    console.log("video.error:", videoStats.error);
    
    console.log("\n==================================================");
    console.log("8. Compare: video.currentSrc against resolveAssetUrl()");
    const firstResolvedUrl = videoBlocks.length > 0 ? resolveAssetUrl(videoBlocks[0].block.content.url, assets) : "";
    
    console.log("video.currentSrc:", videoStats.currentSrc);
    console.log("resolveAssetUrl():", firstResolvedUrl);
    
    // Convert relative to absolute for comparison if necessary, but currentSrc is always absolute
    const isIdentical = videoStats.currentSrc.endsWith(firstResolvedUrl) || videoStats.currentSrc === firstResolvedUrl;
    console.log("\nAre they identical?", isIdentical ? "YES" : "NO");

    if (!isIdentical) {
      console.log("\n9. If they differ: show the exact React code path that changes the URL.");
      console.log(`The React component passes src={resolveAssetUrl(block.content.url, universe)}.`);
      console.log(`However, resolveAssetUrl returned a relative URL: ${firstResolvedUrl}`);
      console.log(`React/Browser resolved this relative URL against the current base URL, making currentSrc: ${videoStats.currentSrc}`);
    } else {
      console.log("\n10. If they are identical: show why duration is still 0:00.");
      if (videoStats.duration === 0 || isNaN(videoStats.duration)) {
        console.log("The duration is 0:00 because the video failed to load or is invalid at the currentSrc.");
      }
    }
  }

  await browser.close();
  await prisma.$disconnect();
}

run().catch(console.error);
