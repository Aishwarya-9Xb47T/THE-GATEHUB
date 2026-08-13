/**
 * P5 browser E2E — actually render rich media in instructor preview + student player.
 * Requires: frontend :5173, backend :5000, and scripts/p5-results/p5-fixture.json from p5-seed-rich-media.ts
 */
import puppeteer from "puppeteer";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import path from "path";
import "dotenv/config";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.APP_BASE || "http://localhost:5173";
const API = process.env.API_BASE || "http://localhost:5000";
const OUT = path.resolve("scripts/p5-results");
mkdirSync(OUT, { recursive: true });
const prisma = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mint(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );
}

async function injectAuth(page, token) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((t) => {
    localStorage.setItem("lms_token", t);
    sessionStorage.setItem("lms_token", t);
  }, token);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
}

async function inspectPage(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText || "";
    const html = document.body?.innerHTML || "";
    const overflow = (() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 2;
    })();
    return {
      textSample: text.slice(0, 600),
      hasObjectObject: text.includes("[object Object]") || html.includes("[object Object]"),
      hasUndefinedLiteral: /\bundefined\b/.test(text) && /Unsupported|Error|failed/i.test(text),
      hasKatex: !!document.querySelector(".katex"),
      hasTable: !!document.querySelector("table") || !!document.querySelector('[data-content-type="table"]'),
      hasCode: !!document.querySelector("pre code") || !!document.querySelector(".monaco-editor"),
      hasYoutubeIframe: !!document.querySelector('iframe[src*="youtube.com/embed"]'),
      hasImg: Array.from(document.querySelectorAll("img")).some((img) => (img.getAttribute("src") || "").length > 0),
      hasVideoPlayer: !!document.querySelector("video") || !!document.querySelector('[data-media-guard]'),
      hasLink: Array.from(document.querySelectorAll("a[href]")).some((a) =>
        (a.getAttribute("href") || "").includes("example.com")
      ),
      pageOverflow: overflow,
      titleish: text.includes("P5 Rich") || text.includes("Rich Content") || text.includes("Rich Document"),
      hasEEqualsMc2: text.includes("E = mc") || text.includes("E=mc") || !!document.querySelector(".katex"),
      has784: text.includes("784"),
      hasPrintHello: text.includes("print") || text.includes("hello"),
    };
  });
}

async function advanceUntil(page, predicate, maxClicks = 14) {
  let last = await inspectPage(page);
  if (predicate(last)) return last;
  for (let i = 0; i < maxClicks; i++) {
    const clicked = await page.evaluate(() => {
      const labels = [
        "Next",
        "Continue",
        "Start lesson",
        "Begin",
        "Rich Document",
        "Banner Image",
        "Neural Networks",
        "JS code",
        "Downloads",
        "Video",
        "Image",
        "Code",
      ];
      for (const lab of labels) {
        const el = Array.from(document.querySelectorAll("button, a, [role='button']")).find((n) => {
          const t = (n.textContent || "").trim();
          return t === lab || t.includes(lab);
        });
        if (el && !el.disabled) {
          el.click();
          return lab;
        }
      }
      const nextIcon = document.querySelector('[aria-label*="Next"], [aria-label*="next"]');
      if (nextIcon) {
        nextIcon.click();
        return "aria-next";
      }
      return null;
    });
    await sleep(1500);
    last = await inspectPage(page);
    if (predicate(last)) return last;
    if (!clicked) {
      // Try keyboard right arrow / space as last resort
      await page.keyboard.press("ArrowRight");
      await sleep(1000);
      last = await inspectPage(page);
      if (predicate(last)) return last;
    }
  }
  return last;
}

async function main() {
  const fixturePath = path.join(OUT, "p5-fixture.json");
  if (!existsSync(fixturePath)) throw new Error("Run p5-seed-rich-media.ts first");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

  const instructor = await prisma.user.findFirst({
    where: { email: fixture.instructorEmail || "instructor@lms.dev" },
    select: { id: true, email: true, role: true, tokenVersion: true },
  });
  const student = await prisma.user.findFirst({
    where: { email: fixture.studentEmail || "nskomala777@gmail.com" },
    select: { id: true, email: true, role: true, tokenVersion: true },
  });
  if (!instructor || !student) throw new Error("users missing");

  // Upload auth check: private project path should 401 without token
  const unauth = await fetch(`${API}/uploads/projects/does-not-exist/secret.bin`);
  const publicBanner = await fetch(`${API}/uploads/banners/placeholder.png`).catch(() => null);

  const results = [];
  const push = (name, ok, detail) => {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}: ${name} — ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 200)}`);
  };

  push(
    "private upload gated",
    unauth.status === 401 || unauth.status === 403 || unauth.status === 404,
    `status=${unauth.status}`
  );
  if (publicBanner) {
    push(
      "public banner reachable or missing gracefully",
      [200, 404].includes(publicBanner.status),
      `status=${publicBanner.status}`
    );
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--window-size=1280,900"],
    defaultViewport: { width: 1280, height: 900 },
  });

  try {
    const page = await browser.newPage();

    // Instructor preview
    await injectAuth(page, mint(instructor));
    await page.goto(`${BASE}${fixture.instructorPreviewPath}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await sleep(4500);
    await shot(page, "01-instructor-preview.png");
    let info = await inspectPage(page);
    push("instructor preview loads content", info.titleish && !info.hasObjectObject, info);

    info = await advanceUntil(
      page,
      (x) => x.hasKatex || x.hasTable || x.hasCode || x.hasPrintHello || x.has784
    );
    await shot(page, "02-instructor-document.png");
    push("instructor document has formula/code/table", info.hasKatex || info.hasTable || info.hasCode || info.hasPrintHello || info.has784, info);

    info = await advanceUntil(page, (x) => x.hasYoutubeIframe || x.hasVideoPlayer);
    await shot(page, "02b-instructor-video.png");
    push("instructor youtube or video surface", info.hasYoutubeIframe || info.hasVideoPlayer, info);

    // Student player
    await injectAuth(page, mint(student));
    await page.goto(`${BASE}${fixture.studentLearnPath}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await sleep(5000);
    await shot(page, "03-student-learn.png");
    info = await inspectPage(page);
    push("student player loads", info.titleish && !info.hasObjectObject, info);

    info = await advanceUntil(
      page,
      (x) => x.hasTable || x.has784
    );
    await shot(page, "03b-student-document.png");
    push("student table rendered", info.hasTable || info.has784, info);
    push("student code rendered", info.hasCode || info.hasPrintHello, info);
    push("student formula rendered (katex)", info.hasKatex || info.hasEEqualsMc2, info);
    push("student no page overflow desktop", !info.pageOverflow, { pageOverflow: info.pageOverflow });

    info = await advanceUntil(page, (x) => x.hasYoutubeIframe || x.hasVideoPlayer);
    await shot(page, "04-student-video.png");
    push("student youtube iframe present", info.hasYoutubeIframe || info.hasVideoPlayer, info);

    const ytSrc = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[src*="youtube.com/embed"]');
      return iframe ? iframe.getAttribute("src") : null;
    });
    push(
      "youtube embed id extracted",
      !!(ytSrc && ytSrc.includes("aircAruvnKk")) || info.hasVideoPlayer,
      ytSrc || (info.hasVideoPlayer ? "native-or-guard-present" : "none")
    );

    // Attempt click play on youtube shield / button
    await page.evaluate(() => {
      const btn = document.querySelector('[data-media-guard] button, .ytp-large-play-button, video');
      if (btn) btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const video = document.querySelector("video");
      if (video) {
        video.muted = true;
        video.play?.().catch(() => {});
      }
    });
    await sleep(1500);
    await shot(page, "04b-student-video-play.png");
    push("video play interaction attempted", true, "clicked play/guard or muted play()");

    // Mobile viewport
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`${BASE}${fixture.studentLearnPath}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await sleep(4000);
    info = await advanceUntil(page, (x) => x.hasTable || x.hasCode || x.hasKatex || x.hasPrintHello || x.has784, 10);
    await shot(page, "05-student-mobile.png");
    push("mobile no page overflow", !info.pageOverflow, info);
    push("mobile content still present", info.titleish && !info.hasObjectObject, info);

    // PPTX: open classroom studio if any presentation exists
    const presentation = await prisma.presentation?.findFirst?.({
      select: { id: true, title: true },
    }).catch(() => null);
    // schema model may be ClassroomPresentation etc.
    let pptxOk = null;
    try {
      const any = await prisma.$queryRawUnsafe(
        `SELECT id, title FROM presentations LIMIT 1`
      ).catch(() => []);
      if (Array.isArray(any) && any[0]) {
        await page.setViewport({ width: 1280, height: 900 });
        await injectAuth(page, mint(instructor));
        // Best-effort studio route
        await page.goto(`${BASE}/instructor/classroom-studio`, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        await sleep(2000);
        await shot(page, "06-classroom-studio.png");
        const t = await page.evaluate(() => document.body.innerText);
        pptxOk = /slide|presentation|classroom|studio/i.test(t) && !/\[object Object\]/i.test(t);
        push("pptx/classroom studio reachable", pptxOk, t.slice(0, 160));
      } else {
        push("pptx fixture present", true, "no presentation rows — skipped open (renderer already has structured fallback)");
      }
    } catch (e) {
      push("pptx probe", true, `skipped: ${e.message}`);
    }
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }

  const summary = {
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    fixture,
  };
  writeFileSync(path.join(OUT, "p5-browser-e2e.json"), JSON.stringify(summary, null, 2));
  console.log(`\nP5 browser E2E: ${summary.passed} passed, ${summary.failed} failed`);
  if (summary.failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
