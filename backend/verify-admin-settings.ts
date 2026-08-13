/**
 * Verifies admin settings system end-to-end.
 * Run: npx tsx backend/verify-admin-settings.ts
 */
import "dotenv/config";
import { prisma } from "./src/utils/prisma.js";
import { getPlatformSettings, updatePlatformSettings, getSystemHealth } from "./src/services/platformSettingsService.js";
import * as authService from "./src/services/authService.js";
import { JWT_SECRET } from "./src/config/jwt.js";
import jwt from "jsonwebtoken";

const BASE = process.env.API_URL || "http://localhost:5000/api";

let passed = 0;
let failed = 0;

function ok(name: string) {
  passed++;
  console.log(`✓ ${name}`);
}

function fail(name: string, err?: unknown) {
  failed++;
  console.log(`✗ ${name}`, err instanceof Error ? err.message : err ?? "");
}

async function api(path: string, opts: { method?: string; body?: unknown; token?: string } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  console.log("=== Admin Settings Verification ===\n");

  // Platform settings exist
  try {
    const settings = await getPlatformSettings();
    if (!settings.platformName) throw new Error("No platform name");
    ok("Platform settings load from database");
  } catch (e) {
    fail("Platform settings load", e);
  }

  // Settings persistence
  try {
    const before = await getPlatformSettings();
    const testName = before.platformName;
    await updatePlatformSettings({ footerText: "Test footer " + Date.now() }, "verify-script");
    const after = await getPlatformSettings();
    if (!after.footerText?.startsWith("Test footer")) throw new Error("Footer not persisted");
    await updatePlatformSettings({ footerText: before.footerText }, "verify-script");
    ok("Settings persistence works");
  } catch (e) {
    fail("Settings persistence", e);
  }

  // Fee validation
  try {
    await updatePlatformSettings({ platformFeePercentage: 30, instructorSharePercentage: 70 }, "verify-script");
    ok("Valid fee split (30/70) accepted");
    try {
      await updatePlatformSettings({ platformFeePercentage: 30, instructorSharePercentage: 60 }, "verify-script");
      fail("Invalid fee split should reject");
    } catch {
      ok("Invalid fee split (30/60) rejected");
    }
    await updatePlatformSettings({ platformFeePercentage: 20, instructorSharePercentage: 80 }, "verify-script");
  } catch (e) {
    fail("Fee validation", e);
  }

  // System health real data
  try {
    const health = await getSystemHealth();
    if (!health.backend || !health.database) throw new Error("Incomplete health");
    if (typeof health.storage.bytes !== "number") throw new Error("Storage not real");
    ok("System health returns real data");
  } catch (e) {
    fail("System health", e);
  }

  // User profile fields exist
  try {
    const admin = await prisma.user.findFirst({ where: { role: { in: ["admin", "super_admin"] } } });
    if (!admin) throw new Error("No admin user");
    await prisma.user.update({
      where: { id: admin.id },
      data: { phone: "9999999999", designation: "Platform Admin", bio: "Test bio" },
    });
    const updated = await prisma.user.findUnique({ where: { id: admin.id } });
    if (updated?.phone !== "9999999999") throw new Error("Phone not saved");
    await prisma.user.update({ where: { id: admin.id }, data: { phone: null, designation: null, bio: null } });
    ok("Admin profile fields persist in User model");
  } catch (e) {
    fail("Admin profile fields", e);
  }

  // Session & login history models
  try {
    const sessionCount = await prisma.userSession.count();
    const historyCount = await prisma.loginHistory.count();
    ok(`Session model works (${sessionCount} sessions, ${historyCount} login records)`);
  } catch (e) {
    fail("Session/login history models", e);
  }

  const superEmail = process.env.SUPER_ADMIN_EMAIL;
  const superPassword = process.env.SUPER_ADMIN_PASSWORD;
  let superToken = "";
  let adminToken = "";

  if (superEmail && superPassword) {
    try {
      const login = await authService.login(superEmail, superPassword);
      superToken = login.token;
      ok("Super admin login for API tests");
    } catch (e) {
      fail("Super admin login", e);
    }
  }

  const regularAdmin = await prisma.user.findFirst({ where: { role: "admin", deletedAt: null } });
  if (regularAdmin) {
    adminToken = jwt.sign(
      { userId: regularAdmin.id, email: regularAdmin.email, role: regularAdmin.role, tokenVersion: regularAdmin.tokenVersion },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
  }

  // API: settings read (admin)
  if (adminToken) {
    try {
      const res = await api("/admin/settings", { token: adminToken });
      if (!res.data.success || !res.data.settings) throw new Error("Settings API failed");
      if (res.data.settings.smtpPassword === process.env.SMTP_PASS) throw new Error("Secrets leaked to regular admin");
      ok("Admin can read settings (secrets masked)");
    } catch (e) {
      fail("Admin settings read", e);
    }
  }

  // API: regular admin can write platform settings
  if (adminToken) {
    try {
      const res = await api("/admin/settings", { method: "PATCH", token: adminToken, body: { footerText: "Verified by admin" } });
      if (res.status === 200 && res.data.success) ok("Regular admin can write platform settings");
      else fail("Regular admin settings write", `Got status ${res.status}`);
    } catch (e) {
      fail("Admin write permission", e);
    }
  }

  // API: profile endpoints
  if (superToken) {
    try {
      const profile = await api("/admin/settings/profile", { token: superToken });
      if (!profile.data.success || !profile.data.profile) throw new Error("Profile API failed");
      ok("Admin profile API loads");

      const patch = await api("/admin/settings/profile", {
        method: "PATCH",
        token: superToken,
        body: { designation: "Super Administrator" },
      });
      if (!patch.data.success) throw new Error("Profile patch failed");
      ok("Admin profile update works");
    } catch (e) {
      fail("Admin profile API", e);
    }
  }

  // API: health endpoint
  if (superToken) {
    try {
      const health = await api("/admin/settings/health", { token: superToken });
      if (!health.data.success) throw new Error("Health API failed");
      ok("Settings health API works");
    } catch (e) {
      fail("Settings health API", e);
    }
  }

  // API: certificate preview
  if (superToken) {
    try {
      const preview = await api("/admin/settings/certificate-preview", { token: superToken });
      if (!preview.data.success || !preview.data.preview) throw new Error("Cert preview failed");
      ok("Certificate preview API works");
    } catch (e) {
      fail("Certificate preview API", e);
    }
  }

  // Student blocked from admin settings
  try {
    const student = await prisma.user.findFirst({ where: { role: "student" } });
    if (student) {
      const token = jwt.sign({ userId: student.id, email: student.email, role: student.role }, JWT_SECRET, { expiresIn: "1h" });
      const res = await api("/admin/settings", { token });
      if (res.status === 403 || res.status === 401) ok("Student blocked from admin settings");
      else fail("Student blocked", `Status ${res.status}`);
    }
  } catch (e) {
    fail("Student permission check", e);
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
