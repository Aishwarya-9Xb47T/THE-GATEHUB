/**
 * Verifies the admin system end-to-end.
 * Run: npx tsx backend/verify-admin-system.ts
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "./src/utils/prisma.js";
import { ensureSuperAdminExists } from "./src/services/superAdminBootstrap.js";
import { getPlatformSettings } from "./src/services/platformSettingsService.js";
import * as authService from "./src/services/authService.js";
import { isAdminRole, ROLES } from "./src/utils/roles.js";

import { JWT_SECRET } from "./src/config/jwt.js";
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
  console.log("=== Admin System Verification ===\n");

  const testSuffix = Date.now();
  const studentEmail = `verify-student-${testSuffix}@test.local`;
  const instructorEmail = `verify-instructor-${testSuffix}@test.local`;
  const testPassword = "TestPass123!";

  // Bootstrap
  try {
    await ensureSuperAdminExists();
    await getPlatformSettings();
    ok("Super admin bootstrap & platform settings init");
  } catch (e) {
    fail("Super admin bootstrap", e);
  }

  // Student registration
  try {
    const result = await authService.register({
      email: studentEmail,
      password: testPassword,
      firstName: "Verify",
      lastName: "Student",
      role: "student",
    });
    if (result.user.role !== "student") throw new Error("Wrong role");
    ok("Student registration works");
  } catch (e) {
    fail("Student registration", e);
  }

  // Instructor registration
  try {
    const result = await authService.register({
      email: instructorEmail,
      password: testPassword,
      firstName: "Verify",
      lastName: "Instructor",
      role: "instructor",
    });
    if (result.user.role !== "instructor") throw new Error("Wrong role");
    ok("Instructor registration works");
  } catch (e) {
    fail("Instructor registration", e);
  }

  // Block admin registration (production only; allowed in dev)
  try {
    await authService.register({
      email: `verify-admin-${testSuffix}@test.local`,
      password: testPassword,
      firstName: "Bad",
      lastName: "Admin",
      role: "admin" as any,
    });
    if (process.env.NODE_ENV === "production") {
      fail("Admin registration blocked (should have failed)");
    } else {
      ok("Admin registration allowed in dev (expected)");
      await prisma.user.deleteMany({ where: { email: `verify-admin-${testSuffix}@test.local` } });
    }
  } catch (e: any) {
    if (e.statusCode === 403) ok("Admin registration blocked");
    else fail("Admin registration blocked", e);
  }

  // Super admin login
  const superEmail = process.env.SUPER_ADMIN_EMAIL;
  const superPassword = process.env.SUPER_ADMIN_PASSWORD;
  let superToken = "";
  if (superEmail && superPassword) {
    try {
      const login = await authService.login(superEmail, superPassword);
      if (!isAdminRole(login.user.role)) throw new Error("Not admin role");
      superToken = login.token;
      ok("Super admin login works");
    } catch (e) {
      fail("Super admin login", e);
    }
  } else {
    fail("Super admin login", "SUPER_ADMIN_EMAIL/PASSWORD not set");
  }

  // Create test admin via super admin API
  const adminEmail = `verify-admin-api-${testSuffix}@test.local`;
  let adminToken = "";
  if (superToken) {
    try {
      const createRes = await api("/admin/admins", {
        method: "POST",
        token: superToken,
        body: { email: adminEmail, password: testPassword, firstName: "Test", lastName: "Admin" },
      });
      if (!createRes.data.success) throw new Error(JSON.stringify(createRes.data));
      const login = await authService.login(adminEmail, testPassword);
      adminToken = login.token;
      ok("Admin creation & login works");
    } catch (e) {
      fail("Admin creation & login", e);
    }
  }

  // Dashboard loads
  if (adminToken) {
    try {
      const dash = await api("/admin/dashboard", { token: adminToken });
      if (!dash.data.success || !dash.data.stats) throw new Error("No stats");
      ok("Admin dashboard API loads");
    } catch (e) {
      fail("Admin dashboard API", e);
    }
  }

  // Super admin dashboard & audit logs
  if (superToken) {
    try {
      const dash = await api("/admin/dashboard", { token: superToken });
      if (!dash.data.success) throw new Error("Dashboard failed");
      ok("Super admin dashboard loads");

      const logs = await api("/admin/audit-logs", { token: superToken });
      if (!logs.data.success) throw new Error("Audit logs failed");
      ok("Audit logs work");

      const settings = await api("/admin/settings", { token: superToken });
      if (!settings.data.success) throw new Error("Settings read failed");
      ok("Platform settings read works");

      const patch = await api("/admin/settings", {
        method: "PATCH",
        token: superToken,
        body: { platformName: "THE GATEHUB" },
      });
      if (!patch.data.success) throw new Error("Settings write failed");
      ok("Platform settings write works (super admin)");
    } catch (e) {
      fail("Super admin features", e);
    }
  }

  // User management
  if (adminToken) {
    try {
      const users = await api("/admin/users", { token: adminToken });
      if (!users.data.success) throw new Error("List users failed");

      const student = await prisma.user.findUnique({ where: { email: studentEmail } });
      if (!student) throw new Error("Student not found");

      const suspend = await api(`/admin/users/${student.id}`, {
        method: "PATCH",
        token: adminToken,
        body: { suspended: true },
      });
      if (!suspend.data.success) throw new Error("Suspend failed");

      const unsuspend = await api(`/admin/users/${student.id}`, {
        method: "PATCH",
        token: adminToken,
        body: { suspended: false },
      });
      if (!unsuspend.data.success) throw new Error("Unsuspend failed");
      ok("User suspend/unsuspend works");
    } catch (e) {
      fail("User management", e);
    }
  }

  // Security: student cannot access admin routes
  try {
    const student = await prisma.user.findUnique({ where: { email: studentEmail } });
    if (!student) throw new Error("No student");
    const token = jwt.sign({ userId: student.id, email: student.email, role: student.role }, JWT_SECRET, { expiresIn: "1h" });
    const res = await api("/admin/dashboard", { token });
    if (res.status === 403 || res.status === 401) ok("Student blocked from admin routes");
    else fail("Student blocked from admin routes", `Got status ${res.status}`);
  } catch (e) {
    fail("Student security check", e);
  }

  // Security: admin cannot access super admin routes
  if (adminToken) {
    try {
      const res = await api("/admin/admins", { token: adminToken });
      if (res.status === 403) ok("Admin blocked from super admin routes");
      else fail("Admin blocked from super admin routes", `Got status ${res.status}`);
    } catch (e) {
      fail("Admin security check", e);
    }
  }

  // Security: instructor cannot access admin routes
  try {
    const instructor = await prisma.user.findUnique({ where: { email: instructorEmail } });
    if (!instructor) throw new Error("No instructor");
    const token = jwt.sign({ userId: instructor.id, email: instructor.email, role: instructor.role }, JWT_SECRET, { expiresIn: "1h" });
    const res = await api("/admin/users", { token });
    if (res.status === 403 || res.status === 401) ok("Instructor blocked from admin routes");
    else fail("Instructor blocked from admin routes", `Got status ${res.status}`);
  } catch (e) {
    fail("Instructor security check", e);
  }

  // Role permissions: admin role check helper
  try {
    if (!isAdminRole("admin") || !isAdminRole("super_admin") || isAdminRole("student")) {
      throw new Error("isAdminRole logic wrong");
    }
    ok("Role permissions helper works");
  } catch (e) {
    fail("Role permissions", e);
  }

  // Dashboard counts match database
  if (adminToken) {
    try {
      const dash = await api("/admin/dashboard", { token: adminToken });
      const stats = dash.data.stats;
      const [userCount, courseCount, paymentCount] = await Promise.all([
        prisma.user.count({ where: { deletedAt: null } }),
        prisma.course.count(),
        prisma.payment.count({ where: { status: "completed" } }),
      ]);
      if (stats.userCount !== userCount) throw new Error(`userCount mismatch: ${stats.userCount} vs ${userCount}`);
      if (stats.courseCount !== courseCount) throw new Error(`courseCount mismatch`);
      if (stats.totalPayments !== paymentCount) throw new Error(`paymentCount mismatch`);
      ok("Dashboard counts match database");
    } catch (e) {
      fail("Dashboard counts verification", e);
    }
  }

  // Revenue totals match database
  if (adminToken) {
    try {
      const [dash, payments] = await Promise.all([
        api("/admin/dashboard", { token: adminToken }),
        api("/payments/admin/summary", { token: adminToken }),
      ]);
      const dbRevenue = await prisma.payment.aggregate({
        where: { status: "completed" },
        _sum: { amount: true, platformFee: true, instructorEarning: true },
      });
      const dashRev = dash.data.stats.totalRevenue;
      const payRev = payments.data.summary.totalRevenue;
      const dbAmount = dbRevenue._sum.amount ?? 0;
      if (Math.abs(dashRev - dbAmount) > 0.01) throw new Error(`Dashboard revenue ${dashRev} vs DB ${dbAmount}`);
      if (Math.abs(payRev - dbAmount) > 0.01) throw new Error(`Payments revenue ${payRev} vs DB ${dbAmount}`);
      ok("Revenue totals match database");
    } catch (e) {
      fail("Revenue verification", e);
    }
  }

  // Analytics endpoint
  if (adminToken) {
    try {
      const analytics = await api("/admin/analytics", { token: adminToken });
      if (!analytics.data.success || !analytics.data.dailyUsers) throw new Error("Analytics incomplete");
      ok("Analytics API loads with real data");
    } catch (e) {
      fail("Analytics API", e);
    }
  }

  // Reports endpoint
  if (adminToken) {
    try {
      const reports = await api("/admin/reports", { token: adminToken });
      if (!reports.data.success || !reports.data.report) throw new Error("Reports failed");
      ok("Reports API loads");
    } catch (e) {
      fail("Reports API", e);
    }
  }

  // Admin can update platform settings (not super-admin only)
  if (adminToken) {
    try {
      const patch = await api("/admin/settings", {
        method: "PATCH",
        token: adminToken,
        body: { supportPhone: "9999999999" },
      });
      if (!patch.data.success) throw new Error("Admin settings write failed");
      ok("Admin can update platform settings");
    } catch (e) {
      fail("Admin settings write", e);
    }
  }

  // Learning Universes admin endpoint
  if (adminToken) {
    try {
      const lu = await api("/admin/learning-universes", { token: adminToken });
      if (!lu.data.success) throw new Error("LU list failed");
      ok("Learning Universes admin API loads");
    } catch (e) {
      fail("Learning Universes admin API", e);
    }
  }

  // Session tracking, logout-all, certificate preview (invalidates tokens — run last)
  if (adminToken) {
    try {
      const mockReq = { headers: { "user-agent": "VerifyScript/1.0 Chrome" }, ip: "127.0.0.1" };
      const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
      if (!adminUser) throw new Error("Admin user missing");

      const login = await authService.login(adminEmail, testPassword, mockReq);
      const profile = await api("/admin/settings/profile", { token: login.token });
      if (!profile.data.success) throw new Error("Profile fetch failed");
      if (!Array.isArray(profile.data.sessions)) throw new Error("Sessions missing");
      if (!Array.isArray(profile.data.loginHistory)) throw new Error("Login history missing");
      if (profile.data.sessions.length < 1) throw new Error("Expected at least one active session after login");

      const patchProfile = await api("/admin/settings/profile", {
        method: "PATCH",
        token: login.token,
        body: { phone: "1234567890", designation: "Verify Admin" },
      });
      if (!patchProfile.data.success) throw new Error("Profile patch failed");
      ok("Profile save & session tracking work");

      const beforeVersion = adminUser.tokenVersion;
      const logoutAll = await api("/admin/settings/logout-all", { method: "POST", token: login.token });
      if (!logoutAll.data.success || !logoutAll.data.requiresReauth) throw new Error("Logout all failed");
      const afterUser = await prisma.user.findUnique({ where: { email: adminEmail } });
      if (!afterUser || afterUser.tokenVersion <= beforeVersion) throw new Error("tokenVersion not incremented");
      ok("Logout all devices revokes sessions");
    } catch (e) {
      fail("Session & profile verification", e);
    }
  }

  // Certificate preview uses same HTML builder as PDF generation
  if (adminToken) {
    try {
      const freshLogin = await authService.login(adminEmail, testPassword);
      const preview = await api("/admin/settings/certificate-preview", { token: freshLogin.token });
      if (!preview.data.preview?.html) throw new Error("No preview HTML");
      const html: string = preview.data.preview.html;
      if (!html.includes("CERTIFICATE")) throw new Error("Missing certificate title");
      if (!html.includes("OF COMPLETION")) throw new Error("Missing certificate subtitle");
      if (!html.includes("Sample Student")) throw new Error("Missing student placeholder");
      if (!html.includes("Sample Course Title")) throw new Error("Missing course placeholder");

      const { buildCertificateHtml } = await import("./src/services/premiumCertificateService.js");
      const settings = await getPlatformSettings();
      const direct = await buildCertificateHtml(
        {
          studentName: "Sample Student",
          courseTitle: "Sample Course Title",
          instructorName: "Course Instructor",
          completionDate: new Date(),
        },
        { certificateId: preview.data.preview.certificateId, settings }
      );
      if (direct.html.length !== html.length) {
        throw new Error(`Preview HTML length mismatch: API ${html.length} vs direct ${direct.html.length}`);
      }
      ok("Certificate preview parity with generation template");
    } catch (e) {
      fail("Certificate preview parity", e);
    }
  }

  try {
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [studentEmail, instructorEmail, adminEmail],
        },
      },
    });
    console.log("\nCleaned up test users.");
  } catch {
    // non-fatal
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
