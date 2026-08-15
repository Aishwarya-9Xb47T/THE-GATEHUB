import puppeteer from "puppeteer-core";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import { getPlatformSettings } from "./platformSettingsService.js";

export interface CertificateData {
  studentName: string;
  studentEmail?: string;
  courseTitle: string;
  courseDescription?: string;
  instructorName: string;
  completionDate: Date;
  certificateId: string;
  verificationUrl?: string;
}

type PlatformSettings = Awaited<ReturnType<typeof getPlatformSettings>>;

async function imageToDataUri(urlOrPath: string | null | undefined): Promise<string | null> {
  if (!urlOrPath) return null;
  try {
    if (urlOrPath.startsWith("data:")) return urlOrPath;
    if (urlOrPath.includes("/uploads/")) {
      const rel = urlOrPath.split("/uploads/")[1]?.split("?")[0];
      if (rel) {
        const localPath = path.join(process.cwd(), "uploads", rel);
        try {
          const buf = await fs.readFile(localPath);
          const ext = path.extname(rel).slice(1) || "png";
          return `data:image/${ext};base64,${buf.toString("base64")}`;
        } catch {
          const { readSmallStoredFile } = await import("../middlewares/persistUpload.js");
          const buf = await readSmallStoredFile(`/uploads/${rel}`);
          if (buf) {
            const ext = path.extname(rel).slice(1) || "png";
            return `data:image/${ext};base64,${buf.toString("base64")}`;
          }
        }
      }
    }
    if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
      return urlOrPath;
    }
    const buf = await fs.readFile(urlOrPath);
    const ext = path.extname(urlOrPath).slice(1) || "png";
    return `data:image/${ext};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function loadDefaultLogo(): Promise<string | null> {
  const candidates = [
    path.join(process.cwd(), "frontend", "public", "logo.png"),
    path.join(process.cwd(), "..", "frontend", "public", "logo.png"),
    path.join(process.cwd(), "assets", "images", "gatehub-logo.png"),
    path.join(process.cwd(), "backend", "assets", "images", "gatehub-logo.png"),
  ];
  for (const p of candidates) {
    try {
      const buf = await fs.readFile(p);
      return `data:image/png;base64,${buf.toString("base64")}`;
    } catch {
      // try next
    }
  }
  return null;
}

function generateCertificateId(prefix: string): string {
  const clean = (prefix || "GH-CERT").replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
  return `${clean}-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`;
}

/** Fixed placeholder data for admin preview — never real student data */
export const CERTIFICATE_PREVIEW_SAMPLE = {
  studentName: "Sample Student",
  courseTitle: "Sample Course",
  instructorName: "Course Instructor",
} as const;

/** Literal date placeholder shown on admin preview only */
export const CERTIFICATE_PREVIEW_DATE_LABEL = "DD/MM/YYYY";
export const CERTIFICATE_PREVIEW_SEAL_YEAR = "2026";

export type CertificateTemplateSnapshot = {
  platformName: string;
  platformLogo: string | null;
  certificateIssuerName: string;
  certificateDesignation: string;
  certificatePrefix: string;
  certificateSignatureUrl: string | null;
  certificateSealUrl: string | null;
  certificateBackgroundUrl: string | null;
  capturedAt: string;
};

export function captureCertificateTemplateSnapshot(
  settings: PlatformSettings
): CertificateTemplateSnapshot {
  return {
    platformName: settings.platformName || "THE GATEHUB",
    platformLogo: settings.platformLogo ?? null,
    certificateIssuerName: settings.certificateIssuerName || "Authorized Signatory",
    certificateDesignation: settings.certificateDesignation || "Platform Authority",
    certificatePrefix: (settings.certificatePrefix || "GH-CERT").replace(/[^A-Za-z0-9-]/g, "").toUpperCase(),
    certificateSignatureUrl: settings.certificateSignatureUrl ?? null,
    certificateSealUrl: settings.certificateSealUrl ?? null,
    certificateBackgroundUrl: settings.certificateBackgroundUrl ?? null,
    capturedAt: new Date().toISOString(),
  };
}

function settingsFromSnapshot(
  live: PlatformSettings,
  snapshot?: CertificateTemplateSnapshot | null
): PlatformSettings {
  if (!snapshot) return live;
  return {
    ...live,
    platformName: snapshot.platformName || live.platformName,
    platformLogo: snapshot.platformLogo ?? live.platformLogo,
    certificateIssuerName: snapshot.certificateIssuerName || live.certificateIssuerName,
    certificateDesignation: snapshot.certificateDesignation || live.certificateDesignation,
    certificatePrefix: snapshot.certificatePrefix || live.certificatePrefix,
    certificateSignatureUrl: snapshot.certificateSignatureUrl ?? live.certificateSignatureUrl,
    certificateSealUrl: snapshot.certificateSealUrl ?? live.certificateSealUrl,
    certificateBackgroundUrl: snapshot.certificateBackgroundUrl ?? live.certificateBackgroundUrl,
  };
}

export function formatCertificateDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export type BuildCertificateOptions = {
  certificateId?: string;
  settings?: PlatformSettings;
  /** Use DD/MM/YYYY date and GH-CERT-PREVIEW id for admin preview */
  previewMode?: boolean;
  verificationUrl?: string;
  /** Prefer assets/issuer captured at issue time (historical stability) */
  templateSnapshot?: CertificateTemplateSnapshot | null;
};

const TEMPLATE_STATIC_DESCRIPTION =
  "Demonstrating exceptional proficiency in system architecture, process management, memory optimization, and file systems through rigorous academic evaluation and practical training.";

async function buildQrDataUri(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 200,
    color: { dark: "#0a1d37", light: "#ffffff" },
  });
}

function injectQrCode(html: string, qrDataUri: string): string {
  const qrBlock = `
    <div style="position:absolute;bottom:10mm;right:14mm;z-index:30;text-align:center;">
      <img src="${qrDataUri}" alt="Verification QR" style="width:72px;height:72px;display:block;margin:0 auto;" />
      <p style="font-size:7px;color:#64748b;margin-top:3px;letter-spacing:0.12em;font-weight:700;">SCAN TO VERIFY</p>
    </div>`;
  return html.replace("</body>", `${qrBlock}</body>`);
}

/** Build certificate HTML — used for PDF generation AND admin live preview */
export async function buildCertificateHtml(
  data: Omit<CertificateData, "certificateId">,
  options?: BuildCertificateOptions
): Promise<{ html: string; certificateId: string }> {
  const liveSettings = options?.settings ?? (await getPlatformSettings());
  const settings = settingsFromSnapshot(liveSettings, options?.templateSnapshot);
  const prefix = (settings.certificatePrefix || "GH-CERT").replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
  const certificateId = options?.certificateId
    ?? (options?.previewMode ? `${prefix}-PREVIEW` : generateCertificateId(prefix));

  const templatePath = path.join(process.cwd(), "src", "templates", "certificateTemplate.html");
  let html = await fs.readFile(templatePath, "utf-8");

  const logoSrc =
    (await imageToDataUri(settings.platformLogo)) ||
    (await loadDefaultLogo()) ||
    "";

  const signatureSrc = await imageToDataUri(settings.certificateSignatureUrl);
  const sealSrc = await imageToDataUri(settings.certificateSealUrl);

  // Background is a subtle paper texture layer only — never a full-bleed image
  const defaultTexture = "https://www.transparenttextures.com/patterns/natural-paper.png";
  const customBg = settings.certificateBackgroundUrl
    ? await imageToDataUri(settings.certificateBackgroundUrl)
    : null;
  const backgroundUrl = customBg || defaultTexture;

  const formattedDate = options?.previewMode
    ? CERTIFICATE_PREVIEW_DATE_LABEL
    : formatCertificateDate(data.completionDate);

  const platformName = settings.platformName || "THE GATEHUB";
  const issuerName = settings.certificateIssuerName || "Authorized Signatory";
  const issuerDesignation = settings.certificateDesignation || "Platform Authority";
  const sealYear = options?.previewMode
    ? CERTIFICATE_PREVIEW_SEAL_YEAR
    : String(data.completionDate.getFullYear());

  if (logoSrc) {
    html = html.replace(/src="file:\/\/\/.*?gatehub-logo\.png"/, `src="${logoSrc}"`);
    html = html.replace(/{{logoUrl}}/g, logoSrc);
  } else {
    html = html.replace(/{{logoUrl}}/g, "");
  }

  const description = options?.previewMode
    ? TEMPLATE_STATIC_DESCRIPTION
    : (data.courseDescription?.trim() || TEMPLATE_STATIC_DESCRIPTION);

  html = html
    .replace(/{{studentName}}/g, escapeHtml(data.studentName))
    .replace(/{{courseName}}/g, escapeHtml(data.courseTitle))
    .replace(/{{instructorName}}/g, escapeHtml(data.instructorName))
    .replace(/{{date}}/g, formattedDate)
    .replace(/{{platformName}}/g, escapeHtml(platformName))
    .replace(/{{issuerName}}/g, escapeHtml(issuerName))
    .replace(/{{issuerDesignation}}/g, escapeHtml(issuerDesignation))
    .replace(/{{certificateId}}/g, escapeHtml(certificateId))
    .replace(/{{sealYear}}/g, sealYear)
    .replace(/{{backgroundUrl}}/g, backgroundUrl)
    .replace(/{{backgroundOpacity}}/g, customBg ? "0.12" : "0.4")
    .replace(/{{signatureBlock}}/g, signatureSrc
      ? `<img src="${signatureSrc}" alt="Signature" style="height:48px;object-fit:contain;margin-bottom:4px;" />`
      : `<p class="text-[#0a1d37] font-bold text-sm tracking-wide">${escapeHtml(issuerName)}</p>`)
    .replace(/{{sealBlock}}/g, sealSrc
      ? `<img src="${sealSrc}" alt="Seal" style="width:96px;height:96px;object-fit:contain;" />`
      : `<div class="w-24 h-24 gold-bg rounded-full border-4 border-white shadow-lg flex items-center justify-center relative z-20">
          <div class="w-20 h-20 border-2 border-dashed border-white/50 rounded-full flex flex-col items-center justify-center text-center p-2">
            <span class="text-[8px] font-bold text-[#4c3b10] uppercase leading-tight">Completion<br>Achieved</span>
            <div class="w-full h-[1px] bg-[#4c3b10]/30 my-1"></div>
            <span class="text-[10px] font-bold text-[#4c3b10]">${sealYear}</span>
          </div>
        </div>`);

  html = html.replace(TEMPLATE_STATIC_DESCRIPTION, escapeHtml(description));

  if (!options?.previewMode && options?.verificationUrl) {
    const qrDataUri = await buildQrDataUri(options.verificationUrl);
    html = injectQrCode(html, qrDataUri);
  }

  return { html, certificateId };
}

function escapeHtml(text: string): string {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Wrap certificate HTML for admin iframe preview — does NOT affect PDF output */
export function wrapCertificateHtmlForPreview(html: string, zoomPercent = 50): string {
  const scale = Math.max(25, Math.min(100, zoomPercent)) / 100;
  const previewCss = `
    <style id="cert-preview-scale">
      html, body { margin: 0; padding: 0; overflow: hidden; background: #e5e7eb; min-height: auto !important; }
      body { display: flex; justify-content: center; align-items: flex-start; padding: 12px; min-height: auto !important; }
      .certificate-container {
        transform: scale(${scale});
        transform-origin: top center;
        flex-shrink: 0;
        margin-bottom: ${210 * (1 - scale)}mm;
      }
    </style>`;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${previewCss}</head>`);
  }
  return `${previewCss}${html}`;
}

function resolveChromePath(): string {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined,
    process.platform === "win32" ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" : undefined,
    process.platform === "win32" ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" : undefined,
    process.platform === "win32" ? "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe" : undefined,
    process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined,
    process.platform === "linux" ? "/usr/bin/google-chrome" : undefined,
    process.platform === "linux" ? "/usr/bin/chromium-browser" : undefined,
  ].filter((p): p is string => !!p);

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  throw new Error(
    "Chrome/Chromium not found. Install Google Chrome or set CHROME_PATH in backend/.env"
  );
}

export class PremiumCertificateService {
  async generateCertificate(
    data: Omit<CertificateData, "certificateId">,
    options?: BuildCertificateOptions
  ): Promise<Buffer> {
    const { html, certificateId } = await buildCertificateHtml(data, options);
    console.log("Generating certificate PDF:", certificateId);

    const launchOpts: Parameters<typeof puppeteer.launch>[0] = {
      headless: true,
      executablePath: resolveChromePath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    };

    const browser = await puppeteer.launch(launchOpts);
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
      await page.evaluate(() => document.fonts.ready);
      await new Promise((r) => setTimeout(r, 500));
      const pdfUint8Array = await page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
      });
      return Buffer.from(pdfUint8Array);
    } finally {
      await browser.close();
    }
  }
}
