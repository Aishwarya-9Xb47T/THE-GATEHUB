/**
 * P3 browser E2E — admin / instructor / student dashboards.
 */
import puppeteer from "puppeteer";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import "dotenv/config";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.APP_BASE || "http://localhost:5173";
const OUT = path.resolve("scripts/browser-p3-e2e");
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
  await page.evaluate((t) => localStorage.setItem("lms_token", t), token);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
}

async function main() {
  const results = [];
  const admin =
    (await prisma.user.findFirst({
      where: { email: process.env.SUPER_ADMIN_EMAIL || "superadmin@platform.local" },
      select: { id: true, email: true, role: true, tokenVersion: true },
    })) ||
    (await prisma.user.findFirst({
      where: { role: { in: ["admin", "super_admin"] } },
      select: { id: true, email: true, role: true, tokenVersion: true },
    }));
  const instructor = await prisma.user.findFirst({
    where: { email: "instructor@lms.dev" },
    select: { id: true, email: true, role: true, tokenVersion: true },
  });
  const student = await prisma.user.findFirst({
    where: { email: "nskomala777@gmail.com" },
    select: { id: true, email: true, role: true, tokenVersion: true },
  });
  if (!admin || !instructor || !student) throw new Error("users missing");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--window-size=1280,900"],
    defaultViewport: { width: 1280, height: 900 },
  });
  const page = await browser.newPage();

  // ADMIN
  await injectAuth(page, mint(admin));
  for (const [route, file, expect] of [
    ["/admin/courses", "01-admin-courses.png", /Courses|Title|Status/i],
    ["/admin/learning-universes", "02-admin-lu.png", /Learning Universe/i],
    ["/admin/reviews", "03-admin-reviews.png", /Reviews|Visible|Hidden|Hide|Unhide/i],
    ["/admin/reports", "04-admin-reports.png", /Reports/i],
  ]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(2000);
    await shot(page, file);
    const text = await page.evaluate(() => document.body.innerText);
    results.push({
      role: "admin",
      route,
      ok: expect.test(text) && !/404|Not Found|undefined|\[object Object\]/i.test(text),
      snippet: text.slice(0, 180),
    });
  }

  // INSTRUCTOR
  await injectAuth(page, mint(instructor));
  for (const [route, file, expect] of [
    ["/instructor", "05-instructor-dash.png", /Dashboard|Course/i],
    ["/instructor/courses", "06-instructor-courses.png", /Course|My Courses|Create/i],
    ["/instructor/students", "07-instructor-students.png", /Students|Progress|Certificate/i],
    ["/instructor/reports", "08-instructor-reports.png", /Reports|Overview|Quiz Room|Certificates/i],
    ["/instructor/certificates", "09-instructor-certs.png", /Certificate/i],
  ]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(2000);
    await shot(page, file);
    const text = await page.evaluate(() => document.body.innerText);
    results.push({
      role: "instructor",
      route,
      ok: expect.test(text) && !/404|Not Found|undefined|\[object Object\]/i.test(text),
      snippet: text.slice(0, 180),
    });
  }

  // STUDENT
  await injectAuth(page, mint(student));
  for (const [route, file, expect] of [
    ["/student/browse", "10-student-browse.png", /Browse|Course|Learning/i],
    ["/student/my-courses", "11-student-mycourses.png", /My Courses|Continue|Review|Progress|%/i],
    ["/student/certificates", "12-student-certs.png", /Certificate/i],
  ]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(2500);
    await shot(page, file);
    const text = await page.evaluate(() => document.body.innerText);
    results.push({
      role: "student",
      route,
      ok: expect.test(text) && !/404|Not Found|undefined|\[object Object\]/i.test(text),
      snippet: text.slice(0, 180),
    });
  }

  // Refresh stability on My Courses
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2000);
  const afterRefresh = await page.evaluate(() => document.body.innerText);
  results.push({
    role: "student",
    route: "/student/my-courses#refresh",
    ok: /My Courses|Continue|Review|Progress|%/i.test(afterRefresh),
    snippet: afterRefresh.slice(0, 180),
  });

  await browser.close();
  const passed = results.every((r) => r.ok);
  writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ passed, results }, null, 2));
  console.log(JSON.stringify({ passed, count: results.length, failed: results.filter((r) => !r.ok) }, null, 2));
  if (!passed) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await prisma.$disconnect();
});
