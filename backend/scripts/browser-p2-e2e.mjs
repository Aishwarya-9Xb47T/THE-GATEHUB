/**
 * P2 browser E2E — student browse → continue → verify certificate page.
 * Requires frontend :5173 and backend :5000.
 */
import puppeteer from "puppeteer";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import "dotenv/config";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.APP_BASE || "http://localhost:5173";
const API = process.env.API_BASE || "http://localhost:5000/api";
const OUT = path.resolve("scripts/browser-p2-e2e");
mkdirSync(OUT, { recursive: true });
const prisma = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const results = [];
  const courseId = "cmsq2oect00e3jn2afshiac8r";
  const student = await prisma.user.findFirst({
    where: { email: "nskomala777@gmail.com" },
    select: { id: true, email: true, role: true, tokenVersion: true },
  });
  if (!student) throw new Error("student missing");
  const token = jwt.sign(
    { userId: student.id, email: student.email, role: student.role, tokenVersion: student.tokenVersion ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );

  const cert = await prisma.learningUniverseCertificate.findFirst({
    where: { userId: student.id, status: "active" },
    select: { certificateId: true },
  });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--window-size=1280,900"],
    defaultViewport: { width: 1280, height: 900 },
  });
  const page = await browser.newPage();

  // Inject auth
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((t) => {
    localStorage.setItem("lms_token", t);
  }, token);
  await page.goto(`${BASE}/student`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2000);

  // Browse
  await page.goto(`${BASE}/student/browse`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2000);
  await page.screenshot({ path: path.join(OUT, "01-browse.png"), fullPage: true });
  const browseText = await page.evaluate(() => document.body.innerText);
  results.push({
    step: "browse",
    hasDeepLearning: /Deep Learning/i.test(browseText),
    hasContinue: /Continue Learning|Start Learning|Review Course/i.test(browseText),
  });

  // My Courses
  await page.goto(`${BASE}/student/my-courses`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2000);
  await page.screenshot({ path: path.join(OUT, "02-my-courses.png"), fullPage: true });
  const myText = await page.evaluate(() => document.body.innerText);
  results.push({
    step: "my-courses",
    hasProgress: /\d+%/.test(myText),
    hasDeepLearning: /Deep Learning/i.test(myText),
  });

  // Continue deep link via API then navigate
  const enrollRes = await fetch(`${API}/enrollments/my`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  const card = (enrollRes.enrollments || []).find((e) => e.course?.id === courseId);
  const continueUrl = card?.continueUrl || `/student/course/${courseId}/learn`;
  await page.goto(`${BASE}${continueUrl}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(5000);
  await page.screenshot({ path: path.join(OUT, "03-learn.png"), fullPage: true });
  const learnText = await page.evaluate(() => document.body.innerText);
  results.push({
    step: "learn",
    continueUrl,
    loaded: !/Experience unavailable|Failed to load|not available in the current learning format/i.test(learnText),
    hasOutline: /Neural|Lesson|Module|Progress|Deep Learning/i.test(learnText),
    snippet: learnText.slice(0, 400),
  });

  // Dashboard
  await page.goto(`${BASE}/student`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2000);
  await page.screenshot({ path: path.join(OUT, "04-dashboard.png"), fullPage: true });
  const dashText = await page.evaluate(() => document.body.innerText);
  results.push({
    step: "dashboard",
    hasContinue: /Continue/i.test(dashText),
    hasDeepLearning: /Deep Learning/i.test(dashText),
  });

  // Verify certificate (public)
  if (cert?.certificateId) {
    await page.goto(`${BASE}/verify/certificate/${cert.certificateId}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await sleep(2000);
    await page.screenshot({ path: path.join(OUT, "05-verify.png"), fullPage: true });
    const verifyText = await page.evaluate(() => document.body.innerText);
    results.push({
      step: "verify-valid",
      verified: /VERIFIED|ACTIVE/i.test(verifyText),
      student: /Komala/i.test(verifyText),
      course: /Deep Learning/i.test(verifyText),
      notSample: !/Sample Student/i.test(verifyText),
    });
  }

  await page.goto(`${BASE}/verify/certificate/INVALID-CERT-ID-XYZ`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, "06-verify-invalid.png"), fullPage: true });
  const invalidText = await page.evaluate(() => document.body.innerText);
  results.push({
    step: "verify-invalid",
    notFound: /Certificate Not Found|not found/i.test(invalidText),
  });

  // Mobile width
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`${BASE}/student/my-courses`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, "07-mobile-mycourses.png"), fullPage: true });
  results.push({ step: "mobile-mycourses", ok: true });

  // Also click Continue from browse if present
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE}/student/browse`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2000);
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button, a"));
    const btn = buttons.find((b) => /Continue Learning|Review Course|Start Learning/i.test(b.textContent || ""));
    if (btn) {
      btn.click();
      return (btn.textContent || "").trim() || true;
    }
    return false;
  });
  await sleep(4000);
  await page.screenshot({ path: path.join(OUT, "08-browse-continue-click.png"), fullPage: true });
  results.push({
    step: "browse-continue-click",
    clicked,
    href: page.url(),
  });

  await browser.close();
  await prisma.$disconnect();

  writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));

  const failed = results.filter((r) => {
    if (r.step === "browse") return !r.hasDeepLearning;
    if (r.step === "my-courses") return !r.hasDeepLearning || !r.hasProgress;
    if (r.step === "learn") return !r.loaded;
    if (r.step === "verify-valid") return !r.verified || !r.student || !r.notSample;
    if (r.step === "verify-invalid") return !r.notFound;
    return false;
  });
  if (failed.length) {
    console.error("FAILED", failed);
    process.exit(1);
  }
  console.log("=== P2 BROWSER E2E PASS ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
