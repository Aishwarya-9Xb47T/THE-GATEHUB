/**
 * Canonical classroom visuals:
 *   original PPTX bytes → LibreOffice Impress headless → PDF → PNG → SVG wrapper
 *
 * Google Slides and direct PPTX uploads share this path (Google may supply a
 * native PDF, which skips only the PPTX→PDF stage).
 */
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isValidRenderedSvg, withDeadline, type PresentationRenderResult, type SlideRenderResult } from './presentationRenderService.js';

const PDF_CONVERT_TIMEOUT_MS = 120_000;
const PAGE_RENDER_TIMEOUT_MS = 45_000;
const LOG_TEXT_LIMIT = 4_000;

const JAVA_DISABLE_REGISTRY = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <item oor:path="/org.openoffice.Office.Common/Misc"><prop oor:name="UseJava" oor:op="fuse"><value>false</value></prop></item>
</oor:items>
`;

export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function classroomRenderLog(fields: Record<string, string | number | boolean | undefined | null>) {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value.replace(/\s+/g, ' ').slice(0, LOG_TEXT_LIMIT) : value}`);
  console.info(`[CLASSROOM_RENDER] ${parts.join(' ')}`);
}

function firstExisting(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

function safeSegment(value: string | undefined): string {
  const cleaned = String(value || 'anon').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return cleaned || 'anon';
}

export function libreOfficeExecutable(): string | null {
  const fromEnv = process.env.LIBREOFFICE_PATH?.trim() || process.env.SOFFICE_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return firstExisting([
    '/usr/bin/soffice',
    '/usr/lib/libreoffice/program/soffice',
    '/usr/bin/libreoffice',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ]);
}

export function pdfToCairoExecutable(): string | null {
  const fromEnv = process.env.PDFTOCAIRO_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return firstExisting(['/usr/bin/pdftocairo', '/usr/local/bin/pdftocairo']);
}

export function pdfToPpmExecutable(): string | null {
  const fromEnv = process.env.PDFTOPPM_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return firstExisting(['/usr/bin/pdftoppm', '/usr/local/bin/pdftoppm']);
}

export function pdfInfoExecutable(): string | null {
  return firstExisting(['/usr/bin/pdfinfo', '/usr/local/bin/pdfinfo']);
}

export function pdfToTextExecutable(): string | null {
  return firstExisting(['/usr/bin/pdftotext', '/usr/local/bin/pdftotext']);
}

export function javaExecutable(): string | null {
  return firstExisting([
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, process.platform === 'win32' ? 'bin\\java.exe' : 'bin/java') : '',
    '/usr/bin/java',
    '/usr/lib/jvm/default-java/bin/java',
  ]);
}

export function libreOfficeProgramDir(): string | null {
  const soffice = libreOfficeExecutable();
  return firstExisting([
    '/usr/lib/libreoffice/program',
    soffice && !['/usr/bin', '/usr/local/bin'].includes(path.dirname(soffice)) ? path.dirname(soffice) : '',
  ]);
}

export function javaldxExecutable(): string | null {
  const programDir = libreOfficeProgramDir() || '';
  return firstExisting([
    '/usr/lib/libreoffice/program/javaldx',
    programDir ? path.join(programDir, 'javaldx') : '',
    programDir ? path.join(programDir, 'javaldx.exe') : '',
  ]);
}

export function detectJavaHome(): string | null {
  const fromEnv = process.env.JAVA_HOME?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return firstExisting([
    '/usr/lib/jvm/default-java',
    '/usr/lib/jvm/java-17-openjdk-amd64',
    '/usr/lib/jvm/java-21-openjdk-amd64',
    '/usr/lib/jvm/java-17-openjdk-arm64',
    '/usr/lib/jvm/java-21-openjdk-arm64',
  ]);
}

export function describeLibreOfficeTools() {
  return {
    soffice: libreOfficeExecutable(),
    pdftocairo: pdfToCairoExecutable(),
    pdftoppm: pdfToPpmExecutable(),
    pdfinfo: pdfInfoExecutable(),
    pdftotext: pdfToTextExecutable(),
    java: javaExecutable(),
    javaldx: javaldxExecutable(),
    javaHome: detectJavaHome(),
    available: Boolean(libreOfficeExecutable() && (pdfToCairoExecutable() || pdfToPpmExecutable())),
  };
}

export function libreOfficeUserInstallationArg(profileDir: string): string {
  const href = pathToFileURL(profileDir).href.replace(/\/+$/, '');
  return `-env:UserInstallation=${href}`;
}

export function buildLibreOfficeConvertArgs(args: {
  profileDir: string;
  outputDir: string;
  pptxPath: string;
  filter?: string;
}): string[] {
  return [
    libreOfficeUserInstallationArg(args.profileDir),
    '--headless',
    '--norestore',
    '--nolockcheck',
    '--nodefault',
    '--nofirststartwizard',
    '--nologo',
    '--convert-to',
    args.filter ?? 'pdf',
    '--outdir',
    args.outputDir,
    args.pptxPath,
  ];
}

export function parsePdfPageCount(info: string): number {
  const match = info.match(/Pages:\s+(\d+)/i);
  return match ? Number(match[1]) : 0;
}

export function parsePdfPageCountFromBuffer(pdf: Buffer): number {
  const text = pdf.toString('latin1');
  const typed = [...text.matchAll(/\/Type\s*\/Pages[\s\S]{0,180}?\/Count\s+(\d+)/g)].map((match) => Number(match[1]));
  if (typed.length) return Math.max(...typed);
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((match) => Number(match[1]));
  return counts.length ? Math.max(...counts) : 0;
}

async function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
  options?: { cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: options?.cwd,
      env: options?.env ?? process.env,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      const error = new Error(`CLASSROOM_RENDER_TIMEOUT command=${path.basename(command)} after ${timeoutMs}ms`);
      (error as Error & { code?: string }).code = 'CLASSROOM_RENDER_TIMEOUT';
      reject(error);
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      if (stdout.length < 32_000) stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 32_000) stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

export function pngDimensions(buffer: Buffer): { width: number; height: number } {
  if (buffer.length < 24 || buffer[0] !== 0x89 || buffer[1] !== 0x50) {
    throw new Error('CLASSROOM_RENDER_INVALID_SVG not a PNG buffer');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export function wrapPngAsSvg(png: Buffer): string {
  const { width, height } = pngDimensions(png);
  const href = `data:image/png;base64,${png.toString('base64')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image href="${href}" xlink:href="${href}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/></svg>`;
}

function previewSvg(text: string): string {
  return text.replace(/\s+/g, ' ').slice(0, 200);
}

function fontConfigPath(): string | undefined {
  if (process.env.FONTCONFIG_PATH && existsSync(process.env.FONTCONFIG_PATH)) return process.env.FONTCONFIG_PATH;
  if (existsSync('/etc/fonts')) return '/etc/fonts';
  return undefined;
}

export function readLibreOfficeVersionFile(): string | null {
  const programDir = libreOfficeProgramDir();
  const versionrc = firstExisting([
    programDir ? path.join(programDir, 'versionrc') : '',
    '/usr/lib/libreoffice/program/versionrc',
  ]);
  if (!versionrc) return null;
  try {
    const text = readFileSync(versionrc, 'utf8');
    const major = text.match(/ProductMajor\s*=\s*(\d+)/i)?.[1];
    const minor = text.match(/ProductMinor\s*=\s*(\d+)/i)?.[1];
    const micro = text.match(/ProductMicro\s*=\s*(\d+)/i)?.[1];
    if (major) return `LibreOffice ${major}.${minor || '0'}.${micro || '0'} (${versionrc})`;
  } catch {
    return null;
  }
  return null;
}

export function libreOfficeJobEnv(workDir: string): NodeJS.ProcessEnv {
  const javaHome = detectJavaHome();
  const fonts = fontConfigPath();
  const programDir = libreOfficeProgramDir();
  const libraryPath = [programDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(path.delimiter);
  return {
    ...process.env,
    HOME: workDir,
    TMPDIR: workDir,
    TEMP: workDir,
    TMP: workDir,
    LANG: process.env.LANG || 'C.UTF-8',
    LC_ALL: process.env.LC_ALL || 'C.UTF-8',
    SAL_DISABLE_JAVA: '1',
    SAL_DISABLE_OPENCL: '1',
    ...(process.platform !== 'win32' && libraryPath ? { LD_LIBRARY_PATH: libraryPath } : {}),
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
    ...(fonts ? { FONTCONFIG_PATH: fonts } : {}),
  };
}

export async function writeLibreOfficeProfile(profileDir: string): Promise<void> {
  const userDir = path.join(profileDir, 'user');
  await mkdir(userDir, { recursive: true });
  await writeFile(path.join(userDir, 'registrymodifications.xcu'), JAVA_DISABLE_REGISTRY, 'utf8');
}

async function findNamedFile(dir: string, predicate: (name: string) => boolean): Promise<string | null> {
  try {
    const files = await readdir(dir);
    const match = files.find(predicate);
    return match ? path.join(dir, match) : null;
  } catch {
    return null;
  }
}

export async function describeLibreOfficeRuntime(): Promise<{
  soffice: string | null;
  sofficeVersion: string;
  java: string | null;
  javaVersion: string;
  javaHome: string | null;
  javaldx: string | null;
  pdftocairo: string | null;
  pdftoppm: string | null;
  pdfinfo: string | null;
  pdftotext: string | null;
  home: string;
  tmp: string;
  temp: string;
  path: string;
  cwd: string;
  user: string;
}> {
  const tools = describeLibreOfficeTools();
  let sofficeVersion = tools.soffice ? readLibreOfficeVersionFile() || 'unknown' : 'missing';
  let javaVersion = tools.java ? 'unknown' : 'missing';
  if (tools.soffice && sofficeVersion === 'unknown') {
    const probeDir = path.join(os.tmpdir(), `classroom-lo-version-${randomUUID()}`);
    try {
      await mkdir(path.join(probeDir, 'profile'), { recursive: true });
      const result = await runCommand(
        tools.soffice,
        [libreOfficeUserInstallationArg(path.join(probeDir, 'profile')), '--headless', '--version'],
        20_000,
        { env: libreOfficeJobEnv(probeDir) },
      );
      sofficeVersion = (result.stdout || result.stderr).replace(/\s+/g, ' ').trim().slice(0, 240) || 'unknown';
    } catch (error) {
      sofficeVersion = error instanceof Error ? error.message.slice(0, 240) : 'version-failed';
    } finally {
      await rm(probeDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  if (tools.java) {
    try {
      const result = await runCommand(tools.java, ['-version'], 10_000);
      javaVersion = (result.stderr || result.stdout).replace(/\s+/g, ' ').trim().slice(0, 240) || 'unknown';
    } catch (error) {
      javaVersion = error instanceof Error ? error.message.slice(0, 240) : 'version-failed';
    }
  }
  let user = 'unknown';
  try {
    user = os.userInfo().username;
  } catch {
    user = process.env.USER || process.env.USERNAME || 'unknown';
  }
  return {
    soffice: tools.soffice,
    sofficeVersion,
    java: tools.java,
    javaVersion,
    javaHome: tools.javaHome,
    javaldx: tools.javaldx,
    pdftocairo: tools.pdftocairo,
    pdftoppm: tools.pdftoppm,
    pdfinfo: tools.pdfinfo,
    pdftotext: tools.pdftotext,
    home: process.env.HOME || '',
    tmp: process.env.TMP || process.env.TMPDIR || os.tmpdir(),
    temp: process.env.TEMP || '',
    path: process.env.PATH || '',
    cwd: process.cwd(),
    user,
  };
}

async function renderPdfPageToSvg(args: {
  pdfPath: string;
  page: number;
  outputDir: string;
  pdftocairo: string | null;
  pdftoppm: string | null;
}): Promise<{ svg: string; via: 'pdftoppm-png' | 'pdftocairo-png' | 'pdftocairo'; pngPath?: string }> {
  const prefix = path.join(args.outputDir, `slide-${String(args.page).padStart(3, '0')}`);
  const pngPrefix = `${prefix}-png`;
  const pngCandidates = (base: string) => [
    `${base}.png`,
    `${base}-${args.page}.png`,
    `${base}-1.png`,
    `${base}-01.png`,
    `${base}-000001.png`,
    base,
  ];

  const loadPng = async (result: { exitCode: number; stderr: string }, bases: string[], via: 'pdftoppm-png' | 'pdftocairo-png') => {
    let pngPath = bases.map((base) => pngCandidates(base)).flat().find((candidate) => existsSync(candidate));
    if (!pngPath) {
      pngPath = (await findNamedFile(args.outputDir, (name) => name.startsWith(`slide-${String(args.page).padStart(3, '0')}`) && name.endsWith('.png'))) ?? undefined;
    }
    if (result.exitCode !== 0 || !pngPath || !existsSync(pngPath)) {
      throw new Error(
        `PDF_RENDER_FAILED page=${args.page} exit=${result.exitCode} ${result.stderr.slice(0, 220)}`,
      );
    }
    const png = await readFile(pngPath);
    const svg = wrapPngAsSvg(png);
    if (!isValidRenderedSvg(svg)) {
      throw new Error('CLASSROOM_RENDER_INVALID_SVG PNG wrap did not produce valid SVG');
    }
    return { svg, via, pngPath };
  };

  if (args.pdftoppm) {
    try {
      const pngResult = await runCommand(
        args.pdftoppm,
        ['-png', '-singlefile', '-r', '144', '-f', String(args.page), '-l', String(args.page), args.pdfPath, pngPrefix],
        PAGE_RENDER_TIMEOUT_MS,
      );
      return await loadPng(pngResult, [pngPrefix], 'pdftoppm-png');
    } catch (error) {
      if (!args.pdftocairo) throw error;
    }
  }

  if (args.pdftocairo) {
    const cairoPngPrefix = `${prefix}-cairo`;
    const pngResult = await runCommand(
      args.pdftocairo,
      ['-png', '-singlefile', '-r', '144', '-f', String(args.page), '-l', String(args.page), args.pdfPath, cairoPngPrefix],
      PAGE_RENDER_TIMEOUT_MS,
    );
    try {
      return await loadPng(pngResult, [cairoPngPrefix], 'pdftocairo-png');
    } catch {
      const svgResult = await runCommand(
        args.pdftocairo,
        ['-svg', '-singlefile', '-f', String(args.page), '-l', String(args.page), args.pdfPath, prefix],
        PAGE_RENDER_TIMEOUT_MS,
      );
      const svgPath =
        [`${prefix}.svg`, `${prefix}.svg.svg`, `${prefix}-1.svg`, prefix].find((candidate) => existsSync(candidate))
        ?? await findNamedFile(args.outputDir, (name) => name.startsWith(`slide-${String(args.page).padStart(3, '0')}`) && name.endsWith('.svg'));
      if (svgResult.exitCode === 0 && svgPath && existsSync(svgPath)) {
        const svg = await readFile(svgPath, 'utf8');
        if (isValidRenderedSvg(svg)) return { svg, via: 'pdftocairo' };
      }
      throw new Error(`PDF_RENDER_FAILED pdftocairo page=${args.page} exit=${svgResult.exitCode} ${svgResult.stderr.slice(0, 220)}`);
    }
  }

  throw new Error('PDF_RENDER_FAILED pdftoppm and pdftocairo are missing');
}

async function convertPptxToPdf(args: {
  soffice: string;
  pptxPath: string;
  workDir: string;
  profileDir: string;
  outputDir: string;
  sha256: string;
  presentationId?: string;
}): Promise<{ pdfPath: string; pdfBytes: number; pageCount: number; pdfText: string }> {
  const env = libreOfficeJobEnv(args.workDir);
  await writeLibreOfficeProfile(args.profileDir);
  const filters = ['pdf', 'pdf:impress_pdf_Export'];
  let last = { stdout: '', stderr: '', exitCode: 1, command: '', filter: '' };
  let pdfPath = path.join(args.outputDir, 'source.pdf');

  for (const filter of filters) {
    const convertArgs = buildLibreOfficeConvertArgs({
      profileDir: args.profileDir,
      outputDir: args.outputDir,
      pptxPath: args.pptxPath,
      filter,
    });
    classroomRenderLog({
      presentation: args.presentationId,
      stage: 'pptx-to-pdf',
      status: 'start',
      filter,
      executable: args.soffice,
      command: `${path.basename(args.soffice)} ${convertArgs.join(' ')}`,
      cwd: args.workDir,
      input: args.pptxPath,
      outputDir: args.outputDir,
      profile: args.profileDir,
      inputSha256: args.sha256,
      SAL_DISABLE_JAVA: env.SAL_DISABLE_JAVA,
      SAL_USE_VCLPLUGIN: env.SAL_USE_VCLPLUGIN,
      HOME: env.HOME,
    });
    const convert = await withDeadline(
      runCommand(args.soffice, convertArgs, PDF_CONVERT_TIMEOUT_MS, { cwd: args.workDir, env }),
      PDF_CONVERT_TIMEOUT_MS + 5_000,
      'CLASSROOM_RENDER_TIMEOUT',
      'CLASSROOM_RENDER_TIMEOUT stage=LIBREOFFICE_CONVERT',
    );
    last = { ...convert, command: `${args.soffice} ${convertArgs.join(' ')}`, filter };
    const found = (await findNamedFile(args.outputDir, (name) => name.toLowerCase().endsWith('.pdf'))) ?? pdfPath;
    if (existsSync(found)) pdfPath = found;
    classroomRenderLog({
      presentation: args.presentationId,
      stage: 'pptx-to-pdf',
      filter,
      exitCode: convert.exitCode,
      stdout: convert.stdout.slice(0, LOG_TEXT_LIMIT),
      stderr: convert.stderr.slice(0, LOG_TEXT_LIMIT),
      pdfExists: existsSync(pdfPath),
    });
    if (existsSync(pdfPath)) break;
  }

  if (!existsSync(pdfPath)) {
    const message = [
      'LIBREOFFICE_CONVERSION_FAILED',
      `exit=${last.exitCode}`,
      `executable=${args.soffice}`,
      `command=${last.command}`,
      `stderr=${last.stderr.slice(0, 800)}`,
      `stdout=${last.stdout.slice(0, 400)}`,
    ].join(' ');
    const error = new Error(message);
    (error as Error & { code?: string }).code = 'LIBREOFFICE_CONVERSION_FAILED';
    throw error;
  }

  const pdf = await readFile(pdfPath);
  let pageCount = 0;
  const pdfinfo = pdfInfoExecutable();
  if (pdfinfo) {
    const info = await runCommand(pdfinfo, [pdfPath], 15_000);
    pageCount = parsePdfPageCount(`${info.stdout}\n${info.stderr}`);
  }
  if (pageCount < 1) pageCount = parsePdfPageCountFromBuffer(pdf);
  let pdfText = '';
  const pdftotext = pdfToTextExecutable();
  if (pdftotext) {
    const textFile = path.join(args.outputDir, 'source.txt');
    await runCommand(pdftotext, ['-layout', pdfPath, textFile], 15_000);
    if (existsSync(textFile)) pdfText = await readFile(textFile, 'utf8');
  }

  classroomRenderLog({
    presentation: args.presentationId,
    stage: 'pptx-to-pdf',
    status: 'success',
    pdfBytes: pdf.length,
    pdfPages: pageCount,
    pdfPath,
    javaldxWarning: /javaldx/i.test(last.stderr),
  });

  return { pdfPath, pdfBytes: pdf.length, pageCount, pdfText };
}

export async function renderPresentationSlidesLibreOffice(
  pptxBuffer: Buffer,
  outputDir: string,
  options?: {
    skipIndexes?: Iterable<number>;
    onProgress?: (event: { slide: number; total: number }) => void | Promise<void>;
    onSlideRendered?: (render: SlideRenderResult) => void | Promise<void>;
    presentationId?: string;
    maxSlides?: number;
    pdfBuffer?: Buffer;
    sourceSha256?: string;
  },
): Promise<PresentationRenderResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const method = 'libreoffice-pdf' as const;
  const skipIndexes = new Set([...(options?.skipIndexes ?? [])]);
  const presentationId = options?.presentationId;
  const tools = describeLibreOfficeTools();
  const log = (fields: Record<string, string | number | boolean | undefined | null>) =>
    classroomRenderLog({ presentation: presentationId, method, ...fields });

  const inputSha256 = sha256Hex(pptxBuffer);
  log({
    stage: 'RENDER_START',
    status: 'start',
    pptxBytes: pptxBuffer.length,
    inputSha256,
    sourceSha256: options?.sourceSha256,
    directPdf: Boolean(options?.pdfBuffer),
  });

  if (options?.sourceSha256 && options.sourceSha256 !== inputSha256) {
    const error = 'CLASSROOM_RENDER_SOURCE_FAILED render input SHA-256 does not match the stored PPTX source';
    log({
      stage: 'SHA256_MISMATCH',
      status: 'failure',
      errorCode: 'CLASSROOM_RENDER_SOURCE_FAILED',
      sourceSha256: options.sourceSha256,
      inputSha256,
      inputBytes: pptxBuffer.length,
    });
    return { success: false, slideCount: 0, renders: [], warnings, errors: [error], method };
  }

  if (!options?.pdfBuffer && !tools.soffice) {
    const error = 'LIBREOFFICE_UNAVAILABLE LibreOffice (soffice) is not installed in this image';
    log({ stage: 'RENDER_START', status: 'failure', errorCode: 'LIBREOFFICE_UNAVAILABLE', errorMessage: error });
    return { success: false, slideCount: 0, renders: [], warnings, errors: [error], method };
  }
  if (!tools.pdftocairo && !tools.pdftoppm) {
    const error = 'PDF_RENDER_FAILED poppler-utils (pdftocairo/pdftoppm) is not installed in this image';
    log({ stage: 'RENDER_START', status: 'failure', errorCode: 'PDF_RENDER_FAILED', errorMessage: error });
    return { success: false, slideCount: 0, renders: [], warnings, errors: [error], method };
  }

  if (!options?.pdfBuffer && (pptxBuffer.length < 4 || pptxBuffer[0] !== 0x50 || pptxBuffer[1] !== 0x4b)) {
    log({ stage: 'PPTX_VALIDATED', status: 'failure', errorCode: 'CLASSROOM_RENDER_SOURCE_FAILED', errorMessage: 'Invalid PPTX buffer (missing ZIP signature)' });
    return {
      success: false,
      slideCount: 0,
      renders: [],
      warnings,
      errors: ['CLASSROOM_RENDER_SOURCE_FAILED: Invalid PPTX buffer (missing ZIP signature)'],
      method,
    };
  }

  await mkdir(outputDir, { recursive: true });
  const jobId = randomUUID();
  const workDir = path.join(os.tmpdir(), 'classroom-render', safeSegment(presentationId), jobId);
  const profileDir = path.join(workDir, 'profile');
  const convertDir = path.join(workDir, 'output');
  await mkdir(convertDir, { recursive: true });
  await mkdir(profileDir, { recursive: true });

  let pdfPath = path.join(convertDir, 'source.pdf');
  let pdfBytes = 0;
  let pdfText = '';
  try {
    if (options?.pdfBuffer && options.pdfBuffer.length > 100 && options.pdfBuffer.subarray(0, 4).equals(Buffer.from('%PDF'))) {
      await writeFile(pdfPath, options.pdfBuffer);
      pdfBytes = options.pdfBuffer.length;
      log({ stage: 'DIRECT_PDF_LOADED', status: 'success', bytes: options.pdfBuffer.length });
    } else {
      const pptxPath = path.join(workDir, 'source.pptx');
      await writeFile(pptxPath, pptxBuffer);
      const written = await readFile(pptxPath);
      const writtenSha = sha256Hex(written);
      console.info('[CLASSROOM_SOURCE]', {
        presentationId,
        bytes: pptxBuffer.length,
        sha256: inputSha256,
      });
      console.info('[CLASSROOM_RENDER]', {
        presentationId,
        inputBytes: written.length,
        inputSha256: writtenSha,
      });
      if (writtenSha !== inputSha256) {
        const error = 'CLASSROOM_RENDER_SOURCE_FAILED written PPTX SHA-256 does not match render input';
        log({ stage: 'SHA256_MISMATCH', status: 'failure', errorCode: 'CLASSROOM_RENDER_SOURCE_FAILED', inputSha256, writtenSha });
        return { success: false, slideCount: 0, renders: [], warnings, errors: [error], method };
      }
      log({ stage: 'PPTX_SOURCE_LOADED', status: 'success', bytes: pptxBuffer.length, sha256: inputSha256, soffice: tools.soffice });
      const runtime = await describeLibreOfficeRuntime();
      log({
        stage: 'LIBREOFFICE_RUNTIME',
        executable: runtime.soffice,
        version: runtime.sofficeVersion,
        java: runtime.java,
        javaVersion: runtime.javaVersion,
        javaHome: runtime.javaHome,
        javaldx: runtime.javaldx,
        home: runtime.home,
        tmp: runtime.tmp,
        cwd: workDir,
        user: runtime.user,
      });
      try {
        const converted = await convertPptxToPdf({
          soffice: tools.soffice!,
          pptxPath,
          workDir,
          profileDir,
          outputDir: convertDir,
          sha256: inputSha256,
          presentationId,
        });
        pdfPath = converted.pdfPath;
        pdfBytes = converted.pdfBytes;
        pdfText = converted.pdfText;
        if (converted.pageCount < 1) {
          const error = 'LIBREOFFICE_CONVERSION_FAILED PDF was produced but page count could not be determined';
          log({ stage: 'pptx-to-pdf', status: 'failure', errorCode: 'LIBREOFFICE_CONVERSION_FAILED', errorMessage: error });
          return { success: false, slideCount: 0, renders: [], warnings, errors: [error], method };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = /TIMEOUT/.test(message) ? 'CLASSROOM_RENDER_TIMEOUT' : 'LIBREOFFICE_CONVERSION_FAILED';
        log({
          stage: 'pptx-to-pdf',
          status: 'failure',
          errorCode: code,
          errorMessage: message.slice(0, 1200),
        });
        return { success: false, slideCount: 0, renders: [], warnings, errors: [message], method };
      }
    }

    let pageCount = 0;
    if (tools.pdfinfo) {
      const info = await runCommand(tools.pdfinfo, [pdfPath], 15_000);
      pageCount = parsePdfPageCount(`${info.stdout}\n${info.stderr}`);
    }
    if (pageCount < 1 && existsSync(pdfPath)) {
      pageCount = parsePdfPageCountFromBuffer(await readFile(pdfPath));
    }
    if (pageCount < 1) {
      const error = 'PDF_RENDER_FAILED could not determine PDF page count';
      log({ stage: 'PDF_READY', status: 'failure', errorCode: 'PDF_RENDER_FAILED', errorMessage: error });
      return { success: false, slideCount: 0, renders: [], warnings, errors: [error], method };
    }
    const lastPage = Math.min(pageCount, options?.maxSlides && options.maxSlides > 0 ? options.maxSlides : pageCount);
    log({ stage: 'PDF_READY', status: 'success', pages: pageCount, requested: lastPage });

    const renders: SlideRenderResult[] = [];
    for (let index = 0; index < lastPage; index += 1) {
      const slide = index + 1;
      if (skipIndexes.has(index)) {
        log({ stage: 'SLIDE_COMPLETE', slide, skipped: true, status: 'success' });
        continue;
      }
      const started = Date.now();
      log({ stage: 'RENDER_API_CALLED', slide, status: 'start' });
      try {
        await options?.onProgress?.({ slide, total: pageCount });
        const pageSvg = await renderPdfPageToSvg({
          pdfPath,
          page: slide,
          outputDir: convertDir,
          pdftocairo: tools.pdftocairo,
          pdftoppm: tools.pdftoppm,
        });
        log({
          stage: 'RENDER_OUTPUT_RECEIVED',
          slide,
          status: 'success',
          bytes: pageSvg.svg.length,
          via: pageSvg.via,
          png: pageSvg.pngPath,
          preview: previewSvg(pageSvg.svg),
        });
        if (!isValidRenderedSvg(pageSvg.svg)) {
          throw new Error('CLASSROOM_RENDER_INVALID_SVG output failed validation');
        }
        const fileName = `slide-${String(slide).padStart(3, '0')}.svg`;
        const diskPath = path.join(outputDir, fileName);
        await writeFile(diskPath, pageSvg.svg, 'utf8');
        if (pageSvg.pngPath && existsSync(pageSvg.pngPath)) {
          await writeFile(path.join(outputDir, `slide-${String(slide).padStart(3, '0')}.png`), await readFile(pageSvg.pngPath));
        }
        const render: SlideRenderResult = {
          index,
          path: `renders/${fileName}`,
          svgLength: pageSvg.svg.length,
          svgText: pageSvg.svg,
        };
        renders.push(render);
        if (options?.onSlideRendered) {
          log({ stage: 'B2_UPLOAD_STARTED', slide, status: 'start' });
          const uploadStarted = Date.now();
          try {
            await options.onSlideRendered(render);
          } catch (uploadError) {
            const message = uploadError instanceof Error ? uploadError.message : String(uploadError);
            const wrapped = new Error(`B2_UPLOAD_FAILED slide=${slide} ${message.slice(0, 180)}`);
            (wrapped as Error & { code?: string }).code = 'B2_UPLOAD_FAILED';
            throw wrapped;
          }
          log({ stage: 'B2_UPLOAD_COMPLETE', slide, status: 'success', durationMs: Date.now() - uploadStarted });
        }
        log({
          stage: 'SLIDE_COMPLETE',
          slide,
          total: pageCount,
          status: 'success',
          durationMs: Date.now() - started,
          bytes: render.svgLength,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = /TIMEOUT/.test(message)
          ? 'CLASSROOM_RENDER_TIMEOUT'
          : /INVALID_SVG/.test(message)
            ? 'CLASSROOM_RENDER_INVALID_SVG'
            : /B2_UPLOAD_FAILED/.test(message)
              ? 'B2_UPLOAD_FAILED'
              : 'PDF_RENDER_FAILED';
        errors.push(`${code} slide=${slide} reason=${message.slice(0, 400)}`);
        log({
          stage: 'SLIDE_COMPLETE',
          slide,
          status: 'failure',
          errorCode: code,
          errorMessage: message.slice(0, 800),
          durationMs: Date.now() - started,
        });
      }
    }

    const newlyExpected = lastPage - [...skipIndexes].filter((index) => index >= 0 && index < lastPage).length;
    log({
      complete: true,
      requested: newlyExpected,
      rendered: renders.length,
      failed: errors.length,
      skipped: skipIndexes.size,
      method,
      status: renders.length === newlyExpected && errors.length === 0 ? 'success' : 'failure',
    });
    return {
      success: renders.length === newlyExpected && errors.length === 0,
      slideCount: pageCount,
      renders,
      warnings,
      errors,
      method,
      pdfBytes,
      pdfText,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function runLibreOfficeRendererSmoke(pptxBuffer: Buffer): Promise<{
  ok: boolean;
  reason?: string;
  runtime: Awaited<ReturnType<typeof describeLibreOfficeRuntime>>;
  inputSha256: string;
  pdfPages: number;
  pdfBytes: number;
  pdfText: string;
  renderedSlides: number;
  pngCount: number;
  errors: string[];
}> {
  const runtime = await describeLibreOfficeRuntime();
  const inputSha256 = sha256Hex(pptxBuffer);
  const outputDir = path.join(os.tmpdir(), `classroom-smoke-${randomUUID()}`);
  await mkdir(outputDir, { recursive: true });
  try {
    const result = await renderPresentationSlidesLibreOffice(pptxBuffer, outputDir, {
      presentationId: 'renderer-smoke',
      sourceSha256: inputSha256,
    });
    const files = await readdir(outputDir).catch(() => []);
    const pngCount = files.filter((name) => name.endsWith('.png')).length;
    return {
      ok: result.success && result.slideCount > 0 && result.renders.length === result.slideCount,
      runtime,
      inputSha256,
      pdfPages: result.slideCount,
      pdfBytes: result.pdfBytes ?? 0,
      pdfText: result.pdfText ?? '',
      renderedSlides: result.renders.length,
      pngCount,
      errors: result.errors,
      reason: result.success ? undefined : result.errors[0],
    };
  } finally {
    await rm(outputDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
