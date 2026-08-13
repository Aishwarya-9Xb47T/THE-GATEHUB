/**
 * P6 browser E2E — premium UX + responsive hardening smoke.
 * Visits Admin / Instructor / Student major routes at desktop + mobile.
 * Requires frontend :5173 and backend :5000.
 */
import puppeteer from "puppeteer";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import "dotenv/config";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.APP_BASE || "http://localhost:5173";
const OUT = path.resolve("scripts/browser-p6-e2e");
mkdirSync(OUT, { recursive: true });
const prisma = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COURSE_ID = "cmsq2oect00e3jn2afshiac8r";
const LU_ID = "cmsq2od7a0001jn2aoy29aabc";

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

async function pageHealth(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText || "";
    const html = document.body?.innerHTML || "";
    const doc = document.documentElement;
    const overflow = doc.scrollWidth > doc.clientWidth + 4;
    return {
      title: document.title,
      url: location.pathname,
      overflow,
      hasObjectObject: text.includes("[object Object]") || html.includes("[object Object]"),
      hasNullLiteral: /\bnull\b/.test(text) && /Error|Failed|undefined/i.test(text),
      hasUndefinedUi: /:\s*undefined\b|\bundefined\b/.test(text) && /(error|failed|null)/i.test(text),
      hasLorem: /Lorem ipsum/i.test(text),
      hasFakeSale: /\$99\.99|80%\s*OFF/i.test(text),
      hasFakeEnroll: /1234 students enrolled/i.test(text),
      textSample: text.replace(/\s+/g, " ").slice(0, 280),
      hasRetry: /Retry/i.test(text),
      hasSpinnerOrSkeleton:
        !!document.querySelector('[class*="animate-spin"], [class*="skeleton"], [data-skeleton]'),
    };
  });
}

async function visit(page, results, { role, route, name, expectText, forbidText, waitMs = 1800 }) {
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(waitMs);
  await shot(page, `${name}.png`);
  const health = await pageHealth(page);
  const textOk = expectText ? expectText.test(health.textSample + " " + (await page.evaluate(() => document.body.innerText))) : true;
  const fullText = await page.evaluate(() => document.body.innerText || "");
  const forbidHit = forbidText ? forbidText.test(fullText) : false;
  const pass =
    textOk &&
    !forbidHit &&
    !health.overflow &&
    !health.hasObjectObject &&
    !health.hasLorem &&
    !health.hasFakeSale &&
    !health.hasFakeEnroll;
  results.push({
    step: name,
    role,
    route,
    pass,
    textOk,
    forbidHit,
    overflow: health.overflow,
    hasObjectObject: health.hasObjectObject,
    hasLorem: health.hasLorem,
    hasFakeSale: health.hasFakeSale,
    hasFakeEnroll: health.hasFakeEnroll,
    sample: health.textSample,
  });
  return pass;
}

async function main() {
  const results = [];
  const [admin, instructor, student] = await Promise.all([
    prisma.user.findFirst({
      where: { email: "superadmin@platform.local" },
      select: { id: true, email: true, role: true, tokenVersion: true },
    }),
    prisma.user.findFirst({
      where: { email: "instructor@lms.dev" },
      select: { id: true, email: true, role: true, tokenVersion: true },
    }),
    prisma.user.findFirst({
      where: { email: "nskomala777@gmail.com" },
      select: { id: true, email: true, role: true, tokenVersion: true },
    }),
  ]);
  if (!admin || !instructor || !student) {
    throw new Error("Missing admin/instructor/student fixture users");
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--window-size=1280,900"],
    defaultViewport: { width: 1280, height: 900 },
  });
  const page = await browser.newPage();

  // ── ADMIN DESKTOP ──
  await injectAuth(page, mint(admin));
  await visit(page, results, {
    role: "admin",
    route: "/admin",
    name: "A-desktop-dashboard",
    expectText: /Admin Dashboard|Total Users|Students/i,
  });
  await visit(page, results, {
    role: "admin",
    route: "/admin/users",
    name: "A-desktop-users",
    expectText: /Users|Email|Role/i,
  });
  await visit(page, results, {
    role: "admin",
    route: "/admin/courses",
    name: "A-desktop-courses",
    expectText: /Courses|Published|Draft/i,
  });
  await visit(page, results, {
    role: "admin",
    route: "/admin/categories",
    name: "A-desktop-categories",
    expectText: /Categor/i,
  });
  await visit(page, results, {
    role: "admin",
    route: "/admin/learning-universes",
    name: "A-desktop-lus",
    expectText: /Learning Universe|Universes/i,
  });
  await visit(page, results, {
    role: "admin",
    route: "/admin/reports",
    name: "A-desktop-reports",
    expectText: /Report/i,
  });
  await visit(page, results, {
    role: "admin",
    route: "/admin/settings",
    name: "A-desktop-settings",
    expectText: /Setting|Certificate|Platform/i,
  });

  // Admin mobile
  await page.setViewport({ width: 390, height: 844 });
  await visit(page, results, {
    role: "admin",
    route: "/admin",
    name: "A-mobile-dashboard",
    expectText: /Admin Dashboard|Total Users|Students/i,
  });
  await visit(page, results, {
    role: "admin",
    route: "/admin/users",
    name: "A-mobile-users",
    expectText: /Users|Email/i,
  });

  // ── INSTRUCTOR DESKTOP ──
  await page.setViewport({ width: 1280, height: 900 });
  await injectAuth(page, mint(instructor));
  await visit(page, results, {
    role: "instructor",
    route: "/instructor",
    name: "I-desktop-dashboard",
    expectText: /Dashboard|My Courses|Create/i,
    forbidText: /Avg Rating[\s\S]{0,40}—[\s\S]{0,20}hard|console\.log/i,
  });
  await visit(page, results, {
    role: "instructor",
    route: "/instructor/courses",
    name: "I-desktop-courses",
    expectText: /Course|Create|Published|Draft/i,
  });
  await visit(page, results, {
    role: "instructor",
    route: "/instructor/courses/new",
    name: "I-desktop-create",
    expectText: /Create|Course|method|AI|Classic|Universe/i,
  });
  await visit(page, results, {
    role: "instructor",
    route: "/instructor/students",
    name: "I-desktop-students",
    expectText: /Student/i,
  });
  await visit(page, results, {
    role: "instructor",
    route: "/instructor/reports",
    name: "I-desktop-reports",
    expectText: /Report/i,
  });
  await visit(page, results, {
    role: "instructor",
    route: "/instructor/certificates",
    name: "I-desktop-certs",
    expectText: /Certificate/i,
  });

  await page.setViewport({ width: 390, height: 844 });
  await visit(page, results, {
    role: "instructor",
    route: "/instructor",
    name: "I-mobile-dashboard",
    expectText: /Dashboard|Course/i,
  });
  await visit(page, results, {
    role: "instructor",
    route: "/instructor/students",
    name: "I-mobile-students",
    expectText: /Student/i,
  });

  // ── STUDENT DESKTOP ──
  await page.setViewport({ width: 1280, height: 900 });
  await injectAuth(page, mint(student));
  await visit(page, results, {
    role: "student",
    route: "/student",
    name: "S-desktop-dashboard",
    expectText: /Continue Learning|Browse|Dashboard|Enrolled|Certificate/i,
  });
  await visit(page, results, {
    role: "student",
    route: "/student/browse",
    name: "S-desktop-browse",
    expectText: /Browse|Course|Learning/i,
  });
  await visit(page, results, {
    role: "student",
    route: `/courses/${COURSE_ID}`,
    name: "S-desktop-course-detail",
    expectText: /Deep Learning|Continue Learning|Start Learning|Review Course|Enroll|Free/i,
    forbidText: /\$99\.99|80%\s*OFF|1234 students/i,
  });
  await visit(page, results, {
    role: "student",
    route: "/student/my-courses",
    name: "S-desktop-my-courses",
    expectText: /My Courses|Deep Learning|%/i,
  });
  await visit(page, results, {
    role: "student",
    route: `/student/learning-universe/${LU_ID}/learn`,
    name: "S-desktop-player",
    expectText: /Deep Learning|Progress|Lesson|Module|Neural/i,
    waitMs: 4500,
  });
  await visit(page, results, {
    role: "student",
    route: "/student/certificates",
    name: "S-desktop-certs",
    expectText: /Certificate/i,
  });
  await visit(page, results, {
    role: "student",
    route: "/student/quiz-results",
    name: "S-desktop-quiz-results",
    expectText: /Quiz|Result|Score|Marks|%/i,
  });

  // Student mobile
  await page.setViewport({ width: 390, height: 844 });
  await visit(page, results, {
    role: "student",
    route: "/student",
    name: "S-mobile-dashboard",
    expectText: /Continue Learning|Browse|Dashboard|Enrolled/i,
  });
  await visit(page, results, {
    role: "student",
    route: "/student/browse",
    name: "S-mobile-browse",
    expectText: /Browse|Course/i,
  });
  await visit(page, results, {
    role: "student",
    route: `/student/learning-universe/${LU_ID}/learn`,
    name: "S-mobile-player",
    expectText: /Deep Learning|Progress|Lesson|Module/i,
    waitMs: 4500,
  });
  await visit(page, results, {
    role: "student",
    route: "/student/my-courses",
    name: "S-mobile-my-courses",
    expectText: /My Courses|%/i,
  });

  // Extra breakpoints smoke on student dashboard
  for (const [w, h, label] of [
    [360, 740, "360"],
    [414, 896, "414"],
    [768, 1024, "768"],
    [1024, 768, "1024"],
  ]) {
    await page.setViewport({ width: w, height: h });
    await visit(page, results, {
      role: "student",
      route: "/student",
      name: `S-bp-${label}-dashboard`,
      expectText: /Dashboard|Continue|Browse|Enrolled/i,
      waitMs: 1200,
    });
  }

  await browser.close();
  await prisma.$disconnect();

  writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.pass);
  const passed = results.filter((r) => r.pass);
  console.log(JSON.stringify({ total: results.length, passed: passed.length, failed: failed.length, failedSteps: failed }, null, 2));
  if (failed.length) {
    process.exit(1);
  }
  console.log(`P6 browser E2E: ${passed.length}/${results.length} PASS`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
