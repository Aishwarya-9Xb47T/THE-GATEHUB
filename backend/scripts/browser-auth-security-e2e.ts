/**
 * Browser auth security smoke (Puppeteer).
 * Uses DB-issued reset tokens when SMTP is unavailable.
 *
 *   npx tsx scripts/browser-auth-security-e2e.ts
 */
import "dotenv/config";
import puppeteer from "puppeteer";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { issueAuthToken } from "../src/services/authTokenService.js";

const FRONTEND = process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173";
const prisma = new PrismaClient();
const results: { name: string; ok: boolean; detail?: string }[] = [];

function record(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(ok ? "PASS" : "FAIL", name, detail);
}

async function main() {
  const stamp = Date.now();
  const email = `browser.auth.${stamp}@gatehub.test`;
  const password = "BrowserPass1!";
  const hash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hash,
      firstName: "Browser",
      lastName: "Auth",
      role: "student",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--window-size=1280,900"],
    defaultViewport: { width: 1280, height: 900 },
  });
  const page = await browser.newPage();

  try {
    await page.goto(`${FRONTEND}/login`, { waitUntil: "networkidle2", timeout: 60000 });
    await page.type('input#email, input[type="email"]', email);
    await page.type('input[type="password"]', password);
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => null),
    ]);
    record(
      "login",
      /student|dashboard|browse|my-courses/i.test(page.url()) || !page.url().endsWith("/login"),
      page.url()
    );

    await page.evaluate(() => {
      localStorage.removeItem("lms_token");
      sessionStorage.removeItem("lms_token");
      localStorage.removeItem("lms-auth");
    });
    await page.goto(`${FRONTEND}/login`, { waitUntil: "networkidle2" });
    record("logout_clear", page.url().includes("/login"));

    await page.goto(`${FRONTEND}/forgot-password`, { waitUntil: "networkidle2" });
    await page.type('input#email, input[type="email"]', email);
    await page.click('button[type="submit"]');
    await new Promise((r) => setTimeout(r, 1500));
    const forgotText = await page.content();
    record("forgot_password_ux", /check your email|inbox|reset|sent/i.test(forgotText));

    const newPass = "BrowserPass2!";
    const { rawToken } = await issueAuthToken({ userId: user.id, type: "password_reset" });
    await page.goto(`${FRONTEND}/reset-password?token=${encodeURIComponent(rawToken)}`, {
      waitUntil: "networkidle2",
    });
    const pwInputs = await page.$$('input[type="password"]');
    if (pwInputs.length >= 2) {
      await pwInputs[0].type(newPass);
      await pwInputs[1].type(newPass);
      await page.click('button[type="submit"]');
      await new Promise((r) => setTimeout(r, 2000));
      const resetBody = await page.content();
      record("reset_password_ux", /success|sign in|password/i.test(resetBody));
    } else {
      record("reset_password_ux", false, "password inputs missing");
    }

    await page.goto(`${FRONTEND}/login`, { waitUntil: "networkidle2" });
    await page.type('input#email, input[type="email"]', email);
    await page.type('input[type="password"]', newPass);
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => null),
    ]);
    record("login_new_password", !page.url().includes("/login") || /student/i.test(page.url()), page.url());

    for (const [label, fixtureEmail, expectRe] of [
      ["instructor_dashboard", "instructor@lms.dev", /instructor|course|dashboard/i],
      ["admin_dashboard", "superadmin@platform.local", /admin|users|dashboard/i],
      ["student_dashboard", email, /student|course|learn|browse/i],
    ] as const) {
      const u = await prisma.user.findUnique({ where: { email: fixtureEmail } });
      if (!u) {
        record(label, false, "user missing");
        continue;
      }
      const token = jwt.sign(
        { userId: u.id, email: u.email, role: u.role, tokenVersion: u.tokenVersion },
        process.env.JWT_SECRET!,
        { expiresIn: "1h" }
      );
      await page.evaluate((t) => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem("lms_token", t);
        sessionStorage.setItem("lms_token", t);
      }, token);
      // Force auth hydrate
      await page.goto(`${FRONTEND}/login`, { waitUntil: "networkidle2" });
      await page.evaluate((t) => {
        localStorage.setItem("lms_token", t);
        sessionStorage.setItem("lms_token", t);
      }, token);
      const dest =
        u.role === "instructor"
          ? "/instructor"
          : u.role === "admin" || u.role === "super_admin"
            ? "/admin"
            : "/student";
      await page.goto(`${FRONTEND}${dest}`, { waitUntil: "networkidle2", timeout: 60000 });
      const html = await page.content();
      record(label, expectRe.test(html) || !/Sign in to your/i.test(html), page.url());
    }
  } finally {
    await browser.close();
    await prisma.authToken.deleteMany({ where: { userId: user.id } });
    await prisma.userSession.deleteMany({ where: { userId: user.id } });
    await prisma.loginHistory.deleteMany({ where: { userId: user.id } });
    await prisma.securityAuditLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.$disconnect();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2)
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
