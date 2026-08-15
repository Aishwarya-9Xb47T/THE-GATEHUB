import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import os from "os";
import { spawn, execFileSync } from "child_process";
import { existsSync } from "fs";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../utils/prisma.js";
import { expandLearningUniverseForPdf } from "./latexPdfRenderer.js";
import {
  buildLearningCommandStubs,
  escapeLearningBlockContent,
  injectIntoPreamble,
  prepareLatexForCompilation,
  sanitizeLearningCommandsForPdf,
  type ParsedLatexError,
} from "./latexLearningCommands.js";
import {
  buildCompileErrorReport,
  parseLatexErrors,
  parseLatexLog,
  type LatexLogParseResult,
} from "./latexLogParser.js";
import { isDslVideoBody, replaceBraceCommands } from "./luProject/luTexAst.js";
import { LU_PROJECT_JSON_PATH } from "./luProject/luProjectSchema.js";
import { hydrateLocalUpload, persistAtPublicRelative } from "../middlewares/persistUpload.js";

export type LatexCompilationError = ParsedLatexError;

export interface LatexCompilationResult {
  success: boolean;
  pdfPath?: string;
  logs: string;
  errors: LatexCompilationError[];
  base64?: string;
  compilationTime: number;
  compilerUsed: 'pdflatex' | 'xelatex' | 'lualatex';
  passesCompleted: number;
  bibtexRun: boolean;
  generatedTex: string;
  compileCommands: string[];
  outputDirectory: string;
  compileReport?: Record<string, unknown>;
  logParse?: LatexLogParseResult;
}

interface CompileOptions {
  workspaceSubdir?: string;
  timeoutMs?: number;
  copyReferencedImages?: boolean;
  maxPasses?: number;
  enableBibtex?: boolean;
  compilerFallback?: boolean;
  projectFiles?: ProjectFile[];
  /** When true, do not replace provided code with on-disk main.tex (LU v2 merged compile). */
  preserveProvidedMainTex?: boolean;
  /** Client-provided workspace files (learner research workspace). */
  inlineWorkspaceFiles?: Array<{ name: string; content: string }>;
  mainFileName?: string;
  /** LU v2 project context with optional in-memory file overlay (matches compile snapshot). */
  pdfProjectContext?: {
    project: import("./luProject/luProjectSchema.js").LuProjectJson;
    files: import("./luProject/luProjectFiles.js").ProjectFileRecord[];
  };
  /** LU v2: "full" merges entire course; reserved for future per-file preview. */
  compileScope?: "full" | "component";
}

interface ProjectFile {
  filename: string;
  content: string;
  type: 'tex' | 'bib' | 'sty' | 'cls' | 'image' | 'other';
}

interface CompilationStep {
  name: string;
  command: string;
  args: string[];
  exitCode: number;
  output: string;
  duration: number;
  fullCommand: string;
}

interface StoredPdf {
  absolutePath: string;
  publicUrl: string;
}

// REMOVED: Docker constants - using local pdflatex only
const DEFAULT_TIMEOUT_MS = Number(process.env.LATEX_COMPILE_TIMEOUT_MS || 120000);
const MAX_PASSES = 3;
const COMPILER_TIMEOUT = 110000; // Per-pass timeout (2 minutes - buffer)

const UPLOAD_ROOT = path.join(process.cwd(), process.env.UPLOAD_DIR || "uploads");
const LATEX_UPLOAD_ROOT = path.join(UPLOAD_ROOT, "latex");
const LATEX_PDF_UPLOAD_DIR = path.join(LATEX_UPLOAD_ROOT, "pdfs");

function resolveLatexTempRoot(): string {
  if (process.env.LATEX_TEMP_DIR) {
    return path.resolve(process.env.LATEX_TEMP_DIR);
  }

  const parentDir = path.resolve(process.cwd(), "..", "latex-temp");
  if (existsSync(parentDir)) {
    return parentDir;
  }

  return path.resolve(process.cwd(), "latex-temp");
}

const LATEX_TEMP_ROOT = resolveLatexTempRoot();

// REMOVED: ensureLatexDocument function - DO NOT modify LaTeX content

function isSafeWorkspaceSegment(value: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(value);
}

// Enhanced LaTeX workspace management
function createIsolatedWorkspace(): string {
  const workspaceId = uuidv4();
  const workspaceDir = path.join(LATEX_TEMP_ROOT, workspaceId);
  fs.mkdirSync(workspaceDir, { recursive: true });
  return workspaceId;
}

function getWorkspaceDir(workspaceId: string, workspaceSubdir?: string): string {
  if (!isSafeWorkspaceSegment(workspaceId)) {
    throw new Error("Invalid workspace id");
  }

  if (!workspaceSubdir) {
    return path.join(LATEX_TEMP_ROOT, workspaceId);
  }

  const segments = workspaceSubdir.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => !isSafeWorkspaceSegment(segment))) {
    throw new Error("Invalid workspace subdirectory");
  }

  return path.join(LATEX_TEMP_ROOT, ...segments, workspaceId);
}

function getRelativeWorkspacePath(workspaceDir: string): string {
  const relative = path.relative(LATEX_TEMP_ROOT, workspaceDir).split(path.sep).join("/");
  if (!relative || relative.startsWith("..")) {
    throw new Error("Invalid LaTeX workspace path");
  }
  return relative;
}

// Enhanced file detection for multi-file projects
function collectProjectFiles(latexCode: string): string[] {
  const files = new Set<string>();
  
  // \input{} and \include{}
  const inputRegex = /\\(?:input|include)\s*\{([^}]+)\}/g;
  let match;
  while ((match = inputRegex.exec(latexCode)) !== null) {
    const filename = match[1].trim();
    if (filename.endsWith('.tex')) {
      files.add(filename);
    } else {
      files.add(filename + '.tex');
    }
  }
  
  // Bibliography files
  const bibRegex = /\\bibliography\s*\{([^}]+)\}/g;
  while ((match = bibRegex.exec(latexCode)) !== null) {
    const bibFiles = match[1].split(',').map(f => f.trim() + '.bib');
    bibFiles.forEach(f => files.add(f));
  }
  
  // \usepackage for custom packages
  const pkgRegex = /\\usepackage(?:\[[^\]]*\])?\s*\{([^}]+)\}/g;
  while ((match = pkgRegex.exec(latexCode)) !== null) {
    const pkg = match[1].trim();
    if (!pkg.match(/^(amsmath|amsfonts|amssymb|graphicx|geometry|tikz|hyperref)$/i)) {
      files.add(pkg + '.sty');
    }
  }
  
  return [...files];
}

function collectImageReferences(latexCode: string): string[] {
  const matches = new Set<string>();
  const regex = /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g;

  let match: RegExpExecArray | null = regex.exec(latexCode);
  while (match) {
    const rawRef = match[1].trim();
    if (rawRef) {
      matches.add(rawRef);
    }
    match = regex.exec(latexCode);
  }

  return [...matches];
}

function isSafeAssetReference(reference: string): boolean {
  if (!reference) return false;
  if (reference.includes("..")) return false;
  if (reference.startsWith("/") || reference.startsWith("\\")) return false;
  if (reference.includes(":")) return false;
  // Allow spaces, parentheses, and dots for better file support
  return /^[a-zA-Z0-9_\-./\s()]+$/.test(reference);
}

function sanitizeFilename(filename: string): string {
  // User requested NEVER to lose spaces in filenames
  // For LaTeX compatibility we'll only do minimal sanitization
  // but keep spaces as requested.
  return filename.trim();
}

function stripExtension(name: string): string {
  const ext = path.extname(name);
  return ext ? name.slice(0, -ext.length) : name;
}

function buildLookupKeys(reference: string): string[] {
  const normalized = reference.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  const noLead = normalized.replace(/^\//, "");
  const base = path.basename(noLead);
  const normalizedStem = stripExtension(noLead).toLowerCase();
  const baseStem = stripExtension(base).toLowerCase();
  return [
    reference,
    normalized,
    noLead,
    base,
    normalized.toLowerCase(),
    noLead.toLowerCase(),
    base.toLowerCase(),
    normalizedStem,
    baseStem,
  ].filter(Boolean);
}

/** Register every common LaTeX path variant so \\includegraphics{assets/images/foo.png} resolves. */
function registerAssetMapping(mapping: Record<string, string>, keys: string[], sanitized: string): void {
  for (const key of keys.flatMap((k) => buildLookupKeys(k))) {
    if (!key) continue;
    mapping[key] = sanitized;
    mapping[key.toLowerCase()] = sanitized;
    const noLead = key.replace(/^\//, "");
    if (noLead) {
      mapping[noLead] = sanitized;
      mapping[noLead.toLowerCase()] = sanitized;
    }
    const base = path.basename(key.replace(/\\/g, "/"));
    if (base) {
      mapping[base] = sanitized;
      mapping[base.toLowerCase()] = sanitized;
    }
  }
}

function physicalFilenameFromS3Url(s3Url: string): string {
  try {
    return path.basename(new URL(s3Url).pathname);
  } catch {
    return path.basename(s3Url.split("?")[0].replace(/\\/g, "/"));
  }
}

export async function buildPdfLinkContext(projectId: string) {
  const frontendBaseUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  const apiBaseUrl = (process.env.API_BASE_URL || process.env.BACKEND_URL || "http://localhost:5000").replace(/\/$/, "");
  try {
    const lu = await prisma.learningUniverse.findFirst({
      where: { sourceProjectId: projectId },
      select: { id: true },
    });
    return {
      frontendBaseUrl,
      apiBaseUrl,
      learningUniverseId: lu?.id,
    };
  } catch {
    return { frontendBaseUrl, apiBaseUrl };
  }
}

async function loadLuPdfProjectContext(projectId: string) {
  try {
    const { loadProjectFiles, getProjectJsonFromFiles, isLuV2Project } = await import(
      "./luProject/luProjectFiles.js"
    );
    const { resolveLuV2ContentSnapshot } = await import("./luProject/luCompileSource.js");
    const linkContext = await buildPdfLinkContext(projectId);
    const files = await loadProjectFiles(projectId);
    if (!isLuV2Project(files)) return undefined;
    const project = getProjectJsonFromFiles(files);
    if (!project) return undefined;
    const snapshot = await resolveLuV2ContentSnapshot(projectId, { runBuild: false }).catch(() => null);
    if (snapshot) {
      return { project: snapshot.project, files: snapshot.files, parsed: snapshot.parsed, linkContext };
    }
    return { project, files, linkContext };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[LATEX] Could not load LU project context for PDF images:", msg);
    return undefined;
  }
}

export { parseLatexErrors } from "./latexLogParser.js";

// Detect if BibTeX is needed
function needsBibtex(latexCode: string, auxContent?: string): boolean {
  // Check for citations in main file
  const hasCitations = /\\cite(?:\[[^\]]*\])?\s*\{/.test(latexCode);
  if (!hasCitations) return false;
  
  // Check for bibliography commands
  const hasBibliography = /\\bibliography|\\bibliographystyle/.test(latexCode);
  if (!hasBibliography) return false;
  
  // If we have aux content, check for undefined citations
  if (auxContent) {
    const hasUndefinedCitations = /\\citation\{|Warning: Citation.*undefined/.test(auxContent);
    return hasUndefinedCitations;
  }
  
  return true;
}

// Check if another pass is needed
function needsAnotherPass(output: string, passNumber: number): boolean {
  if (passNumber >= MAX_PASSES) return false;
  
  const rerunPatterns = [
    /rerun\s+to\s+get/i,
    /label\(s\)\s+may\s+have\s+changed/i,
    /citation\s+.*undefined/i,
    /undefined\s+citations/i,
    /references\s+changed/i,
    /rerun/i
  ];
  
  return rerunPatterns.some(pattern => pattern.test(output));
}

const MAX_COMMAND_OUTPUT_CHARS = 4 * 1024 * 1024;

async function runCommand(command: string, args: string[], timeoutMs: number, options?: { cwd?: string }): Promise<{ exitCode: number; output: string; duration: number }> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    console.log(`[EXEC] ${command} ${args.join(" ")}`);
    const child = spawn(command, args, { 
      stdio: ["ignore", "pipe", "pipe"],
      cwd: options?.cwd 
    });

    let output = "";
    let stderr = "";
    let outputTruncated = false;

    const appendChunk = (target: "stdout" | "stderr", chunk: string) => {
      const combinedLen = output.length + stderr.length;
      if (combinedLen >= MAX_COMMAND_OUTPUT_CHARS) {
        outputTruncated = true;
        return;
      }
      const remaining = MAX_COMMAND_OUTPUT_CHARS - combinedLen;
      const slice = chunk.slice(0, remaining);
      if (target === "stdout") output += slice;
      else stderr += slice;
      if (slice.length < chunk.length) outputTruncated = true;
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      appendChunk("stdout", chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      const s = chunk.toString();
      appendChunk("stderr", s);
      if (stderr.length < 8000) {
        console.log("LATEX STDERR:", s.slice(0, 500));
      }
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      console.log("LATEX ERROR:", error);
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `${command} not found on this host (spawn ENOENT). Install a LaTeX engine or set LATEX_PDFLATEX_PATH.`
          )
        );
        return;
      }
      reject(error);
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const duration = Date.now() - startTime;
      
      if (stderr && exitCode !== 0) {
        console.log("LATEX FINAL STDERR:", stderr.slice(0, 2000));
      }
      
      const truncationNote = outputTruncated
        ? "\n--- OUTPUT TRUNCATED (compile log exceeded safe buffer size) ---\n"
        : "";
      const finalOutput = output + (stderr ? `\n--- STDERR ---\n${stderr}` : "") + truncationNote;
      resolve({ exitCode: exitCode ?? 1, output: finalOutput, duration });
    });
  });
}

function resolveOnPath(bin: string): string | null {
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const out = execFileSync(cmd, [bin], { encoding: "utf8" })
      .trim()
      .split(/\r?\n/)
      .find(Boolean);
    return out && fs.existsSync(out) ? out : null;
  } catch {
    return null;
  }
}

function readTinyTexPathFile(compiler: string): string | null {
  const marker = path.join(process.cwd(), ".tinytex", `${compiler}.path`);
  try {
    if (!fs.existsSync(marker)) return null;
    const stored = fs.readFileSync(marker, "utf8").trim();
    return stored && fs.existsSync(stored) ? stored : null;
  } catch {
    return null;
  }
}

function findTinyTexBinary(compiler: string): string | null {
  const fromMarker = readTinyTexPathFile(compiler);
  if (fromMarker) return fromMarker;

  const names = process.platform === "win32" ? [`${compiler}.exe`] : [compiler];
  const direct = [
    path.join(process.cwd(), ".tinytex", "bin", "x86_64-linux", compiler),
    path.join(process.cwd(), ".tinytex", "bin", "aarch64-linux", compiler),
    path.join(process.cwd(), ".TinyTeX", "bin", "x86_64-linux", compiler),
    path.join(process.cwd(), ".TinyTeX", "bin", "aarch64-linux", compiler),
    path.join(os.homedir(), ".TinyTeX", "bin", "x86_64-linux", compiler),
    path.join(os.homedir(), ".tinytex", "bin", "x86_64-linux", compiler),
  ];
  for (const candidate of direct) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const roots = [
    path.join(process.cwd(), ".tinytex"),
    path.join(process.cwd(), ".TinyTeX"),
    path.join(os.homedir(), ".TinyTeX"),
    path.join(os.homedir(), ".tinytex"),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const stack = [root];
    let steps = 0;
    while (stack.length && steps < 80) {
      const dir = stack.pop() as string;
      steps += 1;
      let entries: fs.Dirent[] = [];
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

export function resolveLatexCompiler(compiler: "pdflatex" | "xelatex" | "lualatex"): string | null {
  const envKey =
    compiler === "pdflatex"
      ? process.env.LATEX_PDFLATEX_PATH
      : compiler === "xelatex"
        ? process.env.LATEX_XELATEX_PATH
        : process.env.LATEX_LUALATEX_PATH;

  const possiblePaths = [
    envKey,
    findTinyTexBinary(compiler),
    `C:\\Program Files\\MiKTeX\\miktex\\bin\\x64\\${compiler}.exe`,
    `C:\\Program Files\\MiKTeX 2.9\\miktex\\bin\\x64\\${compiler}.exe`,
    `/usr/bin/${compiler}`,
    `/usr/local/bin/${compiler}`,
    resolveOnPath(compiler),
  ].filter(Boolean) as string[];

  for (const candidate of possiblePaths) {
    // Never treat the bare command name as "found" — that caused spawn ENOENT on Render.
    if (candidate === compiler) continue;
    if (fs.existsSync(candidate)) return path.resolve(candidate);
  }
  return null;
}

export function ensureLatexBinOnPath(): string | null {
  const pdflatexPath = resolveLatexCompiler("pdflatex");
  if (!pdflatexPath) return null;
  const binDir = path.dirname(pdflatexPath);
  const current = process.env.PATH || "";
  if (!current.split(path.delimiter).includes(binDir)) {
    process.env.PATH = `${binDir}${path.delimiter}${current}`;
  }
  if (!process.env.LATEX_PDFLATEX_PATH) {
    process.env.LATEX_PDFLATEX_PATH = pdflatexPath;
  }
  return pdflatexPath;
}

function findCompiler(compiler: "pdflatex" | "xelatex" | "lualatex"): string | null {
  return resolveLatexCompiler(compiler);
}

// CRITICAL: Fix working directory - pdflatex must run INSIDE workspaceDir
async function runLatexPass(
  workspaceDir: string, 
  compiler: 'pdflatex' | 'xelatex' | 'lualatex',
  timeoutMs: number
): Promise<{ exitCode: number; output: string; duration: number; fullCommand: string }> {
  const compilerPath = findCompiler(compiler);
  if (!compilerPath) {
    throw new Error(
      `${compiler} not found. Install a LaTeX engine, set LATEX_PDFLATEX_PATH, or deploy the Docker image.`
    );
  }
  console.log(`[LATEX] using ${compiler}: ${compilerPath}`);
  
  // CRITICAL: Sanitize path - remove newlines and trim
  workspaceDir = workspaceDir.trim();
  
  // CRITICAL: Verify main.tex exists before running
  const mainTexPath = path.join(workspaceDir, "main.tex");
  if (!fs.existsSync(mainTexPath)) {
    throw new Error(`main.tex not found in workspace: ${mainTexPath}`);
  }
  
  // CRITICAL: Debug logging for CWD and files
  console.log("CWD:", workspaceDir);
  console.log("OUTPUT DIR:", JSON.stringify(workspaceDir));
  console.log("FILES:", fs.readdirSync(workspaceDir));
  console.log("main.tex EXISTS:", fs.existsSync(mainTexPath));
  
  // CRITICAL: Use minimal safe command - remove problematic flags
  const args = [
    "-interaction=nonstopmode",
    "-halt-on-error",
    "-file-line-error",
    `-output-directory=${workspaceDir}`,
    "main.tex",
  ];
  
  const fullCommand = `${compilerPath} ${args.join(" ")}`;
  
  // CRITICAL: Log exact command to verify one-line format
  console.log("FINAL CMD:", fullCommand);
  console.log(`Running ${compiler} from INSIDE workspace directory:`);
  console.log(`Working Directory: ${workspaceDir}`);
  
  // CRITICAL: Set working directory explicitly to workspaceDir
  const result = await runCommand(compilerPath, args, timeoutMs, { 
    cwd: workspaceDir 
  });
  
  return {
    ...result,
    fullCommand
  };
}

// Run BibTeX if needed
async function runBibtexPass(workspaceDir: string, timeoutMs: number): Promise<{ exitCode: number; output: string; duration: number }> {
  const pdflatexPath = findCompiler("pdflatex");
  const bibtexPath = pdflatexPath
    ? pdflatexPath.replace(/pdflatex(\.exe)?$/i, (_match, ext: string | undefined) => `bibtex${ext || ""}`)
    : "bibtex";
  
  const args = ["main"];
  
  console.log(`Running BibTeX in directory:`, workspaceDir);
  
  return await runCommand(bibtexPath, args, timeoutMs, { cwd: workspaceDir });
}

// Check for missing packages and retry with auto-install
function hasMissingPackageError(output: string): boolean {
  const missingPatterns = [
    /package.*not found/i,
    /undefined control sequence/i,
    /file.*not found/i,
    /missing.*package/i,
    /emergency stop/i,
    /fatal error/i
  ];
  return missingPatterns.some(pattern => pattern.test(output));
}

// Check if compilation actually failed vs just warnings
function isRealCompilationError(output: string): boolean {
  const fatalErrorPatterns = [
    /emergency stop/i,
    /fatal error/i,
    /missing.*\\end/i,
    /syntax error/i,
    /undefined control sequence.*\\[a-zA-Z]+/,
    /missing.*file/i,
    /cannot find/i
  ];
  
  // Ignore MiKTeX warnings and update messages
  const warningPatterns = [
    /major issue.*miktex updates/i,
    /package.*infwarerr/i,
    /so far.*not checked.*miktex/i,
    /miktex.*did not succeed/i,
    /file:line:error style messages enabled/i
  ];
  
  // If it's a warning, it's not a real error
  if (warningPatterns.some(pattern => pattern.test(output))) {
    return false;
  }
  
  // Check for actual fatal errors
  return fatalErrorPatterns.some(pattern => pattern.test(output));
}

// Check if compilation produced a valid non-empty PDF
function isValidPdfFile(pdfPath: string): boolean {
  if (!fs.existsSync(pdfPath)) return false;
  const stat = fs.statSync(pdfPath);
  if (stat.size < 128) return false;
  try {
    const header = Buffer.alloc(5);
    const fd = fs.openSync(pdfPath, "r");
    fs.readSync(fd, header, 0, 5, 0);
    fs.closeSync(fd);
    return header.toString("ascii") === "%PDF-";
  } catch {
    return false;
  }
}

// Check if compilation succeeded (valid PDF on disk)
function isCompilationSuccessful(workspaceDir: string, output: string): boolean {
  const pdfPath = path.join(workspaceDir, "main.pdf");

  if (isValidPdfFile(pdfPath)) {
    const size = fs.statSync(pdfPath).size;
    console.log(`✅ PDF file detected - compilation successful (${size} bytes)`);
    return true;
  }

  if (/No pages of output/i.test(output)) {
    console.log("❌ LaTeX produced no pages of output");
    return false;
  }

  if (fs.existsSync(pdfPath)) {
    console.log("❌ PDF file exists but is empty or invalid");
    return false;
  }

  const hasFatalError = isRealCompilationError(output);
  if (hasFatalError) {
    console.log("❌ Fatal LaTeX error detected");
    return false;
  }

  console.log("⚠️  No valid PDF produced");
  return false;
}


async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resetWorkspaceDirectory(workspaceDir: string): Promise<void> {
  await fsPromises.mkdir(workspaceDir, { recursive: true });
  const entries = await fsPromises.readdir(workspaceDir);
  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(workspaceDir, entry);
      await rmWithRetry(fullPath);
    })
  );
}

/** Windows-safe recursive delete — avoids ENOTEMPTY when compile/publish overlap. */
async function rmWithRetry(targetPath: string, attempts = 5): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await fsPromises.rm(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (attempt === attempts || (code !== "ENOTEMPTY" && code !== "EBUSY" && code !== "EPERM")) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 150 * attempt));
    }
  }
}

const projectCompileChains = new Map<string, Promise<unknown>>();

/** Serialize compile workspace access per project (editor compile + publish PDF share latex-temp/{projectId}). */
async function withProjectCompileLock<T>(workspaceId: string, fn: () => Promise<T>): Promise<T> {
  const prev = projectCompileChains.get(workspaceId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chain = prev.then(() => gate);
  projectCompileChains.set(workspaceId, chain);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (projectCompileChains.get(workspaceId) === chain) {
      projectCompileChains.delete(workspaceId);
    }
  }
}

// Enhanced artifact cleanup
async function clearPreviousArtifacts(workspaceDir: string): Promise<void> {
  const artifacts = [
    "main.aux", "main.log", "main.out", "main.pdf", "main.toc", 
    "main.bbl", "main.bcf", "main.blg", "main.fdb_latexmk",
    "main.fls", "main.idx", "main.ind", "main.ilg", "main.synctex.gz"
  ];
  await Promise.all(
    artifacts.map(async (artifact) => {
      const fullPath = path.join(workspaceDir, artifact);
      try {
        await fsPromises.unlink(fullPath);
      } catch {
        // no-op
      }
    })
  );
}

async function resolveLuResearchContext(workspaceId?: string): Promise<{
  universeId: string | null;
  projectIds: string[];
}> {
  if (!workspaceId) return { universeId: null, projectIds: [] };
  const projectIds = [workspaceId];
  if (!workspaceId.startsWith("lu-research-")) {
    return { universeId: null, projectIds };
  }
  const universeId = workspaceId.slice("lu-research-".length).split("-")[0] || null;
  if (!universeId) return { universeId: null, projectIds };
  try {
    const universe = await prisma.learningUniverse.findUnique({
      where: { id: universeId },
      select: { sourceProjectId: true },
    });
    if (universe?.sourceProjectId) projectIds.push(universe.sourceProjectId);
  } catch {
    /* ignore */
  }
  return { universeId, projectIds };
}

// Enhanced project asset preparation (images, videos, etc.)
async function prepareProjectAssets(
  latexCode: string, 
  workspaceDir: string, 
  workspaceId?: string
): Promise<{ code: string; mapping: Record<string, string>; missingReferences: string[] }> {
  const mapping: Record<string, string> = {};
  const references = collectImageReferences(latexCode);
  const missingReferences = new Set<string>();

  // Legacy \\video{filename.mp4} only — skip LU DSL \\video{type={youtube},...}
  replaceBraceCommands(latexCode, "video", (inner) => {
    if (isDslVideoBody(inner)) return null;
    const trimmed = inner.trim();
    if (trimmed) references.push(trimmed);
    return null;
  });

  const hrefVideoRegex = /\\href\{([^}]+\.mp4)\}\{([^}]+)\}/g;
  let hvMatch;
  while ((hvMatch = hrefVideoRegex.exec(latexCode)) !== null) {
    references.push(hvMatch[1].trim());
  }

  const sourceDirs = [LATEX_UPLOAD_ROOT, path.join(UPLOAD_ROOT, "resources")];
  const { universeId: researchUniverseId, projectIds } = await resolveLuResearchContext(workspaceId);
  for (const pid of projectIds) {
    sourceDirs.push(path.join(UPLOAD_ROOT, "projects", pid));
  }

  console.log(`[DEEP DEBUG] --- ASSET PREP START ---`);
  console.log(`[DEEP DEBUG] Workspace ID: ${workspaceId || "global"}`);
  console.log(`[DEEP DEBUG] Workspace Dir: ${workspaceDir}`);

  // 1. If we have a project ID, query DB for logical-to-physical mapping
  if (projectIds.length) {
    try {
      const dbFiles = await prisma.latexFile.findMany({
        where: { projectId: { in: projectIds }, isFolder: false }
      });
      
      console.log(`[LATEX-TRACE] Found ${dbFiles.length} files in DB for projects ${projectIds.join(",")}`);
      
      for (const file of dbFiles) {
        const ext = path.extname(file.name).toLowerCase();
        const isAsset = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.svg', '.mp4', '.webm', '.mov', '.webp'].includes(ext);
        
        if (isAsset && file.s3Url) {
          const physicalFilename = physicalFilenameFromS3Url(file.s3Url);
          const sanitizedLogicalName = sanitizeFilename(file.name);
          const logicalPath = file.path.replace(/^\//, "");
          const projectDir = path.join(UPLOAD_ROOT, "projects", file.projectId);

          const sourcePath = path.join(projectDir, physicalFilename);
          const destPath = path.join(workspaceDir, sanitizedLogicalName);
          const resolvedSource =
            fs.existsSync(sourcePath) ? sourcePath : await hydrateLocalUpload(file.s3Url);

          if (resolvedSource && fs.existsSync(resolvedSource)) {
            try {
              fs.copyFileSync(resolvedSource, destPath);

              registerAssetMapping(mapping, [file.name, logicalPath, file.path], sanitizedLogicalName);

              // Also copy to public resources folder for frontend access
              const publicResourcesDir = path.join(process.cwd(), 'uploads', 'resources');
              if (!fs.existsSync(publicResourcesDir)) {
                fs.mkdirSync(publicResourcesDir, { recursive: true });
              }
              fs.copyFileSync(resolvedSource, path.join(publicResourcesDir, sanitizedLogicalName));

              const stats = fs.statSync(destPath);
              console.log(`[LATEX-TRACE] A. Original (Logical): ${file.name}`);
              console.log(`[LATEX-TRACE] B. Sanitized Filename: ${sanitizedLogicalName}`);
              console.log(`[LATEX-TRACE] C. Workspace Path: ${destPath}`);
              console.log(`[LATEX-TRACE] D. Exists: ${fs.existsSync(destPath)}`);
              console.log(`[LATEX-TRACE] E. Size: ${stats.size} bytes`);
              console.log(`[LATEX-TRACE] Physical Source: ${sourcePath}`);
            } catch (err: any) {
              console.error(`[LATEX-TRACE] ERROR: Failed to copy project asset ${file.name}:`, err.message);
            }
          } else {
            console.warn(`[LATEX-TRACE] WARNING: Physical file not found at ${sourcePath} for logical file ${file.name}`);
          }
        }
      }
    } catch (dbErr: any) {
      console.error(`[LATEX-TRACE] ERROR: Failed to fetch project files from DB:`, dbErr.message);
    }
  }

  if (researchUniverseId) {
    try {
      const luAssets = await prisma.learningUniverseAsset.findMany({
        where: { learningUniverseId: researchUniverseId },
      });
      for (const asset of luAssets) {
        const stored = `/uploads/learning-universes/${researchUniverseId}/${asset.storedFilename}`;
        const resolved = await hydrateLocalUpload(stored);
        if (!resolved || !fs.existsSync(resolved)) continue;
        const destName = sanitizeFilename(asset.filename);
        const destPath = path.join(workspaceDir, destName);
        fs.copyFileSync(resolved, destPath);
        registerAssetMapping(mapping, [asset.filename, destName], destName);
        console.log(`[LATEX-TRACE] Hydrated LU asset ${asset.filename} -> ${destName}`);
      }
    } catch (err: any) {
      console.warn(`[LATEX-TRACE] LU research asset hydration skipped: ${err.message}`);
    }
  }

  // 2. Also check for specifically referenced images that might be in global LATEX_UPLOAD_ROOT
  let dbFilesForLookup: Array<{ name: string; path: string; s3Url: string | null }> = [];
  if (projectIds.length) {
    try {
      dbFilesForLookup = await prisma.latexFile.findMany({
        where: { projectId: { in: projectIds }, isFolder: false },
        select: { name: true, path: true, s3Url: true },
      });
    } catch {
      dbFilesForLookup = [];
    }
  }

  for (const reference of references) {
    if (!isSafeAssetReference(reference)) continue;
    if (mapping[reference]) continue; // Already handled if it was in project dir

    const normalized = reference.replace(/\\/g, "/");
    const filename = path.basename(normalized);
    const normalizedStem = stripExtension(normalized.replace(/^\.\//, "").replace(/^\//, "")).toLowerCase();
    const filenameStem = stripExtension(filename).toLowerCase();
    const sanitized = sanitizeFilename(filename);

    const dbMatch = dbFilesForLookup.find((f) => {
      const logical = f.path.replace(/^\//, "");
      const logicalStem = stripExtension(logical).toLowerCase();
      const fileStem = stripExtension(f.name).toLowerCase();
      return (
        logical === normalized ||
        logical.toLowerCase() === normalized.toLowerCase() ||
        f.path === `/${normalized}` ||
        f.path.toLowerCase() === `/${normalized}`.toLowerCase() ||
        f.name === filename ||
        f.name.toLowerCase() === filename.toLowerCase() ||
        logicalStem === normalizedStem ||
        fileStem === filenameStem ||
        fileStem === normalizedStem ||
        logical.endsWith(`/${normalized}`) ||
        logical.toLowerCase().endsWith(`/${normalized.toLowerCase()}`) ||
        logicalStem.endsWith(`/${filenameStem}`)
      );
    });

    if (dbMatch?.s3Url && workspaceId) {
      const physicalFilename = physicalFilenameFromS3Url(dbMatch.s3Url);
      const sourcePath = path.join(UPLOAD_ROOT, "projects", workspaceId, physicalFilename);
      const dbSanitized = sanitizeFilename(dbMatch.name || filename);
      const destPath = path.join(workspaceDir, dbSanitized);
      const resolvedSource =
        fs.existsSync(sourcePath) ? sourcePath : await hydrateLocalUpload(dbMatch.s3Url);
      if (resolvedSource && fs.existsSync(resolvedSource)) {
        try {
          fs.copyFileSync(resolvedSource, destPath);
          registerAssetMapping(mapping, [reference, normalized, dbMatch.name, dbMatch.path], dbSanitized);
          continue;
        } catch (err: any) {
          console.error(`[LATEX-TRACE] ERROR: Failed to copy DB-matched asset ${reference}:`, err.message);
        }
      }
    }

    for (const sourceDir of sourceDirs) {
      const logicalRef = normalized.replace(/^\//, "");
      const directPath = path.join(sourceDir, logicalRef);
      const basePath = path.join(sourceDir, filename);
      const sourceCandidates = [directPath, basePath];
      for (const sourcePath of sourceCandidates) {
        if (!fs.existsSync(sourcePath)) continue;
        const destPath = path.join(workspaceDir, sanitized);
        try {
          fs.copyFileSync(sourcePath, destPath);
          const stats = fs.statSync(destPath);
          registerAssetMapping(mapping, [reference, normalized, filename], sanitized);
          console.log(`[LATEX-TRACE] A. Original Referenced Path: ${sourcePath}`);
          console.log(`[LATEX-TRACE] B. Sanitized Filename: ${sanitized}`);
          console.log(`[LATEX-TRACE] C. Workspace Path: ${destPath}`);
          console.log(`[LATEX-TRACE] D. Exists: ${fs.existsSync(destPath)}`);
          console.log(`[LATEX-TRACE] E. Size: ${stats.size} bytes`);
          break;
        } catch (err: any) {
          console.error(`[LATEX-TRACE] ERROR: Failed to copy referenced asset ${reference}:`, err.message);
        }
      }
      if (mapping[reference] || mapping[reference.toLowerCase()]) break;
    }
    if (!mapping[reference] && !mapping[reference.toLowerCase()]) {
      const filenameStem = stripExtension(filename).toLowerCase();
      const fuzzy = dbFilesForLookup.find((f) => {
        const fileStem = stripExtension(f.name).toLowerCase();
        const logicalStem = stripExtension(f.path.replace(/^\//, "")).toLowerCase();
        const stemNoDigits = filenameStem.replace(/\d+$/g, "");
        return (
          (stemNoDigits && (fileStem === stemNoDigits || logicalStem.endsWith(`/${stemNoDigits}`))) ||
          (filenameStem.startsWith(fileStem) && fileStem.length >= 3) ||
          (fileStem.startsWith(filenameStem) && filenameStem.length >= 3)
        );
      });
      if (fuzzy?.s3Url && workspaceId) {
        const physicalFilename = physicalFilenameFromS3Url(fuzzy.s3Url);
        const sourcePath = path.join(UPLOAD_ROOT, "projects", workspaceId, physicalFilename);
        const dbSanitized = sanitizeFilename(fuzzy.name || filename);
        const destPath = path.join(workspaceDir, dbSanitized);
        const resolvedSource =
          fs.existsSync(sourcePath) ? sourcePath : await hydrateLocalUpload(fuzzy.s3Url);
        if (resolvedSource && fs.existsSync(resolvedSource)) {
          try {
            fs.copyFileSync(resolvedSource, destPath);
            registerAssetMapping(mapping, [reference, normalized, fuzzy.name, fuzzy.path], dbSanitized);
            continue;
          } catch {
            /* fall through to missing */
          }
        }
      }
      missingReferences.add(reference);
    }
  }

  // 3. Rewrite the LaTeX code with sanitized filenames
  let updatedCode = latexCode;
  
  // Rewrite \includegraphics
  updatedCode = updatedCode.replace(/\\includegraphics(?:\[([^\]]*)\])?\{([^}]+)\}/g, (match, options, ref) => {
    const trimmedRef = ref.trim().replace(/\\/g, "/");
    const noLead = trimmedRef.replace(/^\.\//, "");
    const basename = path.basename(noLead);
    const normalizedStem = stripExtension(noLead.replace(/^\//, "")).toLowerCase();
    const basenameStem = stripExtension(basename).toLowerCase();
    const sanitized =
      mapping[trimmedRef] ||
      mapping[noLead] ||
      mapping[basename] ||
      mapping[basename.toLowerCase()] ||
      mapping[normalizedStem] ||
      mapping[basenameStem];
    if (sanitized) {
      const rewritten = match.replace(ref, sanitized);
      console.log(`[LATEX-TRACE] F. Rewritten Command: ${rewritten}`);
      return rewritten;
    }
    console.warn(`[LATEX-TRACE] WARNING: Could not find mapping for image: ${trimmedRef}`);
    return match;
  });

  // Rewrite legacy \\video{clip.mp4} — never LU DSL \\video{type={...},...}
  updatedCode = replaceBraceCommands(updatedCode, "video", (inner) => {
    if (isDslVideoBody(inner)) return null;
    const trimmedRef = inner.trim();
    const sanitized = mapping[trimmedRef] || sanitizeFilename(trimmedRef);
    console.log(`[DEEP DEBUG] Rewriting LaTeX Video: \\video{${trimmedRef}} -> \\video{${sanitized}}`);
    return `\\video{${sanitized}}`;
  });

  // Rewrite \href{*.mp4} to \video
  updatedCode = updatedCode.replace(/\\href\{([^}]+\.mp4)\}\{([^}]+)\}/g, (match, ref, text) => {
    const trimmedRef = ref.trim();
    const sanitized = mapping[trimmedRef] || sanitizeFilename(trimmedRef);
    console.log(`[DEEP DEBUG] Rewriting LaTeX href Video: \\href{${trimmedRef}} -> \\video{${sanitized}}`);
    return `\\video{${sanitized}}`;
  });

  // 4. Inject necessary packages if missing (preamble only — never after \title)
  if (!updatedCode.includes("graphicx")) {
    updatedCode = injectIntoPreamble(updatedCode, "\\usepackage{graphicx}");
  }
  if (!updatedCode.includes("hyperref")) {
    updatedCode = injectIntoPreamble(updatedCode, "\\usepackage{hyperref}");
  }
  if (!updatedCode.includes("grffile")) {
    updatedCode = injectIntoPreamble(updatedCode, "\\usepackage{grffile}");
  }

  return { code: updatedCode, mapping, missingReferences: [...missingReferences] };
}

// Enhanced log reading with fallback
async function readMainLog(workspaceDir: string, fallback: string): Promise<string> {
  try {
    const logPath = path.join(workspaceDir, "main.log");
    if (fs.existsSync(logPath)) {
      return fs.readFileSync(logPath, "utf8");
    }
  } catch {
    // keep fallback
  }
  return fallback;
}

function errorsFromLog(logContent: string): ParsedLatexError[] {
  const parsed = parseLatexLog(logContent);
  if (parsed.firstError) {
    return [parsed.firstError];
  }
  return parsed.errors.slice(0, 1);
}

interface CompileInternalOptions {
  timeoutMs: number;
  maxPasses: number;
  enableBibtex: boolean;
  compilerFallback: boolean;
}

function sanitizeAllWorkspaceTexFiles(workspaceDir: string): void {
  function walkDir(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".tex")) {
        try {
          const raw = fs.readFileSync(fullPath, "utf8");
          const sanitized = escapeLearningBlockContent(raw);
          if (sanitized !== raw) {
            fs.writeFileSync(fullPath, sanitized, "utf8");
            console.log(`[TEX-PREPROCESS] Escaped unescaped special characters in ${entry.name}`);
          }
        } catch (e) {
          console.warn(`[TEX-PREPROCESS] Failed to sanitize ${fullPath}:`, e);
        }
      }
    }
  }
  walkDir(workspaceDir);
}

// Simplified pdflatex-only multi-pass compilation
async function runPdflatexCompilation(
  workspaceDir: string, 
  code: string,
  options: CompileInternalOptions
): Promise<{ 
  success: boolean; 
  steps: CompilationStep[]; 
  error?: string;
  output: string;
  errors: any[];
  compilerUsed: 'pdflatex' | 'xelatex' | 'lualatex';
  passesCompleted: number;
  bibtexRun: boolean;
  compileCommands: string[];
}> {
  const steps: CompilationStep[] = [];
  let bibtexRun = false;
  let passesCompleted = 0;
  const compileCommands: string[] = [];
  
  try {
    // Pre-sanitize all .tex files in workspace to escape unescaped special characters (&, #, %) before pdflatex runs
    sanitizeAllWorkspaceTexFiles(workspaceDir);

    // PASS 1: First pdflatex pass
    console.log(`Running pdflatex - PASS 1`);
    const pass1 = await runLatexPass(workspaceDir, 'pdflatex', options.timeoutMs);
    passesCompleted++;
    compileCommands.push(pass1.fullCommand);
    steps.push({
      name: 'pdflatex (pass 1)',
      command: 'pdflatex',
      args: [],
      exitCode: pass1.exitCode,
      output: pass1.output,
      duration: pass1.duration,
      fullCommand: pass1.fullCommand
    });

    const pass1Log = await readMainLog(workspaceDir, pass1.output);
    const pass1Parse = parseLatexLog(pass1Log);
    const pass1Failed = pass1.exitCode !== 0 || pass1Parse.firstError != null;

    // Check for BibTeX after first pass — only if pass 1 succeeded
    if (options.enableBibtex && !pass1Failed) {
      let auxContent = "";
      try {
        auxContent = fs.readFileSync(path.join(workspaceDir, "main.aux"), "utf8");
      } catch (e) {
        // aux file might not exist yet
      }
      
      if (needsBibtex(code, auxContent)) {
        console.log("Running BibTeX...");
        const bibtexResult = await runBibtexPass(workspaceDir, options.timeoutMs);
        bibtexRun = true;
        // We don't track full command for bibtex right now
        steps.push({
          name: 'bibtex',
          command: 'bibtex',
          args: [],
          exitCode: bibtexResult.exitCode,
          output: bibtexResult.output,
          duration: bibtexResult.duration,
          fullCommand: 'bibtex main'
        });
      }
    }
    
    // PASS 2: Second pdflatex pass — skip if first pass already failed
    if (options.maxPasses >= 2 && !pass1Failed) {
      console.log(`Running pdflatex - PASS 2`);
      const pass2 = await runLatexPass(workspaceDir, 'pdflatex', options.timeoutMs);
      passesCompleted++;
      compileCommands.push(pass2.fullCommand);
      steps.push({
        name: 'pdflatex (pass 2)',
        command: 'pdflatex',
        args: [],
        exitCode: pass2.exitCode,
        output: pass2.output,
        duration: pass2.duration,
        fullCommand: pass2.fullCommand
      });
    }
    
    // PASS 3: Third pdflatex pass — skip if first pass already failed
    if (options.maxPasses >= 3 && !pass1Failed) {
      console.log(`Running pdflatex - PASS 3`);
      const pass3 = await runLatexPass(workspaceDir, 'pdflatex', options.timeoutMs);
      passesCompleted++;
      compileCommands.push(pass3.fullCommand);
      steps.push({
        name: 'pdflatex (pass 3)',
        command: 'pdflatex',
        args: [],
        exitCode: pass3.exitCode,
        output: pass3.output,
        duration: pass3.duration,
        fullCommand: pass3.fullCommand
      });
    }
    
    // Combine outputs and parse LaTeX log errors (Overleaf-style)
    const output = steps.map(s => `--- ${s.name} ---\n${s.output}`).join('\n\n');
    const logContent = await readMainLog(workspaceDir, output);
    const logParse = parseLatexLog(logContent);
    const parsedErrors = errorsFromLog(logContent);
    const errors =
      parsedErrors.length > 0
        ? parsedErrors
        : steps.reduce((acc, s) => {
            if (s.exitCode !== 0) {
              acc.push({
                message: `Compiler step "${s.name}" exited with code ${s.exitCode}`,
                line: null,
                type: "Compiler Exit",
                raw: s.name,
                suggestedFix: "Check the Logs tab for pdflatex output.",
              });
            }
            return acc;
          }, [] as ParsedLatexError[]);

    const success = isValidPdfFile(path.join(workspaceDir, "main.pdf"));

    return {
      success,
      steps,
      output,
      errors,
      compilerUsed: 'pdflatex',
      passesCompleted,
      bibtexRun,
      compileCommands
    };
  } catch (error: any) {
    return {
      success: false,
      steps,
      error: error.message,
      output: steps.map(s => s.output).join('\n'),
      errors: [{ message: error.message }],
      compilerUsed: 'pdflatex',
      passesCompleted,
      bibtexRun,
      compileCommands
    };
  }
}

// Write all .tex/.bib files from a LaTeX project into the compile workspace
async function writeProjectTexFilesToWorkspace(
  projectId: string,
  workspaceDir: string
): Promise<void> {
  const files = await prisma.latexFile.findMany({
    where: { projectId, isFolder: false },
  });
  await writeSnapshotTexFilesToWorkspace(files, workspaceDir);
}

async function writeSnapshotTexFilesToWorkspace(
  files: Array<{ path: string; name: string; content?: string | null; isFolder?: boolean }>,
  workspaceDir: string
): Promise<void> {
  for (const file of files) {
    if (file.isFolder) continue;
    const ext = path.extname(file.name).toLowerCase();
    if (![".tex", ".bib", ".sty", ".cls"].includes(ext)) continue;
    if (!file.content) continue;

    const relativePath = file.path.replace(/^\//, "").replace(/\\/g, "/");
    const destPath = path.join(workspaceDir, relativePath);
    await fsPromises.mkdir(path.dirname(destPath), { recursive: true });
    await fsPromises.writeFile(destPath, file.content, "utf8");
  }
}

export async function resolveMainTexForProject(
  projectId: string,
  fallbackCode?: string
): Promise<string> {
  const mainFile = await prisma.latexFile.findFirst({
    where: { projectId, path: "/main.tex" },
  });

  if (mainFile?.content?.trim()) {
    return mainFile.content;
  }

  const anyTex = await prisma.latexFile.findFirst({
    where: { projectId, isFolder: false, name: { endsWith: ".tex" } },
    orderBy: { path: "asc" },
  });

  if (anyTex?.content?.trim()) {
    return anyTex.content;
  }

  if (fallbackCode?.trim()) {
    return fallbackCode;
  }

  throw new Error("No main.tex content found for this project");
}

// Full Overleaf-level compilation engine
export async function compileLatexLocally(
  workspaceId: string,
  code: string,
  options: CompileOptions = {}
): Promise<LatexCompilationResult> {
  const startTime = Date.now();
  try {
    return await withProjectCompileLock(workspaceId, () =>
      compileLatexLocallyInner(workspaceId, code, options, startTime)
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[LATEX] compileLatexLocally failed safely:", message);
    return {
      success: false,
      logs: message,
      errors: [{ message, line: null, type: "Compile Engine", category: "OTHER", raw: message }],
      compilationTime: Date.now() - startTime,
      compilerUsed: "pdflatex",
      passesCompleted: 0,
      bibtexRun: false,
      generatedTex: "",
      compileCommands: [],
      outputDirectory: getWorkspaceDir(workspaceId, options.workspaceSubdir),
    };
  }
}

async function compileLatexLocallyInner(
  workspaceId: string,
  code: string,
  options: CompileOptions,
  startTime: number
): Promise<LatexCompilationResult> {
  console.log("🔥 Starting LaTeX compilation for workspace:", workspaceId);
  const workspaceDir = getWorkspaceDir(workspaceId, options.workspaceSubdir);
  
  // Create workspace directory
  await fsPromises.mkdir(workspaceDir, { recursive: true });
  await resetWorkspaceDirectory(workspaceDir);
  
  // Clear previous artifacts
  await clearPreviousArtifacts(workspaceDir);

  // Multi-file: sync project .tex files from DB into workspace first
  let sourceCode = code;
  const isLuV2 =
    options.preserveProvidedMainTex === true ||
    Boolean(
      await prisma.latexFile.findFirst({
        where: { projectId: workspaceId, path: LU_PROJECT_JSON_PATH, isFolder: false },
        select: { id: true },
      })
    );

  try {
    if (options.pdfProjectContext?.files?.length) {
      await writeSnapshotTexFilesToWorkspace(options.pdfProjectContext.files, workspaceDir);
    } else {
      await writeProjectTexFilesToWorkspace(workspaceId, workspaceDir);
    }
    const mainName = options.mainFileName ?? "main.tex";
    const mainPath = path.join(workspaceDir, mainName.replace(/^\//, ""));
    if (!isLuV2 && !options.preserveProvidedMainTex && fs.existsSync(mainPath)) {
      const diskMain = await fsPromises.readFile(mainPath, "utf8");
      if (diskMain.trim()) sourceCode = diskMain;
    }
  } catch (multiErr: any) {
    console.warn("[LATEX] Multi-file sync skipped:", multiErr.message);
  }

  // IMPORTANT: Apply live editor snapshot AFTER DB sync so compile uses freshest state.
  if (options.inlineWorkspaceFiles?.length) {
    for (const file of options.inlineWorkspaceFiles) {
      const relative = file.name.replace(/^\//, "").replace(/\\/g, "/");
      const ext = path.extname(relative).toLowerCase();
      const textExts = [".tex", ".bib", ".sty", ".cls"];
      const imageExts = [".png", ".jpg", ".jpeg", ".gif", ".pdf", ".svg", ".webp"];
      if (![...textExts, ...imageExts].includes(ext)) continue;
      const destPath = path.join(workspaceDir, relative);
      await fsPromises.mkdir(path.dirname(destPath), { recursive: true });
      if (imageExts.includes(ext) && file.content && !file.content.includes("\n") && /^[A-Za-z0-9+/=\s]+$/.test(file.content.slice(0, 80))) {
        await fsPromises.writeFile(destPath, Buffer.from(file.content, "base64"));
      } else {
        await fsPromises.writeFile(destPath, file.content, "utf8");
      }
    }
  }

  // Expand LU DSL + inject image blocks, then copy assets into the compile workspace
  let finalCode = sourceCode;
  const projectContext =
    options.pdfProjectContext ?? (isLuV2 ? await loadLuPdfProjectContext(workspaceId) : undefined);

  if (options.copyReferencedImages) {
    const prepared = prepareLatexForCompilation(sourceCode, workspaceId, projectContext);
    finalCode = prepared.code;
    if (!prepared.validation.valid) {
      console.warn(
        "[LATEX] LMS command validation warnings:",
        prepared.validation.issues.map((i) => i.message).join("; ")
      );
    }
    const assetResult = await prepareProjectAssets(finalCode, workspaceDir, workspaceId);
    finalCode = assetResult.code;
    if (assetResult.missingReferences.length > 0) {
      console.warn(
        `[LATEX] Missing referenced assets (continuing compile): ${assetResult.missingReferences.join(", ")}`
      );
    }
  } else {
    const prepared = prepareLatexForCompilation(sourceCode, workspaceId, projectContext);
    finalCode = prepared.code;
    if (!prepared.validation.valid) {
      console.warn(
        "[LATEX] LMS command validation warnings:",
        prepared.validation.issues.map((i) => i.message).join("; ")
      );
    }
  }
  
  // Write main.tex file
  const mainTexPath = path.join(workspaceDir, "main.tex");
  await fsPromises.writeFile(mainTexPath, finalCode, 'utf8');
  console.log(`[LATEX-TRACE] G. Final .tex written (${finalCode.length} chars)`);
  console.log(`[LATEX-TRACE] H. Workspace Directory Listing:`, fs.readdirSync(workspaceDir));
  
  // Run compilation
  const result = await runPdflatexCompilation(workspaceDir, finalCode, {
    timeoutMs: options.timeoutMs || 60000,
    maxPasses: options.maxPasses || 3,
    enableBibtex: options.enableBibtex || false,
    compilerFallback: options.compilerFallback || true
  });
  
  const compilationTime = Date.now() - startTime;
  
  // Check if compilation succeeded
  const success = isCompilationSuccessful(workspaceDir, result.output);
  const pdfPath = success ? path.join(workspaceDir, "main.pdf") : undefined;

  const fullLogs = await readMainLog(workspaceDir, result.output);
  const logParse = success ? null : parseLatexLog(fullLogs);
  const parsedErrors = success ? [] : errorsFromLog(fullLogs);
  const errors = parsedErrors.length > 0 ? parsedErrors : result.errors;
  const compileReport = logParse
    ? buildCompileErrorReport(logParse, {
        compilationTimeMs: compilationTime,
        compileCommands: result.compileCommands,
      })
    : undefined;

  console.log(`🔥 LaTeX compilation ${success ? 'SUCCESS' : 'FAILED'} in ${compilationTime}ms`);
  if (logParse?.firstError) {
    console.log(
      `[LATEX] First error: ${logParse.firstError.file ?? "main.tex"}:${logParse.firstError.line ?? "?"} — ${logParse.firstError.message}`
    );
  }

  return {
    success,
    pdfPath,
    logs: fullLogs,
    errors: success ? [] : errors,
    compilationTime,
    compilerUsed: result.compilerUsed,
    passesCompleted: result.passesCompleted,
    bibtexRun: result.bibtexRun,
    generatedTex: finalCode,
    compileCommands: result.compileCommands,
    outputDirectory: workspaceDir,
    compileReport,
    logParse: logParse ?? undefined,
  };
}

export async function storeCompiledPdfFromPath(
  sourcePdfPath: string,
  fileName: string
): Promise<StoredPdf> {
  if (!(await fileExists(sourcePdfPath))) {
    throw new Error("Compiled PDF not found");
  }

  const stat = await fsPromises.stat(sourcePdfPath);
  if (stat.size < 128) {
    throw new Error(`Compiled PDF is empty or invalid (${stat.size} bytes)`);
  }

  const header = Buffer.alloc(5);
  const fd = await fsPromises.open(sourcePdfPath, "r");
  try {
    await fd.read(header, 0, 5, 0);
  } finally {
    await fd.close();
  }
  if (header.toString("ascii") !== "%PDF-") {
    throw new Error("Compiled file is not a valid PDF");
  }

  await fsPromises.mkdir(LATEX_PDF_UPLOAD_DIR, { recursive: true });

  const safeFileName = fileName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const outputFileName = `${safeFileName}.pdf`;
  const targetPath = path.join(LATEX_PDF_UPLOAD_DIR, outputFileName);

  await fsPromises.copyFile(sourcePdfPath, targetPath);
  const publicUrl = await persistAtPublicRelative(
    targetPath,
    `latex/pdfs/${outputFileName}`,
    "application/pdf"
  );

  return {
    absolutePath: targetPath,
    publicUrl,
  };
}

export async function storeCompiledPdf(
  workspaceId: string,
  fileName: string,
  options: CompileOptions = {}
): Promise<StoredPdf> {
  const workspaceDir = getWorkspaceDir(workspaceId, options.workspaceSubdir);
  const sourcePath = path.join(workspaceDir, "main.pdf");
  return storeCompiledPdfFromPath(sourcePath, fileName);
}

// Helper function to create project files from frontend input
export function createProjectFiles(files: Array<{filename: string, content: string}>): ProjectFile[] {
  return files.map(file => {
    const ext = path.extname(file.filename).toLowerCase();
    let type: ProjectFile['type'] = 'other';
    
    if (ext === '.tex') type = 'tex';
    else if (ext === '.bib') type = 'bib';
    else if (ext === '.sty') type = 'sty';
    else if (ext === '.cls') type = 'cls';
    else if (['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.svg', '.mp4', '.webm', '.mov', '.webp'].includes(ext)) type = 'image';
    
    return {
      filename: file.filename,
      content: file.content,
      type
    };
  });
}
