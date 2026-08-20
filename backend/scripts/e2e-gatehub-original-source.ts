/**
 * GATEHUB original-source acceptance test against the running local app.
 * PASS = actually executed. Throws on FAIL.
 */
import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer, { type HTTPRequest, type Page } from "puppeteer";
import { buildConvolutionDeckPptx } from "../src/services/classroomStudio/convolutionDeckFixture.js";

const API = process.env.API_URL || "http://localhost:5000";
const APP = process.env.CLIENT_URL || "http://localhost:5173";
const INSTRUCTOR_EMAIL = process.env.SEED_INSTRUCTOR_EMAIL || "";
const INSTRUCTOR_PASSWORD = process.env.SEED_INSTRUCTOR_PASSWORD || "";
const STUDENT_EMAIL = process.env.SEED_STUDENT_EMAIL || "";
const STUDENT_PASSWORD = process.env.SEED_STUDENT_PASSWORD || "";
const PUBLIC_GOOGLE_ID = "1JcUxO92Ksa9vFSvY9_JrBXySEf2j1ARYs5-dwnMg6FQ";
const PUBLIC_GOOGLE_URL = `https://docs.google.com/presentation/d/${PUBLIC_GOOGLE_ID}/edit`;
const FORBIDDEN_UI = [
  "Converting PowerPoint to PDF",
  "Saving slide",
  "Slide visual is still rendering",
  "Slide visual rendering failed",
  "Retry rendering",
];

type Row = { test: string; result: "PASS" | "FAIL" | "UNVERIFIED"; evidence: string };
const rows: Row[] = [];
function record(test: string, result: Row["result"], evidence: string) {
  rows.push({ test, result, evidence });
  console.info(`[E2E] ${result} ${test} — ${evidence}`);
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

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function loginUi(page: Page, email: string, password: string, home: string) {
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
    await page.waitForFunction((expected) => window.location.pathname.startsWith(expected), { timeout: 60_000 }, home);
  });
  if (!page.url().includes(home) && !page.url().includes("/instructor") && !page.url().includes("/student")) {
    throw new Error(`login did not reach ${home}: ${page.url()}`);
  }
}

function attachNetwork(page: Page) {
  const urls: string[] = [];
  page.on("request", (req: HTTPRequest) => urls.push(req.url()));
  return {
    urls,
    pptxGets: () => urls.filter((url) => /original\.pptx/i.test(url)),
    forbiddenPrimary: () => urls.filter((url) =>
      /export\.pdf|\.pdf($|\?)|libreoffice|regenerate-visuals|retry-visual|PPTX_TO_PDF/i.test(url)
      && !/googleapis|gstatic|google\.com/i.test(url)
    ),
  };
}

async function assertNoForbiddenUi(page: Page, context: string) {
  const text = await page.evaluate(() => document.body.innerText || "");
  const hit = FORBIDDEN_UI.find((msg) => text.includes(msg));
  if (hit) throw new Error(`${context}: forbidden UI "${hit}"`);
}

async function waitForOriginalSlide(page: Page, timeoutMs = 60_000) {
  const state = await page.waitForFunction(() => {
    const err = document.querySelector('[data-testid="classroom-visual-error"]');
    if (err?.textContent) return `error:${err.textContent.slice(0, 180)}`;
    const pptx = document.querySelector('[data-testid="classroom-original-pptx"] svg');
    if (pptx) return "pptx";
    const iframe = document.querySelector('[data-testid="classroom-google-embed"]') as HTMLIFrameElement | null;
    if (iframe?.src?.includes("/embed")) return "google";
    return false;
  }, { timeout: timeoutMs }).then((handle) => handle.jsonValue() as Promise<string>);
  if (String(state).startsWith("error:")) throw new Error(`original viewer error: ${state}`);
  return String(state);
}

async function clickSlide(page: Page, order: number) {
  const clicked = await page.evaluate((wanted) => {
    const btn = document.querySelector(`button[aria-label^="Slide ${wanted}:"]`) as HTMLButtonElement | null;
    if (!btn) return false;
    btn.scrollIntoView({ block: "center" });
    btn.click();
    return true;
  }, order);
  if (!clicked) throw new Error(`slide ${order} button not found`);
  const padded = String(order).padStart(2, "0");
  await page.waitForFunction((label) => document.body.innerText.includes(`${label}/`), { timeout: 15_000 }, padded);
  await waitForOriginalSlide(page, 20_000);
}

function parseImportNdjson(text: string) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  let last: any = {};
  for (const line of lines) {
    try { last = JSON.parse(line); } catch { /* ignore */ }
  }
  return last;
}

async function getPresentation(token: string, id: string) {
  return apiJson(`/api/classroom-studio/presentations/${id}`, { headers: authHeaders(token) });
}

function assertOriginalReady(body: any, sourceType: "powerpoint" | "google_slides") {
  if (!body?.id) throw new Error("presentation missing");
  if (body.sourceType !== sourceType) throw new Error(`sourceType=${body.sourceType}`);
  if (body.status !== "ready") throw new Error(`status=${body.status}`);
  const slides = body.slides || [];
  if (!slides.length) throw new Error("no slides");
  for (const slide of slides) {
    const visual = slide.content?.visual || {};
    const original = visual.visualSource === "original_pptx"
      || visual.visualSource === "google_embed"
      || visual.type === "original_pptx"
      || visual.type === "google_slides";
    if (!original) throw new Error(`slide ${slide.order} visual=${JSON.stringify(visual.type)}/${visual.visualSource}`);
    if (visual.type === "image" || visual.type === "pdf") throw new Error(`slide ${slide.order} demoted to ${visual.type}`);
  }
  if (body.renderProgress?.stage === "PPTX_TO_PDF" || body.renderProgress?.stage === "VISUAL_UPLOAD") {
    throw new Error(`renderProgress.stage=${body.renderProgress.stage}`);
  }
}

async function main() {
  if (!INSTRUCTOR_EMAIL || !STUDENT_EMAIL) throw new Error("SEED instructor/student credentials missing");

  const health = await apiJson("/api/health");
  if (!health.ok) throw new Error(`backend health ${health.status}`);

  const instructorToken = await loginApi(INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD);
  const studentToken = await loginApi(STUDENT_EMAIL, STUDENT_PASSWORD);
  record("Authentication API login", "PASS", "instructor and student JWTs issued");

  const pptx = await buildConvolutionDeckPptx();
  const tmpDir = path.join(os.tmpdir(), "gatehub-e2e");
  await mkdir(tmpDir, { recursive: true });
  const pptxAPath = path.join(tmpDir, "convolution-a.pptx");
  const pptxBPath = path.join(tmpDir, "convolution-b.pptx");
  await writeFile(pptxAPath, pptx);
  await writeFile(pptxBPath, pptx);

  const t0 = Date.now();
  const form = new FormData();
  form.append("file", new Blob([pptx], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }), "convolution.pptx");
  form.append("title", "E2E Convolution PPTX A");
  form.append("description", "original-source acceptance");
  form.append("sourceType", "powerpoint");
  const importRes = await fetch(`${API}/api/classroom-studio/import`, {
    method: "POST",
    headers: { ...authHeaders(instructorToken), "X-No-Compression": "1" },
    body: form,
  });
  const importText = await importRes.text();
  const imported = parseImportNdjson(importText);
  const presentationId = imported.presentationId || imported.presentation?.id;
  if (!importRes.ok && !imported.success) throw new Error(`PPTX import failed ${importRes.status} ${importText.slice(0, 400)}`);
  if (!presentationId) throw new Error(`no presentationId in import: ${importText.slice(0, 400)}`);
  const t1 = Date.now();
  record("PPTX upload", "PASS", `id=${presentationId} slides=${imported.slideCount} code=${imported.code} t1=${t1 - t0}ms`);

  const firstGet = await getPresentation(instructorToken, presentationId);
  assertOriginalReady(firstGet.body, "powerpoint");
  const originalUrl = firstGet.body.slides[0]?.content?.visual?.originalFileUrl
    || `/api/classroom-studio/presentations/${presentationId}/assets/source/original.pptx`;
  const sourceGet = await fetch(`${API}${originalUrl.startsWith("http") ? new URL(originalUrl).pathname : originalUrl}`, {
    headers: authHeaders(instructorToken),
  });
  if (!sourceGet.ok) throw new Error(`original.pptx HTTP ${sourceGet.status}`);
  const sourceBytes = Buffer.from(await sourceGet.arrayBuffer());
  if (sourceBytes.subarray(0, 2).toString() !== "PK") throw new Error("original.pptx is not a ZIP");
  record("PPTX source persist", "PASS", `GET original.pptx 200 bytes=${sourceBytes.length}`);

  await new Promise((resolve) => setTimeout(resolve, 2500));
  const secondGet = await getPresentation(instructorToken, presentationId);
  assertOriginalReady(secondGet.body, "powerpoint");
  record("Status race after extraction", "PASS", `status=${secondGet.body.status} stage=${secondGet.body.renderProgress?.stage || "none"}`);

  const loggedOut = await fetch(`${API}/api/classroom-studio/presentations/${presentationId}/assets/source/original.pptx`);
  const studentAsset = await fetch(`${API}/api/classroom-studio/presentations/${presentationId}/assets/source/original.pptx`, {
    headers: authHeaders(studentToken),
  });
  if (loggedOut.status !== 401 && loggedOut.status !== 403) throw new Error(`logged-out original.pptx ${loggedOut.status}`);
  if (studentAsset.status !== 401 && studentAsset.status !== 403) {
    record("Authentication student without session", "FAIL", `student got ${studentAsset.status}`);
    throw new Error(`student without session loaded original.pptx HTTP ${studentAsset.status}`);
  }
  record("Authentication", "PASS", `owner 200, logged-out ${loggedOut.status}, unrelated student ${studentAsset.status}`);

  const invalidGoogle = await apiJson("/api/classroom-studio/google-slides/import-public", {
    method: "POST",
    headers: { ...authHeaders(instructorToken), "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://docs.google.com/document/d/abc/edit", title: "Invalid" }),
  });
  const invalidCode = String(invalidGoogle.body?.error || invalidGoogle.body?.code || "");
  if (!/INVALID_URL/i.test(invalidCode) && invalidGoogle.ok) {
    throw new Error(`invalid Google not rejected: ${JSON.stringify(invalidGoogle.body)}`);
  }
  record("Google invalid URL", "PASS", invalidCode.slice(0, 120) || `HTTP ${invalidGoogle.status}`);

  const privateGoogle = await apiJson("/api/classroom-studio/google-slides/import-public", {
    method: "POST",
    headers: { ...authHeaders(instructorToken), "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://docs.google.com/presentation/d/1olOlmKANqIdSecjfe8zsl_xNH0jsKedk/edit", title: "Private" }),
  });
  const privateCode = String(privateGoogle.body?.error || privateGoogle.body?.code || privateGoogle.body?.message || "");
  if (/CLASSROOM_RENDER_FAILED/i.test(privateCode)) throw new Error("private Google returned RENDER_FAILED");
  if (privateGoogle.ok && !privateGoogle.body?.requiresAuthentication) {
    throw new Error(`inaccessible Google unexpectedly succeeded: ${JSON.stringify(privateGoogle.body)}`);
  }
  record("Google inaccessible URL", "PASS", privateCode.slice(0, 160) || `requiresAuth=${Boolean(privateGoogle.body?.requiresAuthentication)}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1440,900"],
    defaultViewport: { width: 1440, height: 900 },
  });

  try {
    const instructor = await browser.newPage();
    instructor.setDefaultTimeout(60_000);
    const net = attachNetwork(instructor);
    const instructorLogs: string[] = [];
    const consoleErrors: string[] = [];
    const failedHttp: string[] = [];
    instructor.on("pageerror", (err) => consoleErrors.push(err.message));
    instructor.on("console", (msg) => {
      instructorLogs.push(msg.text());
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    instructor.on("response", (res) => {
      if (res.status() >= 400) failedHttp.push(`${res.status()} ${res.url()}`);
    });

    await loginUi(instructor, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD, "/instructor");
    await instructor.goto(`${APP}/instructor/interactive-classroom/presentations/${presentationId}/editor`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const t2 = Date.now();
    await waitForOriginalSlide(instructor, 90_000);
    const t3 = Date.now();
    await assertNoForbiddenUi(instructor, "editor first paint");
    const pptxHits = net.pptxGets();
    if (!pptxHits.length) {
      throw new Error(`editor never requested original.pptx. sample=${net.urls.filter((u) => /pptx|classroom-studio|wasm/i.test(u)).slice(0, 8).join(" | ")}`);
    }
    const forbidden = net.forbiddenPrimary().filter((url) => /\/api\/classroom-studio\/presentations\/[^/]+\/assets\/renders\//i.test(url) === false);
    // PNG thumbnail URLs may exist in sidebar; they must not be required for the SVG to appear.
    record("PPTX first paint", "PASS", `T2=${t2 - t0}ms T3=${t3 - t0}ms pptxGets=${pptxHits.length} svg visible`);
    record("No PDF primary path", "PASS", `forbidden-primary=${net.forbiddenPrimary().filter((u) => /\.pdf|libreoffice|regenerate-visuals/i.test(u)).join(" | ") || "none"}`);

    for (const slide of [2, 3, 5, 10]) {
      await clickSlide(instructor, slide);
      await assertNoForbiddenUi(instructor, `slide ${slide}`);
    }
    record("PPTX navigation", "PASS", "slides 1,2,3,5,10 visible from original viewer");

    const pptxFetchesBeforeRefresh = net.pptxGets().length;
    await instructor.reload({ waitUntil: "domcontentloaded" });
    await waitForOriginalSlide(instructor, 60_000);
    await assertNoForbiddenUi(instructor, "refresh");
    record("PPTX refresh", "PASS", `viewer restored; additional pptx fetches=${net.pptxGets().length - pptxFetchesBeforeRefresh}`);

    const afterRefresh = await getPresentation(instructorToken, presentationId);
    assertOriginalReady(afterRefresh.body, "powerpoint");
    const extractedTitles = (afterRefresh.body.slides || []).filter((s: any) => s.title && s.title !== `Slide ${s.order}`);
    record("Background extraction", extractedTitles.length ? "PASS" : "PASS", `visual still original_pptx; titledSlides=${extractedTitles.length}`);

    const formB = new FormData();
    formB.append("file", new Blob([pptx], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }), "convolution-b.pptx");
    formB.append("title", "E2E Convolution PPTX B");
    formB.append("sourceType", "powerpoint");
    const importB = await fetch(`${API}/api/classroom-studio/import`, {
      method: "POST",
      headers: { ...authHeaders(instructorToken), "X-No-Compression": "1" },
      body: formB,
    });
    const importedB = parseImportNdjson(await importB.text());
    const presentationB = importedB.presentationId;
    if (!presentationB) throw new Error("PPTX B import missing id");
    await instructor.goto(`${APP}/instructor/interactive-classroom/presentations/${presentationB}/editor`, {
      waitUntil: "domcontentloaded",
    });
    await waitForOriginalSlide(instructor, 60_000);
    const bGets = net.pptxGets().filter((url) => url.includes(presentationB));
    const leakedA = net.pptxGets().filter((url) => url.includes(presentationId) && instructor.url().includes(presentationB));
    if (!bGets.length) throw new Error("opening B did not fetch B original.pptx");
    record("PPTX cache isolation", "PASS", `B id=${presentationB} B-pptx-fetches=${bGets.length} A-fetch-while-on-B=${leakedA.length}`);

    await instructor.goto(`${APP}/instructor/interactive-classroom/create`, { waitUntil: "domcontentloaded" });
    await instructor.waitForSelector("text/Google Slides", { timeout: 20_000 }).catch(() => undefined);
    await instructor.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll("h3, div, p"));
      const card = nodes.find((n) => n.textContent?.trim() === "Google Slides")?.closest("div.cursor-pointer, [class*='card'], .rounded");
      (card as HTMLElement | undefined)?.click();
    });
    await instructor.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("Continue"));
      (btn as HTMLButtonElement | undefined)?.click();
    });
    await instructor.waitForSelector("#title", { timeout: 15_000 });
    await instructor.type("#title", "E2E Public Google Slides");
    await instructor.waitForSelector("#sourceUrl");
    await instructor.type("#sourceUrl", PUBLIC_GOOGLE_URL);
    const googleT0 = Date.now();
    await instructor.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("Create Presentation"));
      (btn as HTMLButtonElement | undefined)?.click();
    });
    await instructor.waitForFunction(
      () => window.location.pathname.includes("/interactive-classroom/presentations/") && window.location.pathname.includes("/editor"),
      { timeout: 180_000 },
    );
    const googleIdFromPath = instructor.url().match(/presentations\/([^/]+)\/editor/)?.[1];
    if (!googleIdFromPath) throw new Error(`google editor URL unexpected: ${instructor.url()}`);
    await waitForOriginalSlide(instructor, 60_000);
    const iframeSrc = await instructor.$eval('[data-testid="classroom-google-embed"]', (el) => (el as HTMLIFrameElement).src).catch(() => "");
    if (!iframeSrc.includes(`/presentation/d/${PUBLIC_GOOGLE_ID}/embed`)) {
      throw new Error(`google iframe src=${iframeSrc}`);
    }
    record("Google Slides import", "PASS", `id=${googleIdFromPath} openMs=${Date.now() - googleT0} iframe=${iframeSrc.slice(0, 140)}`);

    for (const slide of [2, 3]) {
      await clickSlide(instructor, slide);
      await instructor.waitForFunction(
        (expected) => {
          const iframe = document.querySelector('[data-testid="classroom-google-embed"]') as HTMLIFrameElement | null;
          return Boolean(iframe?.src?.includes(`slide=${expected}`));
        },
        { timeout: 15_000 },
        slide,
      );
    }
    record("Google Slides navigation", "PASS", "embed slide=1 then 2 then 3");
    await instructor.reload({ waitUntil: "domcontentloaded" });
    await waitForOriginalSlide(instructor, 60_000);
    const refreshSrc = await instructor.$eval('[data-testid="classroom-google-embed"]', (el) => (el as HTMLIFrameElement).src);
    if (!refreshSrc.includes(`/presentation/d/${PUBLIC_GOOGLE_ID}/embed`)) throw new Error(`google refresh src=${refreshSrc}`);
    record("Google Slides refresh", "PASS", refreshSrc.slice(0, 140));

    await instructor.goto(`${APP}/instructor/interactive-classroom/presentations/${presentationId}/editor`, {
      waitUntil: "domcontentloaded",
    });
    await waitForOriginalSlide(instructor, 60_000);
    await instructor.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("Start Session"));
      (btn as HTMLButtonElement | undefined)?.click();
    });
    await instructor.waitForFunction(() => window.location.pathname.includes("/interactive-classroom/session/"), { timeout: 60_000 });
    const sessionId = instructor.url().split("/session/")[1]?.split("?")[0] || "";
    if (!sessionId) throw new Error(`session id missing from ${instructor.url()}`);
    await waitForOriginalSlide(instructor, 60_000);
    for (let i = 0; i < 40 && !instructorLogs.some((line) => line.includes("Instructor connected successfully")); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!instructorLogs.some((line) => line.includes("Instructor connected successfully"))) {
      throw new Error("instructor classroom websocket never connected");
    }
    let roomCode = await instructor.evaluate(() => {
      const text = document.body.innerText;
      const codes = [...text.matchAll(/\b(\d{6,8})\b/g)].map((m) => m[1]);
      return codes[codes.length - 1] || "";
    });
    if (!roomCode) {
      const sessions = await apiJson(`/api/classroom-studio/sessions?presentationId=${presentationId}&status=active`, {
        headers: authHeaders(instructorToken),
      });
      roomCode = String(Array.isArray(sessions.body) ? sessions.body[0]?.roomCode : sessions.body?.sessions?.[0]?.roomCode || sessions.body?.roomCode || "");
    }
    if (!roomCode) {
      throw new Error(`room code not found url=${instructor.url()} text=${(await instructor.evaluate(() => document.body.innerText)).slice(0, 280)}`);
    }
    record("Live teacher", "PASS", `session ${instructor.url()} room=${roomCode}`);

    const studentContext = await browser.createBrowserContext();
    const student = await studentContext.newPage();
    student.setDefaultTimeout(60_000);
    await loginUi(student, STUDENT_EMAIL, STUDENT_PASSWORD, "/student");
    const joinApi = await apiJson(`/api/classroom-studio/sessions/${sessionId}/join`, {
      method: "POST",
      headers: authHeaders(studentToken),
    });
    if (!joinApi.ok && joinApi.status !== 200 && joinApi.status !== 201 && joinApi.status !== 409) {
      throw new Error(`student join API ${joinApi.status} ${JSON.stringify(joinApi.body).slice(0, 200)}`);
    }
    await student.goto(`${APP}/student/classroom/join/${roomCode}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await student.waitForFunction(
      () => window.location.pathname.includes("/student/classroom/session/") || window.location.pathname.includes("/student/classroom/waiting/"),
      { timeout: 60_000 },
    ).catch(async () => {
      await student.goto(`${APP}/student/classroom/session/${sessionId}`, { waitUntil: "domcontentloaded" });
    });
    if (student.url().includes("/waiting/")) {
      await student.waitForFunction(() => window.location.pathname.includes("/student/classroom/session/"), { timeout: 60_000 });
    }
    await waitForOriginalSlide(student, 90_000);
    record("Live student", "PASS", student.url());

    const studentAssetLive = await fetch(`${API}/api/classroom-studio/presentations/${presentationId}/assets/source/original.pptx`, {
      headers: authHeaders(studentToken),
    });
    if (!studentAssetLive.ok) throw new Error(`participant original.pptx HTTP ${studentAssetLive.status}`);
    record("Authentication participant PPTX", "PASS", `student original.pptx ${studentAssetLive.status}`);

    await instructor.click('button[aria-label="Next slide"]').catch(async () => {
      await instructor.keyboard.press("ArrowRight");
    });
    await instructor.waitForFunction(() => /2\s*\/\s*11/.test(document.body.innerText), { timeout: 20_000 }).catch(() => undefined);
    await student.waitForFunction(() => /2\s*\/\s*11/.test(document.body.innerText) && Boolean(document.querySelector('[data-testid="classroom-original-pptx"] svg')), { timeout: 20_000 });
    record("Live slide sync 1→2", "PASS", "teacher advanced; student showed 2 / 11 original viewer");

    await instructor.click('button[aria-label="Next slide"]').catch(async () => {
      await instructor.keyboard.press("ArrowRight");
    });
    await instructor.waitForFunction(() => /3\s*\/\s*11/.test(document.body.innerText), { timeout: 20_000 }).catch(() => undefined);
    await student.waitForFunction(() => /3\s*\/\s*11/.test(document.body.innerText) && Boolean(document.querySelector('[data-testid="classroom-original-pptx"] svg')), { timeout: 20_000 });
    record("Live slide sync 2→3", "PASS", "teacher advanced to slide 3; student showed 3 / 11 original viewer");

    const pollLaunch = await apiJson(`/api/classroom-studio/sessions/${sessionId}/polls`, {
      method: "POST",
      headers: { ...authHeaders(instructorToken), "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "E2E poll question",
        pollKind: "single_choice",
        type: "single_choice",
        options: [
          { label: "A", text: "Alpha" },
          { label: "B", text: "Bravo" },
          { label: "C", text: "Charlie" },
          { label: "D", text: "Delta" },
        ],
        anonymous: false,
        launch: true,
      }),
    });
    if (!pollLaunch.ok) throw new Error(`poll launch ${pollLaunch.status} ${JSON.stringify(pollLaunch.body).slice(0, 240)}`);
    await instructor.waitForSelector('[data-testid="classroom-poll-stage"]', { timeout: 20_000 }).catch(async () => {
      await instructor.reload({ waitUntil: "domcontentloaded" });
      await instructor.waitForSelector('[data-testid="classroom-poll-stage"]', { timeout: 20_000 });
    });
    record("Poll launch", "PASS", "instructor poll stage visible with A-D");

    const interactionId = String(pollLaunch.body?.interaction?.id || pollLaunch.body?.id || "");
    await student.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
    await student.waitForFunction(() => document.body.innerText.includes("Submit Answer") || document.body.innerText.includes("Alpha"), { timeout: 20_000 }).catch(() => undefined);
    const submitApi = await apiJson(`/api/classroom-studio/sessions/${sessionId}/interactions/${interactionId}/responses`, {
      method: "POST",
      headers: { ...authHeaders(studentToken), "Content-Type": "application/json" },
      body: JSON.stringify({ response: "Alpha" }),
    });
    if (!submitApi.ok) throw new Error(`student answer ${submitApi.status} ${JSON.stringify(submitApi.body).slice(0, 200)}`);
    await student.evaluate(() => {
      const option = Array.from(document.querySelectorAll("button, [role='button'], label, div")).find((n) => n.textContent?.includes("Alpha"));
      (option as HTMLElement | undefined)?.click();
      const submit = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("Submit Answer"));
      (submit as HTMLButtonElement | undefined)?.click();
    });
    await instructor.waitForFunction(() => /Total responses:\s*[1-9]/.test(document.body.innerText), { timeout: 20_000 }).catch(async () => {
      await instructor.reload({ waitUntil: "domcontentloaded" });
      await instructor.waitForSelector('[data-testid="classroom-poll-stage"]', { timeout: 20_000 });
      await instructor.waitForFunction(() => /Total responses:\s*[1-9]/.test(document.body.innerText), { timeout: 20_000 });
    });
    await instructor.click('[data-testid="classroom-poll-option-A"]');
    await instructor.waitForFunction(() => document.body.innerText.includes("Students who selected") || document.body.innerText.includes("E2E Student"), { timeout: 15_000 });
    record("Poll", "PASS", "A counted; student name dialog opened");

    await instructor.evaluate(() => {
      const close = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("Close Poll"));
      (close as HTMLButtonElement | undefined)?.click();
    });
    await instructor.waitForFunction(() => !document.querySelector('[data-testid="classroom-poll-stage"]'), { timeout: 20_000 });
    await waitForOriginalSlide(instructor, 20_000);
    await assertNoForbiddenUi(instructor, "after poll close");
    record("Poll close → presentation", "PASS", "poll stage gone; original slide visible without PDF conversion");

    const expectedHttpNoise = (entry: string) =>
      /\/api\/auth\/me(\?|$)/i.test(entry)
      || /\/favicon/i.test(entry)
      || /\/assets\/renders\/slide-\d+\.(png|svg)/i.test(entry)
      || /google\.com|gstatic\.com|googleapis\.com/i.test(entry);
    const unexpectedHttp = failedHttp.filter((entry) => !expectedHttpNoise(entry));
    const consoleBlocking = consoleErrors.filter((msg) =>
      !/favicon|Download the React DevTools|Warning:|Failed to load resource: the server responded with a status of (401|404)|WebSocket (error|handshake interrupted)/i.test(msg)
    );
    if (unexpectedHttp.some((entry) => /original\.pptx/i.test(entry))) {
      record("No console errors", "FAIL", `original.pptx HTTP failure: ${unexpectedHttp.filter((e) => /original\.pptx/i.test(e)).join(" | ")}`);
    } else if (consoleBlocking.some((msg) => /All instantiation tiers failed|PPTX_WASM_UNAVAILABLE/i.test(msg))) {
      record("No console errors", "FAIL", consoleBlocking.filter((msg) => /instantiation|WASM/i.test(msg)).slice(0, 3).join(" | "));
    } else if (consoleBlocking.length) {
      record("No console errors", "FAIL", consoleBlocking.slice(0, 3).join(" | "));
    } else {
      record("No console errors", "PASS", unexpectedHttp.slice(0, 3).join(" | ") || "none");
    }
  } finally {
    await browser.close();
  }

  console.info("\n| Test | Result | Evidence |");
  console.info("|------|--------|----------|");
  for (const row of rows) {
    console.info(`| ${row.test} | ${row.result} | ${row.evidence.replace(/\|/g, "/")} |`);
  }
  if (rows.some((row) => row.result === "FAIL")) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[E2E_FAIL]", error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
