#!/usr/bin/env node
/**
 * Optional Native Node pdflatex bootstrap.
 * Docker (Debian texlive in backend/Dockerfile) is the primary production path.
 * This script must not fail `npm run build` if TinyTeX cannot be installed.
 *
 * Official sources (not hardcoded versions):
 *   https://tinytex.yihui.org/install-bin-unix.sh
 *   https://api.github.com/repos/rstudio/tinytex-releases/releases/latest
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEST = path.resolve(process.cwd(), ".tinytex");
const OFFICIAL_INSTALLER = "https://tinytex.yihui.org/install-bin-unix.sh";
const GITHUB_LATEST_API =
  "https://api.github.com/repos/rstudio/tinytex-releases/releases/latest";

function log(msg) {
  console.log(`[latex] ${msg}`);
}

function warn(msg) {
  console.error(`[latex] ${msg}`);
}

function which(bin) {
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const out = spawnSync(cmd, [bin], { encoding: "utf8" });
    if (out.status !== 0) return null;
    const resolved = String(out.stdout || "")
      .trim()
      .split(/\r?\n/)
      .find(Boolean);
    return resolved && fs.existsSync(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function findLocalPdflatex() {
  const names = process.platform === "win32" ? ["pdflatex.exe"] : ["pdflatex"];
  const roots = [
    DEST,
    path.join(process.cwd(), ".TinyTeX"),
    path.join(os.homedir(), ".TinyTeX"),
    path.join(os.homedir(), ".tinytex"),
    "/usr/bin",
    "/usr/local/bin",
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const stack = [root];
    let steps = 0;
    while (stack.length && steps < 80) {
      const dir = stack.pop();
      steps += 1;
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isFile() && names.includes(ent.name)) return full;
        if (
          ent.isDirectory() &&
          /^(bin|TinyTeX|\.TinyTeX|x86_64-linux|aarch64-linux|universal-darwin)$/i.test(ent.name)
        ) {
          stack.push(full);
        }
      }
    }
  }
  return null;
}

function verifyPdflatex(bin) {
  const result = spawnSync(bin, ["--version"], { encoding: "utf8" });
  if (result.status !== 0) return false;
  const firstLine = String(result.stdout || result.stderr || "")
    .trim()
    .split(/\r?\n/)
    .find(Boolean);
  if (firstLine) log(firstLine);
  return true;
}

function persistCompiler(pdflatex) {
  const binDir = path.dirname(pdflatex);
  try {
    fs.chmodSync(pdflatex, 0o755);
  } catch {
    /* ignore */
  }
  fs.mkdirSync(DEST, { recursive: true });
  fs.writeFileSync(path.join(DEST, "pdflatex.path"), pdflatex, "utf8");
  fs.writeFileSync(path.join(DEST, "bin.path"), binDir, "utf8");
  process.env.LATEX_PDFLATEX_PATH = pdflatex;
  const current = process.env.PATH || "";
  if (!current.split(path.delimiter).includes(binDir)) {
    process.env.PATH = `${binDir}${path.delimiter}${current}`;
  }
  log(`pdflatex ready: ${pdflatex}`);
}

function failSoft(reason) {
  warn(`TinyTeX fallback did not install pdflatex: ${reason}`);
  warn("Native Node cannot compile LaTeX until Docker is used.");
  warn("Production path: Render Runtime=Docker, Dockerfile=./backend/Dockerfile, context=.");
  process.exit(0);
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited with ${result.status}`);
  }
}

function download(url, dest) {
  run("curl", ["-fsSL", "--retry", "3", "--retry-delay", "2", "-o", dest, url]);
}

async function fetchLatestLinuxAsset() {
  const res = await fetch(GITHUB_LATEST_API, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "THE-GATEHUB-latex-bootstrap",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub latest release API HTTP ${res.status}`);
  }
  const body = await res.json();
  const assets = Array.isArray(body.assets) ? body.assets : [];
  const arch = os.arch();
  const hasXz = Boolean(which("xz"));
  const platformPatterns =
    arch === "arm64"
      ? [/^TinyTeX-1-linux-arm64.*\.tar\.xz$/i, /^TinyTeX-1-tar.*\.gz$/i]
      : [/^TinyTeX-1-linux-x86_64.*\.tar\.xz$/i, /^TinyTeX-1-tar.*\.gz$/i];
  const ordered = hasXz ? platformPatterns : [/^TinyTeX-1-tar.*\.gz$/i, ...platformPatterns];
  for (const pattern of ordered) {
    const match = assets.find((asset) => pattern.test(asset.name) && asset.browser_download_url);
    if (match) {
      log(`using GitHub ${body.tag_name} asset ${match.name}`);
      return match.browser_download_url;
    }
  }
  throw new Error(`no TinyTeX-1 Linux asset in ${body.tag_name || "latest"}`);
}

function installWithOfficialScript() {
  const script = path.join(os.tmpdir(), `tinytex-install-${process.pid}.sh`);
  download(OFFICIAL_INSTALLER, script);
  run("sh", [script, "--no-path"], {
    env: {
      ...process.env,
      TINYTEX_DIR: process.cwd(),
    },
  });
}

async function installFromGithubLatest() {
  const url = await fetchLatestLinuxAsset();
  const filename = url.split("/").pop() || "";
  const destFile = path.join(
    os.tmpdir(),
    filename.includes(".tar.xz") ? `TinyTeX-${process.pid}.tar.xz` : `TinyTeX-${process.pid}.tar.gz`
  );
  download(url, destFile);
  run("tar", ["xf", destFile, "-C", process.cwd()]);
  try {
    fs.unlinkSync(destFile);
  } catch {
    /* ignore */
  }
}

const existing = process.env.LATEX_PDFLATEX_PATH || which("pdflatex") || findLocalPdflatex();
if (process.env.SKIP_TINYTEX === "1") {
  log(existing ? `skip install (SKIP_TINYTEX=1); found ${existing}` : "skip install (SKIP_TINYTEX=1)");
  process.exit(0);
}
if (process.platform === "win32") {
  log(existing ? `using ${existing}` : "Windows: skip TinyTeX (use MiKTeX if compiling locally)");
  process.exit(0);
}
if (existing && verifyPdflatex(existing)) {
  persistCompiler(existing);
  process.exit(0);
}

log("pdflatex missing; trying official TinyTeX installer (optional Native Node fallback)");

try {
  try {
    installWithOfficialScript();
  } catch (err) {
    log(`official installer failed: ${err instanceof Error ? err.message : err}`);
    log("trying GitHub latest TinyTeX-1 Linux asset");
    await installFromGithubLatest();
  }

  const pdflatex = findLocalPdflatex();
  if (!pdflatex) {
    failSoft("archive/installer finished but pdflatex was not found");
  }
  if (!verifyPdflatex(pdflatex)) {
    failSoft(`${pdflatex} --version failed`);
  }
  persistCompiler(pdflatex);
  process.exit(0);
} catch (err) {
  failSoft(err instanceof Error ? err.message : String(err));
}
