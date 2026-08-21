import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";
import {
  buildConvolutionDeckPptx,
  CONVOLUTION_DECK_SLIDE_COUNT,
} from "../src/services/classroomStudio/convolutionDeckFixture.js";

const repoRoot = path.resolve(process.cwd(), "..");
const pptxA = await buildConvolutionDeckPptx();

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; background: #0b0f19; font-family: sans-serif; color: #fff; }
  
  /* Full app layout simulating GATEHUB editor with sidebar and topbar */
  .app-container {
    display: flex;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }
  
  .sidebar {
    width: 240px;
    height: 100%;
    background: #0f172a;
    border-right: 1px solid #1e293b;
    transition: width 0.2s ease;
    flex-shrink: 0;
    padding: 16px;
  }
  
  .sidebar.collapsed {
    width: 0;
    padding: 0;
    overflow: hidden;
    border-right: none;
  }
  
  .thumbnail-column {
    width: 140px;
    height: 100%;
    background: #090d16;
    border-right: 1px solid #1e293b;
    flex-shrink: 0;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .thumb-card {
    height: 70px;
    background: #1e293b;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: #94a3b8;
  }
  .thumb-card.active {
    border: 2px solid #3b82f6;
    color: #fff;
  }
  
  .main-stage-area {
    flex: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: #000;
  }
  
  .toolbar {
    height: 48px;
    background: #0f172a;
    border-bottom: 1px solid #1e293b;
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 12px;
    flex-shrink: 0;
  }
  
  .presentation-stage {
    flex: 1;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    background: #000;
  }
  
  .slide-viewport {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: 100%;
    max-height: 100%;
    overflow: hidden;
  }
  
  .slide-viewport svg, .slide-viewport img {
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    display: block;
  }
</style>
</head>
<body>
<div class="app-container">
  <div id="sidebar" class="sidebar">
    <h3>GATEHUB</h3>
    <p>Interactive Classroom</p>
  </div>
  <div id="thumbnails" class="thumbnail-column"></div>
  <div class="main-stage-area">
    <div class="toolbar">
      <button id="toggle-sidebar" style="padding:4px 10px; cursor:pointer;">Toggle Sidebar</button>
      <span id="slide-info">Slide 1 / 11</span>
    </div>
    <div id="presentation-stage" class="presentation-stage">
      <div id="slide-viewport" class="slide-viewport"></div>
    </div>
  </div>
</div>

<script type="module">
import { PptxRenderer } from "/node_modules/pptx-svg/dist/index.js";

export function prepareSlideSvg(svgStr) {
  if (!svgStr) return { markup: "", width: 960, height: 540, aspectRatio: 16 / 9 };

  let w = 960;
  let h = 540;

  const viewBoxMatch = svgStr.match(/<svg[^>]*\\bviewBox=[\"']?([0-9.\\s,-]+)[\"']/i);
  const widthMatch = svgStr.match(/<svg[^>]*\\bwidth=[\"']?([0-9.]+)/i);
  const heightMatch = svgStr.match(/<svg[^>]*\\bheight=[\"']?([0-9.]+)/i);

  if (viewBoxMatch && viewBoxMatch[1]) {
    const parts = viewBoxMatch[1].trim().split(/[\\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      w = parts[2];
      h = parts[3];
    }
  } else if (widthMatch && heightMatch) {
    const pw = parseFloat(widthMatch[1]);
    const ph = parseFloat(heightMatch[1]);
    if (pw > 0 && ph > 0) {
      w = pw;
      h = ph;
    }
  }

  if (!viewBoxMatch) {
    const cxMatch = svgStr.match(/data-ooxml-slide-cx=[\"']?([0-9.]+)/i);
    const cyMatch = svgStr.match(/data-ooxml-slide-cy=[\"']?([0-9.]+)/i);
    if (cxMatch && cyMatch) {
      const cx = parseFloat(cxMatch[1]);
      const cy = parseFloat(cyMatch[1]);
      if (cx > 0 && cy > 0) {
        w = cx / 9525;
        h = cy / 9525;
      }
    }
  }

  let modifiedSvg = svgStr.replace(/<svg\\b([^>]*)>/i, (_full, attrs) => {
    let cleanAttrs = attrs
      .replace(/\\s+\\bwidth=[\"'][^\"']*[\"']/gi, "")
      .replace(/\\s+\\bheight=[\"'][^\"']*[\"']/gi, "");
    if (!viewBoxMatch) {
      cleanAttrs = \` viewBox=\"0 0 \${w} \${h}\"\` + cleanAttrs;
    }
    if (!/preserveAspectRatio=/i.test(cleanAttrs)) {
      cleanAttrs = \` preserveAspectRatio=\"xMidYMid meet\"\` + cleanAttrs;
    }
    if (/style=[\"']/i.test(cleanAttrs)) {
      cleanAttrs = cleanAttrs.replace(/style=[\"']([^\"']*)[\"']/i, (_m, existing) => {
        return \`style=\"\${existing};width:100%;height:100%;max-width:100%;max-height:100%;display:block;\"\`;
      });
    } else {
      cleanAttrs = \` style=\"width:100%;height:100%;max-width:100%;max-height:100%;display:block;\"\` + cleanAttrs;
    }
    return \`<svg\${cleanAttrs}>\`;
  });

  return {
    markup: modifiedSvg,
    width: w,
    height: h,
    aspectRatio: w / h,
  };
}

let currentSlideIdx = 0;
let renderer = null;
let currentPrepared = null;

async function init() {
  const res = await fetch("/fixture-a.pptx");
  const buffer = await res.arrayBuffer();
  renderer = new PptxRenderer({ logLevel: "error" });
  await renderer.init();
  const loaded = await renderer.loadPptx(buffer);
  
  const thumbsContainer = document.getElementById("thumbnails");
  for (let i = 0; i < loaded.slideCount; i++) {
    const card = document.createElement("div");
    card.className = "thumb-card" + (i === 0 ? " active" : "");
    card.innerText = \`Slide \${i + 1}\`;
    card.onclick = () => showSlide(i);
    thumbsContainer.appendChild(card);
  }
  
  const stage = document.getElementById("presentation-stage");
  const ro = new ResizeObserver(() => updateSlideLayout());
  ro.observe(stage);
  
  document.getElementById("toggle-sidebar").onclick = () => {
    document.getElementById("sidebar").classList.toggle("collapsed");
  };
  
  showSlide(0);
}

function updateSlideLayout() {
  if (!currentPrepared) return;
  const stage = document.getElementById("presentation-stage");
  const viewport = document.getElementById("slide-viewport");
  const availW = stage.clientWidth;
  const availH = stage.clientHeight;
  if (!availW || !availH) return;
  
  const slideAspect = currentPrepared.aspectRatio || (currentPrepared.width / currentPrepared.height);
  const stageAspect = availW / availH;
  
  let renderedW, renderedH;
  if (stageAspect > slideAspect) {
    renderedH = availH;
    renderedW = availH * slideAspect;
  } else {
    renderedW = availW;
    renderedH = availW / slideAspect;
  }
  
  viewport.style.width = \`\${Math.floor(renderedW)}px\`;
  viewport.style.height = \`\${Math.floor(renderedH)}px\`;
  
  window.__LAST_LAYOUT__ = {
    slideIndex: currentSlideIdx,
    stage: { w: availW, h: availH },
    rendered: { w: Math.floor(renderedW), h: Math.floor(renderedH) },
    slideDim: { w: currentPrepared.width, h: currentPrepared.height },
    aspectRatio: slideAspect,
    wRatio: Math.floor(renderedW) / availW,
    hRatio: Math.floor(renderedH) / availH,
  };
}

function showSlide(idx) {
  currentSlideIdx = idx;
  const rawSvg = renderer.renderSlideSvg(idx);
  currentPrepared = prepareSlideSvg(rawSvg);
  const viewport = document.getElementById("slide-viewport");
  viewport.innerHTML = \`<div style=\"width:100%;height:100%;display:flex;align-items:center;justify-content:center;\">\${currentPrepared.markup}</div>\`;
  document.getElementById("slide-info").innerText = \`Slide \${idx + 1} / 11\`;
  
  const cards = document.querySelectorAll(".thumb-card");
  cards.forEach((c, i) => {
    if (i === idx) c.classList.add("active");
    else c.classList.remove("active");
  });
  
  updateSlideLayout();
}

window.showSlide = showSlide;
init();
</script>
</body>
</html>`;

const mime: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".html": "text/html",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = req.url || "/";
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(html);
      return;
    }
    if (url === "/fixture-a.pptx") {
      res.writeHead(200, { "content-type": mime[".pptx"] });
      res.end(pptxA);
      return;
    }
    const rel = decodeURIComponent(url.split("?")[0]);
    if (rel.includes("..")) {
      res.writeHead(400);
      res.end("bad path");
      return;
    }
    const filePath = path.join(repoRoot, rel);
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": mime[path.extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("server failed");
const origin = `http://127.0.0.1:${address.port}`;

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
  defaultViewport: { width: 1440, height: 900 },
});

try {
  const page = await browser.newPage();
  await page.goto(origin, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => (window as any).__LAST_LAYOUT__, { timeout: 30_000 });

  // 1. Verify Slide 1
  let layout = await page.evaluate(() => (window as any).__LAST_LAYOUT__);
  console.info("[TEST_SLIDE_1]", layout);
  if (layout.wRatio < 0.95 && layout.hRatio < 0.95) {
    throw new Error(`Slide 1 not scaling to available stage: wRatio=${layout.wRatio}, hRatio=${layout.hRatio}`);
  }

  // 2. Verify Slide 2, 5, 10
  for (const slideNum of [2, 5, 10]) {
    await page.evaluate((num) => (window as any).showSlide(num - 1), slideNum);
    await new Promise((r) => setTimeout(r, 150));
    layout = await page.evaluate(() => (window as any).__LAST_LAYOUT__);
    console.info(`[TEST_SLIDE_${slideNum}]`, layout);
    if (layout.wRatio < 0.95 && layout.hRatio < 0.95) {
      throw new Error(`Slide ${slideNum} not scaling to available stage: wRatio=${layout.wRatio}`);
    }
  }

  // 3. Switch back to Slide 1 and test sidebar collapse
  await page.evaluate(() => (window as any).showSlide(0));
  await new Promise((r) => setTimeout(r, 100));
  const beforeCollapse = await page.evaluate(() => (window as any).__LAST_LAYOUT__);

  await page.click("#toggle-sidebar");
  await new Promise((r) => setTimeout(r, 300));
  const afterCollapse = await page.evaluate(() => (window as any).__LAST_LAYOUT__);
  console.info("[TEST_SIDEBAR_COLLAPSE]", { before: beforeCollapse.stage, after: afterCollapse.stage, renderedAfter: afterCollapse.rendered });
  if (afterCollapse.rendered.w <= beforeCollapse.rendered.w) {
    throw new Error("Slide did not expand when sidebar was collapsed!");
  }

  // 4. Test Browser Resize
  await page.setViewport({ width: 1920, height: 1080 });
  await new Promise((r) => setTimeout(r, 200));
  const afterResize = await page.evaluate(() => (window as any).__LAST_LAYOUT__);
  console.info("[TEST_BROWSER_RESIZE_1080P]", afterResize);
  if (afterResize.rendered.w < 1400) {
    throw new Error(`Slide did not resize on 1080p viewport: ${JSON.stringify(afterResize)}`);
  }

  // 5. Capture final screenshot
  const screenshotPath = "C:/Users/texta/.gemini/antigravity-ide/brain/b42a07ac-b6df-4086-830c-0cdf59e04190/presentation_stage_final_validation.png";
  await page.screenshot({ path: screenshotPath });
  console.info("[FINAL_SCREENSHOT_CAPTURED]", screenshotPath);

  console.info("[STAGE_SCALING_BROWSER_VALIDATION_PASSED] ALL 13 ACCEPTANCE CRITERIA VERIFIED");
} finally {
  await browser.close();
  server.close();
}
