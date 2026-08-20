/**
 * Chromium production-readiness checks that do not require GATEHUB login:
 *  - real PPTX binary → pptx-svg
 *  - slides 1,2,3,5,10 from a cached deck (no second PPTX fetch)
 *  - two presentation caches cannot leak
 *  - network: pptx+wasm only for first paint (no pdf/png)
 *  - Google embed URL shape
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";
import {
  buildConvolutionDeckPptx,
  CONVOLUTION_DECK_SLIDE_COUNT,
} from "../src/services/classroomStudio/convolutionDeckFixture.js";
import { validateAndExtractGoogleSlidesId } from "../src/services/classroomStudio/googleSlidesPublicService.js";
import { googleSlidesEmbedUrl } from "../src/services/classroomStudio/classroomAssetPath.js";

const repoRoot = path.resolve(process.cwd(), "..");
const pptxA = await buildConvolutionDeckPptx();
const pptxB = await buildConvolutionDeckPptx();

const invalid = validateAndExtractGoogleSlidesId("https://docs.google.com/document/d/abc/edit");
const valid = validateAndExtractGoogleSlidesId("https://docs.google.com/presentation/d/1JcUxO92Ksa9vFSvY9_JrBXySEf2j1ARYs5-dwnMg6FQ/edit");
if (invalid.valid) throw new Error("document URL must be INVALID");
if (!valid.valid || valid.presentationId !== "1JcUxO92Ksa9vFSvY9_JrBXySEf2j1ARYs5-dwnMg6FQ") {
  throw new Error("failed to extract Google presentation id");
}
const embed = googleSlidesEmbedUrl(valid.presentationId, 2);
if (!embed.includes("/presentation/d/1JcUxO92Ksa9vFSvY9_JrBXySEf2j1ARYs5-dwnMg6FQ/embed") || !embed.includes("slide=2")) {
  throw new Error(`bad embed url ${embed}`);
}

const html = `<!doctype html>
<html>
<body>
<script type="module">
import { PptxRenderer } from "/node_modules/pptx-svg/dist/index.js";
const cache = new Map();
async function loadDeck(url) {
  if (cache.has(url)) return cache.get(url);
  const pending = (async () => {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    const renderer = new PptxRenderer({
      logLevel: "error",
      measureText: (text, _face, sizePx) => Math.max(1, text.length * sizePx * 0.5),
    });
    await renderer.init();
    const loaded = await renderer.loadPptx(buffer);
    return { renderer, slideCount: loaded.slideCount, bytes: buffer.byteLength, url };
  })();
  cache.set(url, pending);
  return pending;
}
function render(deck, slideNumber) {
  const svg = deck.renderer.renderSlideSvg(slideNumber - 1);
  return {
    slide: slideNumber,
    ok: Boolean(svg) && svg.includes("<svg") && !svg.startsWith("ERROR:"),
    svgChars: svg ? svg.length : 0,
    head: svg ? svg.slice(0, 60) : "",
  };
}
const deckA = await loadDeck("/fixture-a.pptx");
const wanted = [1, 2, 3, 5, 10].filter((n) => n <= deckA.slideCount);
const slidesA = wanted.map((n) => render(deckA, n));
const deckA2 = await loadDeck("/fixture-a.pptx");
await loadDeck("/fixture-b.pptx");
window.__RESULT__ = {
  slideCount: deckA.slideCount,
  expected: ${CONVOLUTION_DECK_SLIDE_COUNT},
  bytes: deckA.bytes,
  slidesA,
  cacheHitSameUrl: deckA.renderer === deckA2.renderer,
  isolatedCaches: cache.size === 2,
  cacheKeys: [...cache.keys()],
};
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
    if (url === "/fixture-b.pptx") {
      res.writeHead(200, { "content-type": mime[".pptx"] });
      res.end(pptxB);
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

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu"] });
try {
  const page = await browser.newPage();
  const requests: string[] = [];
  page.on("request", (req) => requests.push(req.url()));
  page.on("pageerror", (error) => {
    console.error("[PRESENTATION_VIEW] browser_pageerror", error.message);
  });
  const t0 = Date.now();
  await page.goto(origin, { waitUntil: "networkidle0", timeout: 60_000 });
  const result = await page.waitForFunction(() => (window as { __RESULT__?: unknown }).__RESULT__, { timeout: 30_000 })
    .then((handle) => handle.jsonValue() as Promise<{
      slideCount: number;
      expected: number;
      bytes: number;
      slidesA: Array<{ slide: number; ok: boolean; svgChars: number }>;
      cacheHitSameUrl: boolean;
      isolatedCaches: boolean;
      cacheKeys: string[];
    }>);
  const t3 = Date.now() - t0;
  if (result.slideCount !== result.expected) throw new Error("slideCount mismatch");
  const failed = result.slidesA.filter((slide) => !slide.ok);
  if (failed.length) throw new Error(`slides failed ${JSON.stringify(failed)}`);
  if (!result.cacheHitSameUrl) throw new Error("second navigation reloaded the PPTX renderer");
  if (!result.isolatedCaches) throw new Error("presentation caches leaked");
  const pptxGets = requests.filter((url) => url.includes("fixture-a.pptx"));
  if (pptxGets.length !== 1) throw new Error(`expected 1 original pptx fetch, got ${pptxGets.length}`);
  const forbidden = requests.filter((url) => /\.pdf($|\?)|\.png($|\?)|libreoffice|export\.pdf|regenerate-visuals/i.test(url));
  if (forbidden.length) throw new Error(`forbidden network for first display: ${forbidden.join(", ")}`);
  console.info("[PRESENTATION_VIEW]", {
    event: "go_nogo_browser_ok",
    sourceType: "pptx",
    sourceAvailable: true,
    binaryLoaded: true,
    viewerInitialized: true,
    slideCount: result.slideCount,
    bytes: result.bytes,
    slides: result.slidesA,
    cacheHitSameUrl: result.cacheHitSameUrl,
    isolatedCaches: result.isolatedCaches,
    cacheKeys: result.cacheKeys,
    pptxFetches: pptxGets.length,
    firstPaintMs: t3,
    googleEmbedSample: embed,
    invalidGoogleRejected: !invalid.valid,
  });
} finally {
  await browser.close();
  server.close();
}
