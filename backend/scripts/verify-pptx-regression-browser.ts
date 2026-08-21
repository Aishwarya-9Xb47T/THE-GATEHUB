import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { buildConvolutionDeckPptx } from "../src/services/classroomStudio/convolutionDeckFixture.js";

const API = process.env.API_URL || "http://localhost:5000";
const APP = process.env.CLIENT_URL || "http://localhost:5173";
const email = process.env.SEED_INSTRUCTOR_EMAIL || "";
const password = process.env.SEED_INSTRUCTOR_PASSWORD || "";
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../tmp/google-slides-embed-verification/pptx-regression.png");

async function main() {
  const login = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const auth = await login.json();
  if (!auth.token) throw new Error("login failed");
  const pptx = await buildConvolutionDeckPptx();
  const form = new FormData();
  form.append("file", new Blob([pptx], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }), "conv.pptx");
  form.append("title", "PPTX regression");
  form.append("sourceType", "powerpoint");
  const imported = await fetch(`${API}/api/classroom-studio/import`, {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.token}`, "X-No-Compression": "1" },
    body: form,
  });
  const text = await imported.text();
  const last = JSON.parse(text.trim().split("\n").filter(Boolean).at(-1) || "{}");
  const id = last.presentationId || last.presentation?.id;
  if (!id) throw new Error(`no pptx id ${text.slice(0, 300)}`);
  const pres = await (await fetch(`${API}/api/classroom-studio/presentations/${id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  })).json();
  const visual = pres.slides?.[0]?.content?.visual || {};
  if (pres.sourceType !== "powerpoint") throw new Error(`sourceType ${pres.sourceType}`);
  if (visual.visualSource !== "original_pptx") throw new Error(`visual ${JSON.stringify(visual)}`);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu", "--window-size=1440,900"] });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60_000);
    await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
    await page.type("#email", email);
    await page.type("#password", password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => undefined),
      page.click("button[type=submit]"),
    ]);
    await page.goto(`${APP}/instructor/interactive-classroom/presentations/${id}/editor`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid=classroom-original-pptx]", { timeout: 60_000 });
    if (await page.$("[data-testid=classroom-google-embed]")) {
      throw new Error("PPTX editor showed google embed");
    }
    await page.screenshot({ path: out });
    console.info("PPTX_REGRESSION_PASS", id, "visualSource=original_pptx", "status=" + pres.status);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
