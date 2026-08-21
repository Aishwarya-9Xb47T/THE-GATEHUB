/**
 * Real-browser verification that public Google Slides use the official embed
 * as the primary visual, without waiting on PPTX/PDF/PNG rendering.
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type HTTPRequest, type Page } from "puppeteer";
import { buildGoogleSlidesEmbedUrl } from "../src/services/classroomStudio/classroomAssetPath.js";
import { validateAndExtractGoogleSlidesId } from "../src/services/classroomStudio/googleSlidesPublicService.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const outDir = path.join(repoRoot, "tmp", "google-slides-embed-verification");

const API = process.env.API_URL || "http://localhost:5000";
const APP = process.env.CLIENT_URL || "http://localhost:5173";
const INSTRUCTOR_EMAIL = process.env.SEED_INSTRUCTOR_EMAIL || "";
const INSTRUCTOR_PASSWORD = process.env.SEED_INSTRUCTOR_PASSWORD || "";
const PUBLIC_GOOGLE_ID = process.env.PUBLIC_GOOGLE_SLIDES_ID || "1lxXd9se-LVhSdMromwCFlZd6joaMa52qHI-P70qG7pI";
const PUBLIC_GOOGLE_URL = `https://docs.google.com/presentation/d/${PUBLIC_GOOGLE_ID}/edit`;

const FORBIDDEN_UI = [
  "Converting PowerPoint to PDF",
  "Extracting slides",
  "Saving slide",
  "Slide visual is still rendering",
];
const FORBIDDEN_NETWORK = /export\.pdf|\.pdf($|\?)|libreoffice|regenerate-visuals|PPTX_TO_PDF|visual-repair/i;

function attachNetwork(page: Page) {
  const urls: string[] = [];
  page.on("request", (req: HTTPRequest) => urls.push(req.url()));
  return {
    urls,
    googleEmbeds: () => urls.filter((url) => /docs\.google\.com\/presentation\/d\/[^/]+\/embed/i.test(url)),
    forbiddenPrimary: () => urls.filter((url) => FORBIDDEN_NETWORK.test(url) && !/googleapis|gstatic|google\.com/i.test(url)),
    pptxGets: () => urls.filter((url) => /original\.pptx/i.test(url)),
  };
}

async function apiJson(pathname: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${pathname}`, init);
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 400) }; }
  return { status: response.status, ok: response.ok, body, text };
}

async function loginApi(email: string, password: string) {
  const result = await apiJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!result.ok || !result.body?.token) {
    throw new Error(`login failed ${result.status} ${result.body?.message || result.text.slice(0, 180)}`);
  }
  return result.body.token as string;
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

async function main() {
  await mkdir(outDir, { recursive: true });
  const idCheck = validateAndExtractGoogleSlidesId(PUBLIC_GOOGLE_URL);
  if (!idCheck.valid || idCheck.presentationId !== PUBLIC_GOOGLE_ID) {
    throw new Error(`presentation id extraction failed: ${JSON.stringify(idCheck)}`);
  }
  for (const slide of [1, 2, 3, 10]) {
    const embed = buildGoogleSlidesEmbedUrl(PUBLIC_GOOGLE_ID, slide);
    if (!embed.includes(`/presentation/d/${PUBLIC_GOOGLE_ID}/embed`) || !embed.includes(`slide=${slide}`)) {
      throw new Error(`bad embed for slide ${slide}: ${embed}`);
    }
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1440,900"],
    defaultViewport: { width: 1440, height: 900 },
  });

  try {
    const page = await browser.newPage();
    const embedSrc = buildGoogleSlidesEmbedUrl(PUBLIC_GOOGLE_ID, 1);
    await page.setContent(
      `<iframe data-testid="classroom-google-embed" src="${embedSrc}" style="width:1280px;height:720px;border:0"></iframe>`,
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForSelector("iframe[data-testid='classroom-google-embed']");
    await page.screenshot({ path: path.join(outDir, "direct-google-embed-slide-1.png") });
    console.info("[GOOGLE_EMBED] direct iframe constructed", embedSrc);

    if (!INSTRUCTOR_EMAIL || !INSTRUCTOR_PASSWORD) {
      console.warn("[GOOGLE_EMBED] skipping GATEHUB UI flow; SEED_INSTRUCTOR_* not set");
      console.info("[GOOGLE_EMBED] PARTIAL_PASS direct embed URL verified");
      return;
    }

    let health: { ok: boolean; status: number };
    try {
      health = await apiJson("/api/health");
    } catch (error) {
      console.warn("[GOOGLE_EMBED] skipping GATEHUB UI flow; backend not reachable", error instanceof Error ? error.message : error);
      console.info("[GOOGLE_EMBED] PARTIAL_PASS direct embed URL verified");
      return;
    }
    if (!health.ok) {
      console.warn(`[GOOGLE_EMBED] skipping GATEHUB UI flow; backend health ${health.status}`);
      console.info("[GOOGLE_EMBED] PARTIAL_PASS direct embed URL verified");
      return;
    }
    const token = await loginApi(INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);

    const invalid = await apiJson("/api/classroom-studio/google-slides/import-public", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://docs.google.com/document/d/abc/edit", title: "Invalid" }),
    });
    if (invalid.ok || !/INVALID_URL/i.test(String(invalid.body?.error || ""))) {
      throw new Error(`invalid URL not rejected: ${JSON.stringify(invalid.body)}`);
    }

    const t0 = Date.now();
    const imported = await apiJson("/api/classroom-studio/google-slides/import-public", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: PUBLIC_GOOGLE_URL, title: "Browser Google Embed" }),
    });
    const openMs = Date.now() - t0;
    if (!imported.ok || !imported.body?.presentationId) {
      throw new Error(`public import failed ${imported.status} ${JSON.stringify(imported.body).slice(0, 400)}`);
    }
    if (imported.body.visualStatus !== "ready" || imported.body.overallStatus !== "ready") {
      throw new Error(`import not visually ready: ${JSON.stringify(imported.body)}`);
    }
    if (!String(imported.body.embedUrl || "").includes(`/presentation/d/${PUBLIC_GOOGLE_ID}/embed`)) {
      throw new Error(`import missing embedUrl: ${JSON.stringify(imported.body)}`);
    }
    if (imported.body.extractionStatus === "complete" && openMs > 60_000) {
      throw new Error(`import appears to have waited on full extraction (${openMs}ms)`);
    }
    console.info("[GOOGLE_EMBED] import-public", {
      presentationId: imported.body.presentationId,
      slideCount: imported.body.slideCount || imported.body.slidesImported,
      openMs,
      visualStatus: imported.body.visualStatus,
      extractionStatus: imported.body.extractionStatus,
    });

    const instructor = await browser.newPage();
    const net = attachNetwork(instructor);
    await loginUi(instructor, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);
    await instructor.goto(
      `${APP}/instructor/interactive-classroom/presentations/${imported.body.presentationId}/editor`,
      { waitUntil: "domcontentloaded", timeout: 60_000 },
    );
    await instructor.waitForSelector('[data-testid="classroom-google-embed"]', { timeout: 30_000 });
    const iframeSrc = await instructor.$eval(
      '[data-testid="classroom-google-embed"]',
      (el) => (el as HTMLIFrameElement).src,
    );
    if (!iframeSrc.includes(`/presentation/d/${PUBLIC_GOOGLE_ID}/embed`) || !iframeSrc.includes("slide=1")) {
      throw new Error(`editor iframe src=${iframeSrc}`);
    }
    const text = await instructor.evaluate(() => document.body.innerText || "");
    const forbidden = FORBIDDEN_UI.find((msg) => text.includes(msg));
    if (forbidden) throw new Error(`forbidden UI: ${forbidden}`);
    if (net.forbiddenPrimary().length) throw new Error(`forbidden network: ${net.forbiddenPrimary().join(" | ")}`);
    await instructor.screenshot({ path: path.join(outDir, "editor-slide-1.png") });

    for (const slide of [2, 3]) {
      await instructor.evaluate((wanted) => {
        const btn = document.querySelector(`button[aria-label^="Slide ${wanted}:"]`) as HTMLButtonElement | null;
        btn?.click();
      }, slide);
      await instructor.waitForFunction(
        (expected) => {
          const iframe = document.querySelector('[data-testid="classroom-google-embed"]') as HTMLIFrameElement | null;
          return Boolean(iframe?.src?.includes(`slide=${expected}`));
        },
        { timeout: 15_000 },
        slide,
      );
      await instructor.screenshot({ path: path.join(outDir, `editor-slide-${slide}.png`) });
    }

    await instructor.reload({ waitUntil: "domcontentloaded" });
    await instructor.waitForSelector('[data-testid="classroom-google-embed"]', { timeout: 30_000 });
    const refreshSrc = await instructor.$eval(
      '[data-testid="classroom-google-embed"]',
      (el) => (el as HTMLIFrameElement).src,
    );
    if (!refreshSrc.includes(`/presentation/d/${PUBLIC_GOOGLE_ID}/embed`)) {
      throw new Error(`refresh lost google embed: ${refreshSrc}`);
    }
    await instructor.screenshot({ path: path.join(outDir, "editor-refresh.png") });

    const report = {
      presentationId: imported.body.presentationId,
      openMs,
      iframeSrc,
      refreshSrc,
      googleEmbedRequests: net.googleEmbeds().slice(0, 8),
      pptxGets: net.pptxGets(),
      forbiddenPrimary: net.forbiddenPrimary(),
      slideCount: imported.body.slideCount || imported.body.slidesImported,
    };
    await writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
    console.info("[GOOGLE_EMBED] PASS", report);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[GOOGLE_EMBED_FAIL]", error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
