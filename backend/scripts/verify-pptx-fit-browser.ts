/**
 * Visual verification of GATEHUB PPTX fit-to-stage (real PPTX, real pptx-svg).
 * Captures before/after mount structures and slide screenshots.
 */
import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const outDir = path.join(repoRoot, "tmp", "pptx-fit-verification");
const pptxPath = path.join(
  repoRoot,
  "backend/uploads/classroom/cmt1v5edo0007m6vrmbjzdzmx/source/original.pptx",
);

function prepareSlideSvg(svgStr: string) {
  const viewBoxMatch = svgStr.match(/<svg[^>]*\bviewBox=["']?([0-9.\s,-]+)["']/i);
  const widthMatch = svgStr.match(/<svg[^>]*\bwidth=["']?([0-9.]+)/i);
  const heightMatch = svgStr.match(/<svg[^>]*\bheight=["']?([0-9.]+)/i);
  const scaleMatch = svgStr.match(/data-ooxml-scale=["']?([0-9.]+)/i);
  const cxMatch = svgStr.match(/data-ooxml-slide-cx=["']?([0-9.]+)/i);
  const cyMatch = svgStr.match(/data-ooxml-slide-cy=["']?([0-9.]+)/i);
  let w = 960;
  let h = 540;
  const attrW = widthMatch ? parseFloat(widthMatch[1]) : 0;
  const attrH = heightMatch ? parseFloat(heightMatch[1]) : 0;
  if (attrW > 0 && attrH > 0) {
    w = attrW;
    h = attrH;
  }
  if (viewBoxMatch?.[1]) {
    const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      w = parts[2];
      h = parts[3];
    }
  } else if (!(attrW > 0 && attrH > 0) && cxMatch && cyMatch) {
    const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 9525;
    w = parseFloat(cxMatch[1]) / scale;
    h = parseFloat(cyMatch[1]) / scale;
  }
  const markup = svgStr.replace(/<svg\b([^>]*)>/i, (_full, attrs: string) => {
    let clean = attrs.replace(/\s+\bwidth=["'][^"']*["']/gi, "").replace(/\s+\bheight=["'][^"']*["']/gi, "");
    if (!viewBoxMatch) clean = ` viewBox="0 0 ${w} ${h}"${clean}`;
    if (!/preserveAspectRatio=/i.test(clean)) clean = ` preserveAspectRatio="xMidYMid meet"${clean}`;
    const fill = "position:absolute;inset:0;width:100%;height:100%;display:block;max-width:none;max-height:none";
    if (/style=["']/i.test(clean)) {
      clean = clean.replace(/style=["']([^"']*)["']/i, (_m, existing) => `style="${existing};${fill}"`);
    } else {
      clean = ` style="${fill}"${clean}`;
    }
    return `<svg${clean}>`;
  });
  return { markup, width: w, height: h, aspectRatio: w / h };
}

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { margin:0; height:100%; background:#e2e8f0; font-family:sans-serif; }
  .app { display:flex; width:100vw; height:100vh; overflow:hidden; }
  .sidebar { width:240px; flex-shrink:0; background:#fff; border-right:1px solid #cbd5e1; transition:width .2s; }
  .sidebar.collapsed { width:0; overflow:hidden; border:0; }
  .thumbs { width:140px; flex-shrink:0; background:#0f172a; }
  .main { flex:1; min-width:0; min-height:0; display:flex; flex-direction:column; }
  .toolbar { height:48px; flex-shrink:0; background:#fff; border-bottom:1px solid #cbd5e1; display:flex; align-items:center; padding:0 12px; gap:8px; }
  .stage {
    flex:1; min-width:0; min-height:0; position:relative; overflow:hidden; background:#94a3b8;
  }
  .viewport { overflow:hidden; outline:3px solid #ef4444; }
  .frame { position:absolute; inset:0; overflow:hidden; outline:2px solid #22c55e; }
  .frame svg { position:absolute; inset:0; width:100%; height:100%; display:block; max-width:none; max-height:none; }
  /* Old buggy mount for comparison */
  .old-stage { flex:1; min-width:0; min-height:0; display:flex; align-items:center; justify-content:center; background:#080d1a; overflow:hidden; }
  .old-viewport { width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#000; }
  .old-inner { width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
  .old-inner svg { width:100%; height:100%; max-width:100%; max-height:100%; display:block; object-fit:contain; }
</style>
</head>
<body>
<div class="app">
  <div id="sidebar" class="sidebar">GATEHUB</div>
  <div class="thumbs"></div>
  <div class="main">
    <div class="toolbar">
      <button id="toggle">Toggle sidebar</button>
      <span id="info">loading</span>
    </div>
    <div id="stage" class="stage">
      <div id="viewport" class="viewport"><div id="frame" class="frame"></div></div>
    </div>
  </div>
</div>
<script type="module">
import { PptxRenderer } from "/node_modules/pptx-svg/dist/index.js";
let renderer = null;
let prepared = null;
let slideIdx = 0;

function fit(stageW, stageH, aspect) {
  const stageAspect = stageW / stageH;
  let w, h;
  if (stageAspect > aspect) { h = stageH; w = h * aspect; }
  else { w = stageW; h = w / aspect; }
  w = Math.max(1, Math.floor(w));
  h = Math.max(1, Math.floor(h));
  return { w, h, x: Math.floor((stageW - w) / 2), y: Math.floor((stageH - h) / 2) };
}

function layout() {
  if (!prepared) return;
  const stage = document.getElementById("stage");
  const vp = document.getElementById("viewport");
  const svg = vp.querySelector("svg");
  const box = fit(stage.clientWidth, stage.clientHeight, prepared.aspectRatio);
  vp.style.position = "absolute";
  vp.style.left = box.x + "px";
  vp.style.top = box.y + "px";
  vp.style.width = box.w + "px";
  vp.style.height = box.h + "px";
  const stageRect = stage.getBoundingClientRect();
  const vpRect = vp.getBoundingClientRect();
  const svgRect = svg ? svg.getBoundingClientRect() : { width:0, height:0 };
  window.__LAYOUT__ = {
    slide: slideIdx + 1,
    slideDim: { w: prepared.width, h: prepared.height, aspect: prepared.aspectRatio },
    stage: { w: stage.clientWidth, h: stage.clientHeight, rectW: stageRect.width, rectH: stageRect.height },
    viewport: { w: box.w, h: box.h, x: box.x, y: box.y, rectW: vpRect.width, rectH: vpRect.height },
    svg: { rectW: svgRect.width, rectH: svgRect.height, viewBox: svg?.getAttribute("viewBox"), preserveAspectRatio: svg?.getAttribute("preserveAspectRatio") },
    wFill: box.w / stage.clientWidth,
    hFill: box.h / stage.clientHeight,
  };
}

function prepareSlideSvg(svgStr) {
  const viewBoxMatch = svgStr.match(/<svg[^>]*\\bviewBox=["']?([0-9.\\s,-]+)["']/i);
  const widthMatch = svgStr.match(/<svg[^>]*\\bwidth=["']?([0-9.]+)/i);
  const heightMatch = svgStr.match(/<svg[^>]*\\bheight=["']?([0-9.]+)/i);
  const scaleMatch = svgStr.match(/data-ooxml-scale=["']?([0-9.]+)/i);
  const cxMatch = svgStr.match(/data-ooxml-slide-cx=["']?([0-9.]+)/i);
  const cyMatch = svgStr.match(/data-ooxml-slide-cy=["']?([0-9.]+)/i);
  let w = 960, h = 540;
  const attrW = widthMatch ? parseFloat(widthMatch[1]) : 0;
  const attrH = heightMatch ? parseFloat(heightMatch[1]) : 0;
  if (attrW > 0 && attrH > 0) { w = attrW; h = attrH; }
  if (viewBoxMatch && viewBoxMatch[1]) {
    const parts = viewBoxMatch[1].trim().split(/[\\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) { w = parts[2]; h = parts[3]; }
  } else if (!(attrW > 0 && attrH > 0) && cxMatch && cyMatch) {
    const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 9525;
    w = parseFloat(cxMatch[1]) / scale;
    h = parseFloat(cyMatch[1]) / scale;
  }
  const markup = svgStr.replace(/<svg\\b([^>]*)>/i, (_full, attrs) => {
    let clean = attrs.replace(/\\s+\\bwidth=["'][^"']*["']/gi, "").replace(/\\s+\\bheight=["'][^"']*["']/gi, "");
    if (!viewBoxMatch) clean = " viewBox=\\"0 0 " + w + " " + h + "\\"" + clean;
    if (!/preserveAspectRatio=/i.test(clean)) clean = " preserveAspectRatio=\\"xMidYMid meet\\"" + clean;
    const fill = "position:absolute;inset:0;width:100%;height:100%;display:block;max-width:none;max-height:none";
    if (/style=["']/i.test(clean)) {
      clean = clean.replace(/style=["']([^"']*)["']/i, (_m, existing) => 'style="' + existing + ";" + fill + '"');
    } else {
      clean = ' style="' + fill + '"' + clean;
    }
    return "<svg" + clean + ">";
  });
  return { markup, width: w, height: h, aspectRatio: w / h };
}

window.__load = async (url) => {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  renderer = new PptxRenderer({ logLevel: "error" });
  await renderer.init();
  return renderer.loadPptx(buffer);
};
window.__show = (idx) => {
  slideIdx = idx;
  const raw = renderer.renderSlideSvg(idx);
  prepared = prepareSlideSvg(raw);
  document.getElementById("frame").innerHTML = prepared.markup;
  document.getElementById("info").textContent = "Slide " + (idx + 1);
  layout();
  return { rawOpen: (raw.match(/<svg\\b[^>]*>/) || [""])[0] };
};
window.__layout = () => { layout(); return window.__LAYOUT__; };
document.getElementById("toggle").onclick = () => {
  document.getElementById("sidebar").classList.toggle("collapsed");
  requestAnimationFrame(() => layout());
};
new ResizeObserver(() => layout()).observe(document.getElementById("stage"));
</script>
</body>
</html>`;

await mkdir(outDir, { recursive: true });
const pptxBuffer = await readFile(pptxPath);

const server = http.createServer(async (req, res) => {
  try {
    const url = req.url || "/";
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(html);
      return;
    }
    if (url === "/deck.pptx") {
      res.writeHead(200, { "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
      res.end(pptxBuffer);
      return;
    }
    const rel = decodeURIComponent(url.split("?")[0]);
    if (rel.includes("..")) {
      res.writeHead(400);
      res.end("bad");
      return;
    }
    const filePath = path.join(repoRoot, rel);
    const body = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": ext === ".js" || ext === ".mjs" ? "text/javascript" : ext === ".wasm" ? "application/wasm" : "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("nf");
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

function assertFill(layout: any, label: string) {
  if (layout.wFill < 0.95 && layout.hFill < 0.95) {
    throw new Error(`${label} did not maximize: wFill=${layout.wFill} hFill=${layout.hFill} ${JSON.stringify(layout)}`);
  }
  const svgW = layout.svg.rectW;
  const svgH = layout.svg.rectH;
  if (Math.abs(svgW - layout.viewport.rectW) > 2 || Math.abs(svgH - layout.viewport.rectH) > 2) {
    throw new Error(`${label} SVG does not fill viewport: svg=${svgW}x${svgH} viewport=${layout.viewport.rectW}x${layout.viewport.rectH}`);
  }
}

try {
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error("PAGEERROR", err.message));
  await page.goto(origin, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => typeof (window as any).__load === "function");
  const loaded = await page.evaluate(async () => (window as any).__load("/deck.pptx"));
  console.info("[LOADED]", loaded);

  const slides = [1, 2, 3, 5, 10].filter((n) => n <= loaded.slideCount);
  const reports: unknown[] = [];
  for (const n of slides) {
    await page.evaluate((idx) => (window as any).__show(idx), n - 1);
    await new Promise((r) => setTimeout(r, 80));
    const layout = await page.evaluate(() => (window as any).__layout());
    console.info(`[SLIDE_${n}]`, layout);
    assertFill(layout, `slide ${n}`);
    await page.screenshot({ path: path.join(outDir, `after-slide-${n}.png`) });
    reports.push(layout);
  }

  const beforeCollapse = await page.evaluate(() => (window as any).__layout());
  await page.click("#toggle");
  await new Promise((r) => setTimeout(r, 250));
  const afterCollapse = await page.evaluate(() => (window as any).__layout());
  console.info("[SIDEBAR]", { before: beforeCollapse.viewport, after: afterCollapse.viewport, stageBefore: beforeCollapse.stage, stageAfter: afterCollapse.stage });
  if (afterCollapse.viewport.w <= beforeCollapse.viewport.w) {
    throw new Error("Slide did not grow when sidebar collapsed");
  }
  await page.screenshot({ path: path.join(outDir, "after-sidebar-collapsed.png") });

  await page.setViewport({ width: 1920, height: 1080 });
  await new Promise((r) => setTimeout(r, 200));
  const resized = await page.evaluate(() => (window as any).__layout());
  console.info("[RESIZE_1080P]", resized);
  assertFill(resized, "1080p resize");
  await page.screenshot({ path: path.join(outDir, "after-resize-1080p.png") });

  await writeFile(path.join(outDir, "layouts.json"), JSON.stringify({ loaded, reports, afterCollapse, resized }, null, 2));
  console.info("[PPTX_FIT_BROWSER_PASSED]", outDir);
} finally {
  await browser.close();
  server.close();
}
