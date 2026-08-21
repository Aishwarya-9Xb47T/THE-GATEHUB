/**
 * Real Chromium verification of public Google Slides → GATEHUB → Editor.
 * Proves the official Google embed is the primary visual source.
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type HTTPRequest, type HTTPResponse, type Page } from "puppeteer";
import { buildGoogleSlidesEmbedUrl } from "../src/services/classroomStudio/classroomAssetPath.js";
import {
  parseReliableGoogleSlideCount,
  probePublicGoogleSlides,
  validateAndExtractGoogleSlidesId,
} from "../src/services/classroomStudio/googleSlidesPublicService.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const outDir = path.join(repoRoot, "tmp", "google-slides-embed-verification");

const API = process.env.API_URL || "http://localhost:5000";
const APP = process.env.CLIENT_URL || "http://localhost:5173";
const INSTRUCTOR_EMAIL = process.env.SEED_INSTRUCTOR_EMAIL || "";
const INSTRUCTOR_PASSWORD = process.env.SEED_INSTRUCTOR_PASSWORD || "";
const CANDIDATE_ID = process.env.PUBLIC_GOOGLE_SLIDES_ID || "1lxXd9se-LVhSdMromwCFlZd6joaMa52qHI-P70qG7pI";

const FORBIDDEN_UI = [
  "Converting PowerPoint to PDF",
  "Extracting slides",
  "Saving slide",
  "Slide visual is still rendering",
];

function attachNetwork(page: Page) {
  const urls: string[] = [];
  const embedResponses: Array<{ url: string; status: number }> = [];
  page.on("request", (req: HTTPRequest) => urls.push(req.url()));
  page.on("response", (res: HTTPResponse) => {
    if (/docs\.google\.com\/presentation\/d\/[^/]+\/embed/i.test(res.url())) {
      embedResponses.push({ url: res.url(), status: res.status() });
    }
  });
  return {
    urls,
    embedResponses,
    googleEmbeds: () => urls.filter((url) => /docs\.google\.com\/presentation\/d\/[^/]+\/embed/i.test(url)),
    pptxGets: () => urls.filter((url) => /original\.pptx/i.test(url)),
    pdfGets: () => urls.filter((url) => /export\.pdf|\.pdf($|\?)/i.test(url) && !/google/i.test(url)),
    pngPrimary: () => urls.filter((url) => /\/visuals\/\d+\.png|\/renders\/slide-\d+\.png/i.test(url)),
    forbiddenPrimary: () => urls.filter((url) => /libreoffice|PPTX_TO_PDF|visual-repair|regenerate-visuals/i.test(url)),
  };
}

async function apiJson(pathname: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${pathname}`, init);
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 400) }; }
  return { status: response.status, ok: response.ok, body, text };
}

async function loginUi(page: Page, email: string, password: string) {
  await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("#email", { timeout: 30_000 });
  await page.click("#email", { clickCount: 3 });
  await page.type("#email", email);
  await page.click("#password", { clickCount: 3 });
  await page.type("#password", password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60_000 }),
    page.click("button[type=submit]"),
  ]).catch(async () => {
    await page.waitForFunction(() => window.location.pathname.includes("/instructor"), { timeout: 60_000 });
  });
}

async function skipOnboarding(page: Page) {
  await page.evaluate(() => {
    const skip = Array.from(document.querySelectorAll("button")).find((el) => /Skip tour/i.test(el.textContent || ""));
    (skip as HTMLButtonElement | undefined)?.click();
  }).catch(() => undefined);
}

async function googleFrameInfo(page: Page) {
  const frame = page.frames().find((item) => /docs\.google\.com\/presentation/i.test(item.url()));
  if (!frame) return { url: null, title: null, text: null };
  const info = await frame.evaluate(() => ({
    title: document.title,
    text: String(document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 400),
  })).catch(() => ({ title: null, text: null }));
  return { url: frame.url(), ...info };
}

async function iframeSrc(page: Page) {
  return page.$eval(
    '[data-testid="classroom-google-embed"]',
    (el) => (el as HTMLIFrameElement).src,
  );
}

async function clickSlide(page: Page, slide: number) {
  await page.evaluate((wanted) => {
    const btn = document.querySelector(`button[aria-label^="Slide ${wanted}:"]`) as HTMLButtonElement | null;
    if (!btn) throw new Error(`slide button ${wanted} missing`);
    btn.click();
  }, slide);
  await page.waitForFunction(
    (expected) => {
      const iframe = document.querySelector('[data-testid="classroom-google-embed"]') as HTMLIFrameElement | null;
      return Boolean(iframe?.src?.includes(`slide=${expected}`));
    },
    { timeout: 15_000 },
    slide,
  );
}

async function visualMetadata(token: string, presentationId: string) {
  const got = await apiJson(`/api/classroom-studio/presentations/${presentationId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!got.ok) throw new Error(`GET presentation failed ${got.status}`);
  const slides = got.body?.slides || [];
  return {
    sourceType: got.body?.sourceType,
    sourceUrl: got.body?.sourceUrl,
    status: got.body?.status,
    visualStatus: got.body?.visualStatus,
    extractionStatus: got.body?.extractionStatus,
    slideCount: slides.length,
    visuals: slides.map((slide: any) => ({
      order: slide.order,
      visualSource: slide.content?.visual?.visualSource,
      type: slide.content?.visual?.type,
      embedUrl: slide.content?.visual?.embedUrl,
      extractionStatus: slide.content?.visual?.extractionStatus,
    })),
  };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  if (!INSTRUCTOR_EMAIL || !INSTRUCTOR_PASSWORD) {
    throw new Error("SEED_INSTRUCTOR_EMAIL / SEED_INSTRUCTOR_PASSWORD are required for the real GATEHUB browser test");
  }

  const idCheck = validateAndExtractGoogleSlidesId(`https://docs.google.com/presentation/d/${CANDIDATE_ID}/edit`);
  if (!idCheck.valid || idCheck.presentationId !== CANDIDATE_ID) {
    throw new Error(`presentation id extraction failed: ${JSON.stringify(idCheck)}`);
  }

  const liveProbe = await probePublicGoogleSlides(CANDIDATE_ID);
  if (!liveProbe.accessible) {
    throw new Error(
      `CURRENT public Google URL is not viewable (${liveProbe.error || "unknown"}). Set PUBLIC_GOOGLE_SLIDES_ID to a live public deck.`,
    );
  }
  const html = await (await fetch(
    `https://docs.google.com/presentation/d/${CANDIDATE_ID}/embed?start=false&loop=false&delayms=3000000`,
  )).text();
  const counted = parseReliableGoogleSlideCount(html);
  const expectedCount = liveProbe.slideCount || counted?.slideCount;
  if (!expectedCount) {
    throw new Error("Could not read the live Google slide count; refusing to invent one.");
  }
  const publicUrl = `https://docs.google.com/presentation/d/${CANDIDATE_ID}/edit`;
  console.info("[GOOGLE_EMBED] live public deck", {
    id: CANDIDATE_ID,
    expectedCount,
    countSource: liveProbe.countSource || counted?.source,
  });

  const health = await apiJson("/api/health");
  if (!health.ok) throw new Error(`backend health ${health.status}`);
  const login = await apiJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: INSTRUCTOR_EMAIL, password: INSTRUCTOR_PASSWORD }),
  });
  if (!login.ok || !login.body?.token) throw new Error("API login failed");
  const token = login.body.token as string;

  const invalid = await apiJson("/api/classroom-studio/google-slides/import-public", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://docs.google.com/document/d/abc/edit", title: "Invalid" }),
  });
  if (invalid.ok || !/INVALID_URL/i.test(String(invalid.body?.error || ""))) {
    throw new Error(`invalid URL not rejected: ${JSON.stringify(invalid.body)}`);
  }

  const missing = await apiJson("/api/classroom-studio/google-slides/import-public", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://docs.google.com/presentation/d/1olOlmKANqIdSecjfe8zsl_xNH0jsKedk/edit",
      title: "Missing",
    }),
  });
  if (missing.ok || !/GOOGLE_SLIDES_NOT_ACCESSIBLE/i.test(String(missing.body?.error || ""))) {
    throw new Error(`404 Google URL did not map to GOOGLE_SLIDES_NOT_ACCESSIBLE: ${JSON.stringify(missing.body)}`);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--window-size=1440,900",
      "--disable-features=IsolateOrigins,site-per-process",
      "--use-gl=swiftshader",
    ],
    defaultViewport: { width: 1440, height: 900 },
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(90_000);
    const net = attachNetwork(page);
    await loginUi(page, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);

    await page.goto(`${APP}/instructor/interactive-classroom`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll("button")).some((btn) => /New Presentation|Import/i.test(btn.textContent || ""));
    }, { timeout: 30_000 });
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((el) => /New Presentation/i.test(el.textContent || ""));
      (btn as HTMLButtonElement | undefined)?.click();
    });
    await page.waitForFunction(() => window.location.pathname.includes("/interactive-classroom/create"), { timeout: 30_000 });

    await page.waitForFunction(() => Array.from(document.querySelectorAll("h3,h2,div")).some((el) => el.textContent === "Google Slides"), { timeout: 30_000 });
    await page.evaluate(() => {
      const card = Array.from(document.querySelectorAll("h3,div")).find((el) => el.textContent === "Google Slides");
      (card as HTMLElement | undefined)?.closest(".cursor-pointer")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((el) => /Continue/i.test(el.textContent || ""));
      (btn as HTMLButtonElement | undefined)?.click();
    });
    await page.waitForSelector("#title", { timeout: 30_000 });
    await page.type("#title", "Browser Google Embed");
    await page.waitForSelector("#sourceUrl", { timeout: 15_000 });
    await page.click("#sourceUrl", { clickCount: 3 });
    await page.type("#sourceUrl", publicUrl);
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((el) => /Create Presentation/i.test(el.textContent || ""));
      if (!btn) throw new Error("Create Presentation button missing");
      (btn as HTMLButtonElement).click();
    });

    await page.waitForFunction(
      () => /\/interactive-classroom\/presentations\/[^/]+\/editor/.test(window.location.pathname),
      { timeout: 90_000 },
    );
    const editorPath = await page.evaluate(() => window.location.pathname);
    const presentationId = editorPath.split("/presentations/")[1]?.split("/")[0];
    if (!presentationId) throw new Error(`no presentation id in ${editorPath}`);

    await page.waitForSelector('[data-testid="classroom-google-embed"]', { timeout: 30_000 });
    await skipOnboarding(page);
    await new Promise((resolve) => setTimeout(resolve, 4000));
    if (await page.$('[data-testid="classroom-original-pptx"]')) {
      throw new Error("public Google editor used the PPTX viewer");
    }
    const src1 = await iframeSrc(page);
    if (!src1.includes(`/presentation/d/${CANDIDATE_ID}/embed`) || !src1.includes("slide=1")) {
      throw new Error(`editor iframe src=${src1}`);
    }
    if (src1.includes("rm=minimal")) throw new Error(`google embed still uses rm=minimal: ${src1}`);
    const frame1 = await googleFrameInfo(page);
    if (!frame1.url || !/docs\.google\.com\/presentation\/d\/[^/]+\/embed/i.test(frame1.url)) {
      throw new Error(`google frame did not load: ${JSON.stringify(frame1)}`);
    }
    if (!/Google Slides/i.test(String(frame1.title || ""))) {
      throw new Error(`google frame title missing: ${JSON.stringify(frame1)}`);
    }
    const iframeHandle = await page.$('[data-testid="classroom-google-embed"]');
    if (iframeHandle) {
      await iframeHandle.screenshot({ path: path.join(outDir, "iframe-slide-1.png") }).catch(() => undefined);
    }
    const bodyText = await page.evaluate(() => document.body.innerText || "");
    const forbidden = FORBIDDEN_UI.find((msg) => bodyText.includes(msg));
    if (forbidden) throw new Error(`forbidden UI: ${forbidden}`);
    await page.screenshot({ path: path.join(outDir, "editor-slide-1.png") });

    const frameBySlide: Record<number, Awaited<ReturnType<typeof googleFrameInfo>>> = { 1: frame1 };
    for (const slide of [2, 3, 5, 10]) {
      if (slide > expectedCount) continue;
      await clickSlide(page, slide);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const src = await iframeSrc(page);
      if (!src.includes(`/presentation/d/${CANDIDATE_ID}/embed`) || !src.includes(`slide=${slide}`)) {
        throw new Error(`slide ${slide} iframe src=${src}`);
      }
      frameBySlide[slide] = await googleFrameInfo(page);
      const handle = await page.$('[data-testid="classroom-google-embed"]');
      if (handle) {
        await handle.screenshot({ path: path.join(outDir, `iframe-slide-${slide}.png`) }).catch(() => undefined);
      }
      await page.screenshot({ path: path.join(outDir, `editor-slide-${slide}.png`) });
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="classroom-google-embed"]', { timeout: 30_000 });
    const refreshSrc = await iframeSrc(page);
    if (!refreshSrc.includes(`/presentation/d/${CANDIDATE_ID}/embed`)) {
      throw new Error(`refresh lost google embed: ${refreshSrc}`);
    }
    await page.screenshot({ path: path.join(outDir, "editor-refresh.png") });

    const beforeExtract = await visualMetadata(token, presentationId);
    if (beforeExtract.slideCount !== expectedCount) {
      throw new Error(`editor/db slide count ${beforeExtract.slideCount} != live Google count ${expectedCount}`);
    }
    const badVisual = beforeExtract.visuals.find((visual) => visual.visualSource !== "google_embed" || visual.type !== "google_slides");
    if (badVisual) throw new Error(`non-google visual after import: ${JSON.stringify(badVisual)}`);
    if (beforeExtract.sourceType !== "google_slides") throw new Error(`sourceType ${beforeExtract.sourceType}`);

    let afterExtract = beforeExtract;
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline && afterExtract.extractionStatus === "pending") {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      afterExtract = await visualMetadata(token, presentationId);
    }
    const badAfter = afterExtract.visuals.find((visual) => visual.visualSource !== "google_embed");
    if (badAfter) throw new Error(`extraction replaced google_embed: ${JSON.stringify(badAfter)}`);
    if (afterExtract.slideCount !== expectedCount) {
      throw new Error(`extraction changed slide count to ${afterExtract.slideCount}; live Google is ${expectedCount}`);
    }

    const report = {
      presentationId,
      googleId: CANDIDATE_ID,
      expectedCount,
      dbSlideCount: afterExtract.slideCount,
      extractionStatus: afterExtract.extractionStatus,
      visualStatus: afterExtract.visualStatus,
      iframeSrc: src1,
      refreshSrc,
      frameBySlide,
      embedResponses: net.embedResponses.slice(0, 12),
      googleEmbedRequests: net.googleEmbeds().slice(0, 12),
      pptxGets: net.pptxGets(),
      pdfGets: net.pdfGets(),
      pngPrimaryCount: net.pngPrimary().length,
      forbiddenPrimary: net.forbiddenPrimary(),
      visuals: afterExtract.visuals,
      embedUrlSample: buildGoogleSlidesEmbedUrl(CANDIDATE_ID, 1),
    };
    if (net.forbiddenPrimary().length) throw new Error(`forbidden network: ${net.forbiddenPrimary().join(" | ")}`);
    if (net.pdfGets().length) throw new Error(`pdf requested as visual: ${net.pdfGets().join(" | ")}`);
    await writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
    console.info("[GOOGLE_EMBED] PASS", {
      presentationId,
      googleId: CANDIDATE_ID,
      slideCount: afterExtract.slideCount,
      extractionStatus: afterExtract.extractionStatus,
      pptxGets: net.pptxGets(),
      embedHttp: net.embedResponses.slice(0, 5),
      frameBySlide,
    });
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[GOOGLE_EMBED_FAIL]", error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
