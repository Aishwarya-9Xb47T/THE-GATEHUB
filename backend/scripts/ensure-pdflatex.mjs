#!/usr/bin/env node
/**
 * Ensure pdflatex exists on Linux production hosts (Render Native Node).
 * Skips Windows/local when SKIP_TINYTEX=1 or pdflatex is already on PATH.
 * Never logs secrets. Does not run inside the Docker build stage (SKIP_TINYTEX=1).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEST = path.resolve(process.cwd(), ".tinytex");
const TARBALL_URL =
  "https://github.com/rstudio/tinytex-releases/releases/download/daily/TinyTeX-1.tar.gz";

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

function log(msg) {
  console.log(`[latex] ${msg}`);
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited with ${result.status}`);
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
if (existing) {
  log(`pdflatex already available: ${existing}`);
  process.exit(0);
}

log(`pdflatex missing; installing TinyTeX into ${DEST}`);
fs.mkdirSync(DEST, { recursive: true });
const tarball = path.join(os.tmpdir(), `TinyTeX-${process.pid}.tar.gz`);
run("curl", ["-fsSL", "-o", tarball, TARBALL_URL]);
run("tar", ["-xzf", tarball, "-C", DEST, "--strip-components=1"]);
try {
  fs.unlinkSync(tarball);
} catch {
  /* ignore */
}

const pdflatex = findLocalPdflatex();
if (!pdflatex) {
  console.error("[latex] TinyTeX extracted but pdflatex was not found");
  process.exit(1);
}

const binDir = path.dirname(pdflatex);
try {
  fs.chmodSync(pdflatex, 0o755);
} catch {
  /* ignore */
}
fs.writeFileSync(path.join(DEST, "pdflatex.path"), pdflatex, "utf8");

const tlmgr = path.join(binDir, "tlmgr");
const extraPackages = [
  "latex-bin",
  "amsmath",
  "amsfonts",
  "amssymb",
  "graphics",
  "graphicx",
  "hyperref",
  "listings",
  "xcolor",
  "tcolorbox",
  "pgf",
  "environ",
  "trimspaces",
  "enumitem",
  "grffile",
  "etoolbox",
  "tools",
];
if (fs.existsSync(tlmgr)) {
  try {
    run(tlmgr, ["update", "--self"]);
  } catch (err) {
    log(`tlmgr update skipped: ${err instanceof Error ? err.message : err}`);
  }
  try {
    run(tlmgr, ["install", ...extraPackages]);
  } catch (err) {
    log(`tlmgr extra packages skipped: ${err instanceof Error ? err.message : err}`);
  }
}

log(`pdflatex ready: ${pdflatex}`);
process.exit(0);
