import puppeteer from "puppeteer";
import { marked } from "marked";
import { getManualMarkdown } from "./docsIndexService.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_CACHE_DIR = path.join(__dirname, "../../uploads/docs-pdf");

const PDF_MANUALS: Record<string, string> = {
  student: "Student_Manual.pdf",
  instructor: "Instructor_Manual.pdf",
  admin: "Admin_Manual.pdf",
};

function ensureCacheDir() {
  if (!fs.existsSync(PDF_CACHE_DIR)) fs.mkdirSync(PDF_CACHE_DIR, { recursive: true });
}

export async function getOrGeneratePdf(manual: string): Promise<{ buffer: Buffer; filename: string } | null> {
  const filename = PDF_MANUALS[manual];
  if (!filename) return null;

  ensureCacheDir();
  const cachePath = path.join(PDF_CACHE_DIR, filename);
  const md = getManualMarkdown(manual);
  if (!md) return null;

  const mdPath = path.join(DOCS_DIR_FOR_STAT(manual));
  const srcStat = fs.existsSync(mdPath) ? fs.statSync(mdPath).mtimeMs : 0;
  if (fs.existsSync(cachePath)) {
    const cacheStat = fs.statSync(cachePath).mtimeMs;
    if (cacheStat >= srcStat) {
      return { buffer: fs.readFileSync(cachePath), filename };
    }
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; line-height: 1.6; color: #111; }
    h1 { border-bottom: 2px solid #f59e0b; padding-bottom: 8px; }
    h2 { margin-top: 2em; color: #333; }
    code, pre { background: #f4f4f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    pre { padding: 12px; overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  </style></head><body>${marked.parse(md)}</body></html>`;

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const buffer = await page.pdf({
      format: "A4",
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
      printBackground: true,
    });
    fs.writeFileSync(cachePath, buffer);
    return { buffer: Buffer.from(buffer), filename };
  } finally {
    await browser.close();
  }
}

function DOCS_DIR_FOR_STAT(manual: string): string {
  const files: Record<string, string> = {
    student: "student-manual.md",
    instructor: "instructor-manual.md",
    admin: "admin-manual.md",
  };
  return path.join(__dirname, "../../content/docs", files[manual] || "");
}
