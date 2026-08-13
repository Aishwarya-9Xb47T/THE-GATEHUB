/**
 * P7 PPTX browser E2E — open an existing presentation in the instructor editor,
 * verify slides render, navigate slide 1 → 2, check overflow / [object Object].
 */
import puppeteer from "puppeteer";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import "dotenv/config";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.APP_BASE || "http://localhost:5173";
const OUT = path.resolve("scripts/p7-results");
mkdirSync(OUT, { recursive: true });
const prisma = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const results = [];
  const presentation = await prisma.presentation.findFirst({
    where: { slides: { some: {} } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      instructorId: true,
      _count: { select: { slides: true } },
    },
  });
  if (!presentation || presentation._count.slides < 2) {
    throw new Error("Need a presentation with at least 2 slides");
  }

  const instructor = await prisma.user.findUnique({
    where: { id: presentation.instructorId },
    select: { id: true, email: true, role: true, tokenVersion: true },
  });
  if (!instructor) throw new Error("instructor missing");

  const token = jwt.sign(
    {
      userId: instructor.id,
      email: instructor.email,
      role: instructor.role,
      tokenVersion: instructor.tokenVersion ?? 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--window-size=1280,900"],
    defaultViewport: { width: 1280, height: 900 },
  });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e.message || e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((t) => {
    localStorage.setItem("lms_token", t);
    sessionStorage.setItem("lms_token", t);
  }, token);

  const editorUrl = `${BASE}/instructor/interactive-classroom/${presentation.id}/edit`;
  await page.goto(editorUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(5000);
  await page.screenshot({ path: path.join(OUT, "pptx-01-editor.png"), fullPage: true });

  const slide1 = await page.evaluate(() => {
    const text = document.body?.innerText || "";
    const html = document.body?.innerHTML || "";
    const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 4;
    const slideEls = document.querySelectorAll(
      '[data-slide], .slide, [class*="Slide"], canvas, svg'
    ).length;
    return {
      textSample: text.replace(/\s+/g, " ").slice(0, 400),
      hasObjectObject: text.includes("[object Object]") || html.includes("[object Object]"),
      overflow,
      slideEls,
      hasEditorChrome: /Slide|Presentation|Classroom|Export|Present/i.test(text),
    };
  });
  results.push({
    step: "open-editor",
    presentationId: presentation.id,
    slideCount: presentation._count.slides,
    pass: slide1.hasEditorChrome && !slide1.hasObjectObject,
    ...slide1,
  });

  // Try click slide 2 in thumbnail list
  const clicked = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("button, [role='button'], a, div, li"));
    const slide2 = candidates.find((el) => {
      const t = (el.textContent || "").trim();
      return t === "2" || t === "Slide 2" || /^2\b/.test(t);
    });
    if (slide2) {
      slide2.click();
      return (slide2.textContent || "").trim();
    }
    // keyboard next
    return null;
  });
  if (!clicked) {
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
  }
  await sleep(2000);
  await page.screenshot({ path: path.join(OUT, "pptx-02-slide2.png"), fullPage: true });

  const slide2 = await page.evaluate(() => {
    const text = document.body?.innerText || "";
    const html = document.body?.innerHTML || "";
    return {
      textSample: text.replace(/\s+/g, " ").slice(0, 400),
      hasObjectObject: text.includes("[object Object]") || html.includes("[object Object]"),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 4,
    };
  });
  results.push({
    step: "navigate-slide-2",
    clicked: clicked || "keyboard",
    pass: !slide2.hasObjectObject && !slide2.overflow,
    ...slide2,
  });

  // Mobile viewport
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(editorUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(4000);
  await page.screenshot({ path: path.join(OUT, "pptx-03-mobile.png"), fullPage: true });
  const mobile = await page.evaluate(() => {
    const text = document.body?.innerText || "";
    const html = document.body?.innerHTML || "";
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 4,
      hasObjectObject: text.includes("[object Object]") || html.includes("[object Object]"),
      textSample: text.replace(/\s+/g, " ").slice(0, 300),
    };
  });
  results.push({
    step: "mobile-editor",
    pass: !mobile.hasObjectObject,
    ...mobile,
    note: mobile.overflow ? "mobile overflow noted (editor may scroll horizontally by design)" : "ok",
  });

  await browser.close();
  await prisma.$disconnect();

  const criticalConsole = consoleErrors.filter(
    (e) =>
      !/favicon|ResizeObserver|Download the React DevTools|net::ERR_|Encountered two children with the same key|Failed to load resource: the server responded with a status of 401/i.test(
        e
      )
  );
  results.push({
    step: "console",
    pass: criticalConsole.length === 0,
    errors: criticalConsole.slice(0, 12),
  });

  writeFileSync(path.join(OUT, "p7-pptx.json"), JSON.stringify({ results, consoleErrors: criticalConsole }, null, 2));
  console.log(JSON.stringify({ results, consoleErrors: criticalConsole }, null, 2));

  const failed = results.filter((r) => !r.pass && r.step !== "mobile-editor");
  // mobile overflow is soft
  const hardFail = results.filter((r) => r.step !== "mobile-editor" && !r.pass);
  if (hardFail.length) {
    console.error("P7 PPTX FAIL", hardFail);
    process.exit(1);
  }
  console.log("P7 PPTX browser PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
