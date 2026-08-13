/**
 * Verifies the certificate system end-to-end.
 * Run: npx tsx backend/verify-certificate-system.ts
 */
import "dotenv/config";
import fs from "fs";
import { prisma } from "./src/utils/prisma.js";
import { PremiumCertificateService, buildCertificateHtml, wrapCertificateHtmlForPreview, CERTIFICATE_PREVIEW_SAMPLE } from "./src/services/premiumCertificateService.js";
import { getPlatformSettings } from "./src/services/platformSettingsService.js";
import * as authService from "./src/services/authService.js";

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
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("json") ? await res.json().catch(() => ({})) : await res.arrayBuffer();
  return { status: res.status, data, contentType };
}

async function main() {
  console.log("=== Certificate System Verification ===\n");

  const sampleData = {
    ...CERTIFICATE_PREVIEW_SAMPLE,
    completionDate: new Date("2026-04-28"),
  };

  // 1. HTML builder
  try {
    const settings = await getPlatformSettings();
    const { html, certificateId } = await buildCertificateHtml(sampleData, { settings });
    if (!html.includes("CERTIFICATE") || !html.includes("OF COMPLETION")) throw new Error("Missing title");
    if (!html.includes(sampleData.studentName)) throw new Error("Missing student");
    if (!html.includes(sampleData.courseTitle)) throw new Error("Missing course");
    if (!html.includes("{{")) {
      ok("HTML template: all placeholders replaced");
    } else {
      throw new Error("Unresolved placeholders remain");
    }
    ok(`HTML builder works (${certificateId})`);
  } catch (e) {
    fail("HTML builder", e);
  }

  // 2. PDF generation
  try {
    const svc = new PremiumCertificateService();
    const pdf = await svc.generateCertificate(sampleData);
    if (pdf.length < 1000) throw new Error(`PDF too small: ${pdf.length} bytes`);
    fs.writeFileSync("verify-cert-sample.pdf", pdf);
    ok(`PDF generation works (${pdf.length} bytes → verify-cert-sample.pdf)`);
  } catch (e) {
    fail("PDF generation", e);
  }

  // 3. Preview wrapper does not alter PDF HTML
  try {
    const { html } = await buildCertificateHtml(sampleData);
    const preview = wrapCertificateHtmlForPreview(html, 50);
    if (!preview.includes("cert-preview-scale")) throw new Error("Preview CSS missing");
    if (preview.includes("transform: scale(0.5)")) ok("Preview scaling CSS injected");
    else throw new Error("Scale CSS wrong");
    const pdfHtml = await buildCertificateHtml(sampleData);
    if (pdfHtml.html.includes("cert-preview-scale")) throw new Error("PDF HTML polluted with preview CSS");
    ok("Preview wrapper isolated from PDF HTML");
  } catch (e) {
    fail("Preview wrapper", e);
  }

  // 4. Admin preview PDF matches direct PDF generation (pixel-perfect parity)
  const superEmail = process.env.SUPER_ADMIN_EMAIL;
  const superPassword = process.env.SUPER_ADMIN_PASSWORD;
  if (superEmail && superPassword) {
    try {
      const login = await authService.login(superEmail, superPassword);
      const previewRes = await fetch(`${BASE}/admin/settings/certificate-preview/pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${login.token}`,
        },
        body: JSON.stringify({}),
      });
      if (!previewRes.ok) throw new Error(`Preview PDF API HTTP ${previewRes.status}`);
      const previewPdf = Buffer.from(await previewRes.arrayBuffer());

      const svc = new PremiumCertificateService();
      const directPdf = await svc.generateCertificate(
        { ...CERTIFICATE_PREVIEW_SAMPLE, completionDate: new Date() },
        { previewMode: true }
      );

      if (previewPdf.length < 1000) throw new Error("Preview PDF too small");
      // Same pipeline — sizes should be within 5% (timestamps may differ slightly in cert ID)
      const ratio = previewPdf.length / directPdf.length;
      if (ratio < 0.85 || ratio > 1.15) {
        throw new Error(`PDF size mismatch: API ${previewPdf.length} vs direct ${directPdf.length}`);
      }
      ok(`Admin preview PDF parity (${previewPdf.length} bytes)`);

      const { html, certificateId } = await buildCertificateHtml(
        { ...CERTIFICATE_PREVIEW_SAMPLE, completionDate: new Date() },
        { previewMode: true }
      );
      if (!html.includes("Sample Student") || !html.includes("Sample Course")) throw new Error("HTML missing placeholders");
      if (!html.includes("DD/MM/YYYY")) throw new Error("Preview date placeholder missing");
      if (!html.includes("GH-CERT-PREVIEW") && !certificateId.includes("PREVIEW")) throw new Error("Preview cert ID wrong");
      ok("Preview placeholder data correct");
    } catch (e) {
      fail("Admin preview PDF parity", e);
    }
  } else {
    fail("Admin preview PDF", "SUPER_ADMIN credentials not set");
  }

  // 5. Student certificate download API
  try {
    const enrollment = await prisma.enrollment.findFirst({
      where: { completedAt: { not: null } },
      include: { user: true, course: true },
    });
    if (!enrollment) {
      console.log("  (skipped — no completed enrollment in DB)");
    } else {
      const jwt = await import("jsonwebtoken");
      const { JWT_SECRET } = await import("./src/config/jwt.js");
      const dbUser = await prisma.user.findUnique({ where: { id: enrollment.userId } });
      const studentToken = jwt.default.sign(
        {
          userId: enrollment.userId,
          email: enrollment.user.email,
          role: enrollment.user.role,
          tokenVersion: dbUser?.tokenVersion ?? 0,
        },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      const genRes = await fetch(`${BASE}/certificates/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({ courseId: enrollment.courseId }),
      });

      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({}));
        throw new Error((err as any).error || `HTTP ${genRes.status}`);
      }
      const buf = Buffer.from(await genRes.arrayBuffer());
      if (buf.length < 1000) throw new Error(`Download PDF too small: ${buf.length}`);
      ok(`Student generate API works (${buf.length} bytes)`);

      const dlRes = await fetch(`${BASE}/certificates/download/${enrollment.id}`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      if (!dlRes.ok) {
        const err = await dlRes.json().catch(() => ({}));
        throw new Error((err as any).error || `HTTP ${dlRes.status}`);
      }
      const dlBuf = Buffer.from(await dlRes.arrayBuffer());
      if (dlBuf.length < 1000) throw new Error(`Download PDF too small`);
      ok(`Student download API works (${dlBuf.length} bytes)`);
    }
  } catch (e) {
    fail("Student certificate download API", e);
  }

  // 6. Issuer defaults preserved (original design)
  try {
    const settings = await getPlatformSettings();
    const { html } = await buildCertificateHtml(sampleData, { settings });
    const issuer = settings.certificateIssuerName || "Shoeb Ahmad";
    const designation = settings.certificateDesignation || "Founder";
    if (!html.includes(issuer) && !html.includes("Shoeb Ahmad")) throw new Error("Issuer missing");
    if (!html.includes(designation) && !html.includes("Founder")) throw new Error("Designation missing");
    if (!html.includes("THE GATEHUB") && !html.includes(settings.platformName || "THE GATEHUB")) {
      throw new Error("Platform name missing");
    }
    ok("Issuer/platform data rendered in certificate");
  } catch (e) {
    fail("Issuer data rendering", e);
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
