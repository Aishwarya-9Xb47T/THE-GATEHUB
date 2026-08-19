/**
 * Faithful presentation visual rendering.
 *
 * pptx-svg 0.4.5 API (browser / Wasm GC only — not instantiable in Node):
 *   const renderer = new PptxRenderer();
 *   await renderer.init(wasmUrl | ArrayBuffer);
 *   await renderer.loadPptx(arrayBuffer);
 *   const svg = renderer.renderSlideSvg(0); // sync
 *
 * Production hang (after Chromium launch, before any slide log):
 *   page.evaluate(__initClassroomRenderer) fetched the entire PPTX, inited Wasm,
 *   and ran loadPptx() on Chromium's main thread. loadPptx = ZIP inflate
 *   (DecompressionStream can deadlock on large DEFLATE entries) + initialize_pptx()
 *   (sync Wasm). That froze CDP, so the 240s protocolTimeout hid the stage.
 *
 * This renderer:
 *   - runs pptx-svg inside a dedicated Worker (CDP stays alive)
 *   - patches zip.js inflate to Blob+pipeThrough+Response (no writer/reader deadlock)
 *   - times and logs every stage independently
 *   - renders slide 1 first, then 2…N, persisting each SVG immediately via callback
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser } from 'puppeteer';
import { stripPptxSvgDefaultTableGridLines } from './pptxSvgPostProcess.js';

export const SLIDE_RENDER_TIMEOUT_MS = 90_000;
export const SLIDE_RENDER_TIMEOUT_MAX_MS = 240_000;
export const B2_UPLOAD_TIMEOUT_MS = 60_000;

/** Per-operation deadlines. One giant 240s Promise is how the hang was hidden. */
export const RENDER_STAGE_TIMEOUT_MS = {
  browserLaunch: 45_000,
  pageCreate: 15_000,
  harnessNavigation: 25_000,
  wasmInit: 25_000,
  pptxFetch: 45_000,
  pptxLoad: 60_000,
  renderSlide: 45_000,
} as const;

const DEADLOCK_SAFE_INFLATE = `async function inflate(compressed) {
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}`;

/** Larger decks historically used a long per-slide cap. Stage timeouts above are what actually bound work. */
export function slideTimeoutForPptx(bytes: number, override?: number): number {
  if (override && override > 0) return override;
  const mb = bytes / (1024 * 1024);
  if (mb >= 12) return SLIDE_RENDER_TIMEOUT_MAX_MS;
  if (mb >= 5) return 180_000;
  return SLIDE_RENDER_TIMEOUT_MS;
}

export async function withDeadline<T>(
  promise: Promise<T>,
  ms: number,
  code: string,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(message);
          (error as Error & { code?: string }).code = code;
          reject(error);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface SlideRenderResult {
  index: number;
  path: string;
  svgLength: number;
  svgText?: string;
}

export interface PresentationRenderProgress {
  slide: number;
  total: number;
}

export interface PresentationRenderResult {
  success: boolean;
  slideCount: number;
  renders: SlideRenderResult[];
  warnings: string[];
  errors: string[];
  method: 'puppeteer-pptx-svg' | 'libreoffice-pdf';
}

type ClassroomPageApi = {
  __classroomHarnessReady?: boolean;
  __hangSlide: number;
  __classroomBoot: () => Promise<unknown>;
  __classroomInitWasm: () => Promise<unknown>;
  __classroomFetchPptx: () => Promise<{ bytes?: number }>;
  __classroomLoadPptx: () => Promise<{ slideCount?: number }>;
  __classroomRenderSlide: (index: number) => Promise<{ ok?: boolean; error?: string; bytes?: number; index?: number }>;
};

function classroomRenderLog(fields: RenderLogFields) {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`);
  console.info(`[CLASSROOM_RENDER] ${parts.join(' ')}`);
}

function windowsChromeCandidates(): string[] {
  if (process.platform !== 'win32') return [];
  const localApp = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  return [
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    localApp ? path.join(localApp, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
    path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].filter(Boolean);
}

export function chromeExecutablePath(): string | undefined {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const candidate of [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/lib/chromium/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    ...windowsChromeCandidates(),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export function pptxSvgDistDir(): string | null {
  const start = path.dirname(fileURLToPath(import.meta.url));
  let dir = start;
  while (true) {
    const candidate = path.join(dir, 'node_modules', 'pptx-svg', 'dist');
    if (existsSync(path.join(candidate, 'index.js')) && existsSync(path.join(candidate, 'main.wasm'))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  try {
    const require = createRequire(import.meta.url);
    const pkgJson = require.resolve('pptx-svg/package.json');
    const distDir = path.join(path.dirname(pkgJson), 'dist');
    if (existsSync(path.join(distDir, 'index.js')) && existsSync(path.join(distDir, 'main.wasm'))) {
      return distDir;
    }
  } catch {
    /* exports map may block package.json resolution */
  }
  return null;
}

export function pptxSvgPackageVersion(distDir = pptxSvgDistDir()): string | null {
  if (!distDir) return null;
  const pkgPath = path.join(distDir, '..', 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string; version?: string };
    if (pkg.name === 'pptx-svg' && pkg.version) return pkg.version;
  } catch {
    /* ignore */
  }
  return null;
}

export function applyDeadlockSafeInflatePatch(source: string): { patched: string; applied: boolean } {
  const pattern = /async function inflate\(compressed\) \{[\s\S]*?return result;\n\}/;
  if (!pattern.test(source)) {
    return { patched: source, applied: false };
  }
  return { patched: source.replace(pattern, DEADLOCK_SAFE_INFLATE), applied: true };
}

async function patchVendorZipInflate(vendorDir: string): Promise<boolean> {
  const zipPath = path.join(vendorDir, 'zip.js');
  const original = await readFile(zipPath, 'utf8');
  const { patched, applied } = applyDeadlockSafeInflatePatch(original);
  if (!applied) {
    classroomRenderLog({
      stage: 'zip_inflate_patch',
      status: 'failure',
      errorCode: 'CLASSROOM_RENDER_ZIP_PATCH_MISMATCH',
      reason: 'pptx-svg zip.js inflate() source did not match the expected 0.4.5 shape',
    });
    return false;
  }
  await writeFile(zipPath, patched, 'utf8');
  classroomRenderLog({ stage: 'zip_inflate_patch', status: 'success', pptxSvgVersion: pptxSvgPackageVersion() });
  return true;
}

function harnessHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>PPTX Render Harness</title></head>
<body>
<script type="module">
  const ping = (fields) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
    return fetch('/progress?' + params.toString()).catch(() => {});
  };

  let callId = 0;
  const pending = new Map();
  let worker = null;

  const attachWorker = (next) => {
    worker = next;
    worker.onmessage = (event) => {
      const data = event.data || {};
      ping(data);
      const waiter = data.waitId != null ? pending.get(String(data.waitId)) : null;
      if (!waiter) return;
      if (data.terminal) {
        pending.delete(String(data.waitId));
        if (data.ok) waiter.resolve(data);
        else waiter.reject(new Error(data.error || 'Worker stage failed'));
      }
    };
    worker.onerror = (event) => {
      ping({ stage: 'worker_error', status: 'failure', reason: String(event.message || 'worker error') });
    };
  };

  const callWorker = (message, timeoutMs) => new Promise((resolve, reject) => {
    if (!worker) {
      reject(new Error('Render worker is not running'));
      return;
    }
    const waitId = String(++callId);
    const timer = setTimeout(() => {
      pending.delete(waitId);
      reject(Object.assign(new Error('CLASSROOM_RENDER_TIMEOUT waitId=' + waitId + ' type=' + message.type), { code: 'CLASSROOM_RENDER_TIMEOUT' }));
    }, timeoutMs);
    pending.set(waitId, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    worker.postMessage({ ...message, waitId });
  });

  window.__hangSlide = 0;
  window.__classroomBoot = async () => {
    attachWorker(new Worker('/worker.js', { type: 'module' }));
    return { ok: true };
  };
  window.__classroomInitWasm = () => callWorker({ type: 'initWasm' }, 20000);
  window.__classroomFetchPptx = () => callWorker({ type: 'fetchPptx' }, 40000);
  window.__classroomLoadPptx = () => callWorker({ type: 'loadPptx' }, 55000);
  window.__classroomRenderSlide = (index) => callWorker({
    type: 'render',
    index,
    hangSlide: Number(window.__hangSlide || 0),
  }, 40000);
  window.__classroomResetWorker = async () => {
    try { worker && worker.terminate(); } catch {}
    pending.clear();
    attachWorker(new Worker('/worker.js', { type: 'module' }));
    return { ok: true };
  };
  window.__classroomHarnessReady = true;
</script>
</body>
</html>`;
}

function workerJs(): string {
  return `import { PptxRenderer } from '/pptx-svg/index.js';

let renderer = null;
let pptxBuffer = null;

const measureText = (text, fontFace, fontSizePx) => {
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(8, 8);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const quoted = !fontFace || fontFace === 'sans-serif' || fontFace === 'serif' || fontFace === 'monospace'
          ? (fontFace || 'sans-serif')
          : (fontFace.includes(' ') ? "'" + fontFace + "'" : fontFace);
        ctx.font = fontSizePx + 'px ' + quoted;
        return ctx.measureText(text).width;
      }
    }
  } catch {}
  return String(text || '').length * fontSizePx * 0.6;
};

const reply = (waitId, payload) => {
  self.postMessage({ waitId, terminal: true, ...payload });
};

self.onmessage = async (event) => {
  const data = event.data || {};
  const waitId = data.waitId;
  try {
    if (data.type === 'initWasm') {
      self.postMessage({ waitId, stage: 'wasm_init_start', terminal: false });
      renderer = new PptxRenderer({ logLevel: 'warn', measureText });
      await renderer.init('/pptx-svg/main.wasm');
      reply(waitId, { ok: true, stage: 'wasm_init_success' });
      return;
    }
    if (data.type === 'fetchPptx') {
      self.postMessage({ waitId, stage: 'pptx_fetch_start', terminal: false });
      const response = await fetch('/source.pptx');
      if (!response.ok) throw new Error('Failed to read PowerPoint source for rendering HTTP ' + response.status);
      pptxBuffer = await response.arrayBuffer();
      reply(waitId, { ok: true, stage: 'pptx_fetch_success', bytes: pptxBuffer.byteLength });
      return;
    }
    if (data.type === 'loadPptx') {
      if (!renderer) throw new Error('Wasm renderer was not initialized');
      if (!pptxBuffer) throw new Error('PowerPoint bytes were not fetched');
      self.postMessage({ waitId, stage: 'pptx_load_start', slide: 1, terminal: false });
      const { slideCount } = await renderer.loadPptx(pptxBuffer);
      pptxBuffer = null;
      reply(waitId, { ok: true, stage: 'pptx_load_success', slide: 1, slideCount });
      return;
    }
    if (data.type === 'render') {
      if (!renderer) throw new Error('PowerPoint renderer was not initialized');
      const index = Number(data.index);
      const slide = index + 1;
      if (Number(data.hangSlide) === slide) {
        await new Promise(() => {});
      }
      self.postMessage({ waitId, stage: 'render_start', slide, terminal: false });
      self.postMessage({ waitId, stage: 'render_wait_start', slide, terminal: false });
      const svg = renderer.renderSlideSvg(index);
      self.postMessage({ waitId, stage: 'render_wait_success', slide, terminal: false });
      const failed = !svg || svg.startsWith('ERROR:');
      if (failed) {
        reply(waitId, { ok: false, stage: 'svg_extract_failed', slide, error: svg || 'Empty SVG output', bytes: 0 });
        return;
      }
      self.postMessage({ waitId, stage: 'svg_extract_start', slide, bytes: svg.length, terminal: false });
      const saved = await fetch('/save-slide/' + index, {
        method: 'POST',
        headers: { 'Content-Type': 'image/svg+xml' },
        body: svg,
      });
      if (!saved.ok) throw new Error('Failed to persist SVG for slide ' + slide);
      reply(waitId, { ok: true, stage: 'svg_extract_success', slide, index, bytes: svg.length });
      return;
    }
    throw new Error('Unknown worker message ' + data.type);
  } catch (error) {
    reply(waitId, {
      ok: false,
      stage: 'worker_failed',
      error: error && error.message ? error.message : String(error),
    });
  }
};
`;
}

function isSvgMarkup(text: string): boolean {
  const trimmed = text.trimStart().toLowerCase();
  return trimmed.startsWith('<svg') || (trimmed.startsWith('<?xml') && trimmed.includes('<svg'));
}

export function isValidRenderedSvg(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 32) return false;
  if (trimmed.charCodeAt(0) === 0x50 && trimmed.charCodeAt(1) === 0x4b) return false;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('{') || lower.startsWith('[')) return false;
  if (lower.startsWith('<!doctype') || lower.startsWith('<html')) return false;
  if (lower.includes('<html') && !lower.includes('<svg')) return false;
  if (!isSvgMarkup(trimmed) || !lower.includes('<svg')) return false;
  return /viewbox\s*=/.test(lower) || /\bwidth\s*=/.test(lower) || /\bheight\s*=/.test(lower);
}

function mimeForVendor(filePath: string): string {
  if (filePath.endsWith('.wasm')) return 'application/wasm';
  if (filePath.endsWith('.js')) return 'text/javascript';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function startRenderServer(args: {
  pptxBuffer: Buffer;
  vendorDir: string;
  outputDir: string;
  skipIndexes: Set<number>;
  presentationId?: string;
  onProgress?: (event: PresentationRenderProgress) => void | Promise<void>;
}): Promise<{
  origin: string;
  close: () => Promise<void>;
  renders: SlideRenderResult[];
  errors: string[];
}> {
  const renders: SlideRenderResult[] = [];
  const errors: string[] = [];
  const harness = harnessHtml();
  const worker = workerJs();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/progress') {
        const slide = url.searchParams.get('slide');
        classroomRenderLog({
          presentation: args.presentationId,
          stage: url.searchParams.get('stage') || 'progress',
          slide: slide ? Number(slide) : undefined,
          status: url.searchParams.get('status') || undefined,
          bytes: url.searchParams.get('bytes') ? Number(url.searchParams.get('bytes')) : undefined,
          source: 'harness',
        });
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method === 'GET' && url.pathname === '/harness.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(harness);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/worker.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        res.end(worker);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/source.pptx') {
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'Content-Length': String(args.pptxBuffer.length),
        });
        res.end(args.pptxBuffer);
        return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/pptx-svg/')) {
        const rest = url.pathname.slice('/pptx-svg/'.length);
        const diskPath = path.resolve(args.vendorDir, rest);
        const vendorRoot = path.resolve(args.vendorDir);
        if (
          (diskPath !== vendorRoot && !diskPath.startsWith(vendorRoot + path.sep)) ||
          !existsSync(diskPath)
        ) {
          res.writeHead(404);
          res.end();
          return;
        }
        const body = await readFile(diskPath);
        res.writeHead(200, { 'Content-Type': mimeForVendor(diskPath) });
        res.end(body);
        return;
      }
      const save = url.pathname.match(/^\/save-slide\/(\d+)$/);
      if (req.method === 'POST' && save) {
        const index = Number(save[1]);
        const body = await readRequestBody(req);
        const text = body.toString('utf8');
        if (args.skipIndexes.has(index)) {
          res.writeHead(204);
          res.end();
          return;
        }
        if (!text || text.startsWith('ERROR:') || !isValidRenderedSvg(text)) {
          const reason = text.startsWith('ERROR:') ? text.slice(6) : 'No SVG generated';
          errors.push(`Slide ${index + 1}: ${reason.slice(0, 180)}`);
          classroomRenderLog({
            presentation: args.presentationId,
            slide: index + 1,
            status: 'failure',
            errorCode: 'CLASSROOM_RENDER_INVALID_SVG',
            reason: reason.slice(0, 180),
          });
          res.writeHead(204);
          res.end();
          return;
        }
        const cleanedSvg = stripPptxSvgDefaultTableGridLines(text);
        const fileName = `slide-${String(index + 1).padStart(3, '0')}.svg`;
        await writeFile(path.join(args.outputDir, fileName), cleanedSvg, 'utf8');
        renders.push({
          index,
          path: `renders/${fileName}`,
          svgLength: cleanedSvg.length,
          svgText: cleanedSvg,
        });
        classroomRenderLog({
          presentation: args.presentationId,
          slide: index + 1,
          stage: 'svg_extract_success',
          status: 'success',
          bytes: cleanedSvg.length,
          file: fileName,
        });
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      classroomRenderLog({
        presentation: args.presentationId,
        status: 'failure',
        reason: message.slice(0, 180),
        stage: 'render-http',
      });
      res.writeHead(500);
      res.end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Render workspace HTTP server failed to bind');
  }
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    renders,
    errors,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

export function describeClassroomRenderer(): {
  renderer: 'libreoffice-pdf' | 'puppeteer-pptx-svg';
  browserAvailable: boolean;
  chrome: string | null;
  pptxSvg: string | null;
  node: string;
  pptxSvgVersion: string | null;
  pptxSvgApi: string;
  soffice: string | null;
  pdftocairo: string | null;
  pdftoppm: string | null;
} {
  const chrome = chromeExecutablePath() ?? null;
  const pptxSvg = pptxSvgDistDir();
  const soffice = [
    process.env.LIBREOFFICE_PATH?.trim(),
    process.env.SOFFICE_PATH?.trim(),
    '/usr/bin/soffice',
    '/usr/lib/libreoffice/program/soffice',
    '/usr/bin/libreoffice',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ].find((candidate) => candidate && existsSync(candidate)) ?? null;
  const pdftocairo = ['/usr/bin/pdftocairo', '/usr/local/bin/pdftocairo'].find((candidate) => existsSync(candidate)) ?? null;
  const pdftoppm = ['/usr/bin/pdftoppm', '/usr/local/bin/pdftoppm'].find((candidate) => existsSync(candidate)) ?? null;
  return {
    renderer: soffice && (pdftocairo || pdftoppm) ? 'libreoffice-pdf' : 'puppeteer-pptx-svg',
    browserAvailable: Boolean(chrome),
    chrome,
    pptxSvg,
    node: process.version,
    pptxSvgVersion: pptxSvgPackageVersion(pptxSvg),
    pptxSvgApi: 'PptxRenderer.init + loadPptx + renderSlideSvg (pptx-svg 0.4.x)',
    soffice,
    pdftocairo,
    pdftoppm,
  };
}

function errorCodeOf(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code) {
    return String((error as { code?: string }).code);
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout/i.test(message)) return 'CLASSROOM_RENDER_TIMEOUT';
  return fallback;
}

export async function renderPresentationSlides(
  pptxBuffer: Buffer,
  outputDir: string,
  options?: {
    skipIndexes?: Iterable<number>;
    onProgress?: (event: PresentationRenderProgress) => void | Promise<void>;
    onSlideRendered?: (render: SlideRenderResult) => void | Promise<void>;
    slideTimeoutMs?: number;
    hangSlide?: number;
    presentationId?: string;
    maxSlides?: number;
    engine?: 'libreoffice' | 'pptx-svg';
  },
): Promise<PresentationRenderResult> {
  const env = describeClassroomRenderer();
  classroomRenderLog({
    presentation: options?.presentationId,
    renderer: env.renderer,
    soffice: env.soffice,
    pdftocairo: env.pdftocairo,
    pdftoppm: env.pdftoppm,
    pptxSvgVersion: env.pptxSvgVersion,
    chrome: env.chrome,
    pptxBytes: pptxBuffer.length,
  });
  const forcePptxSvg = options?.engine === 'pptx-svg' || Boolean(options?.hangSlide);
  if (!forcePptxSvg && env.soffice && (env.pdftocairo || env.pdftoppm)) {
    const { renderPresentationSlidesLibreOffice } = await import('./presentationLibreOfficeRender.js');
    return renderPresentationSlidesLibreOffice(pptxBuffer, outputDir, options);
  }
  return renderPresentationSlidesPptxSvg(pptxBuffer, outputDir, options);
}

async function renderPresentationSlidesPptxSvg(
  pptxBuffer: Buffer,
  outputDir: string,
  options?: {
    skipIndexes?: Iterable<number>;
    onProgress?: (event: PresentationRenderProgress) => void | Promise<void>;
    onSlideRendered?: (render: SlideRenderResult) => void | Promise<void>;
    slideTimeoutMs?: number;
    hangSlide?: number;
    presentationId?: string;
    maxSlides?: number;
  },
): Promise<PresentationRenderResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const method = 'puppeteer-pptx-svg' as const;
  const skipIndexes = new Set([...(options?.skipIndexes ?? [])]);
  const renderSlideTimeoutMs = options?.slideTimeoutMs && options.slideTimeoutMs > 0
    ? options.slideTimeoutMs
    : RENDER_STAGE_TIMEOUT_MS.renderSlide;
  const env = describeClassroomRenderer();
  const presentationId = options?.presentationId;
  const log = (fields: RenderLogFields) => classroomRenderLog({ presentation: presentationId, ...fields });

  const timed = async <T>(stage: string, slide: number | undefined, timeoutMs: number, fn: () => Promise<T>): Promise<T> => {
    const started = Date.now();
    log({ stage: `${stage}_start`, slide, status: 'start' });
    try {
      const result = await withDeadline(
        fn(),
        timeoutMs,
        'CLASSROOM_RENDER_TIMEOUT',
        `CLASSROOM_RENDER_TIMEOUT stage=${stage}${slide ? ` slide=${slide}` : ''}`,
      );
      log({
        stage: `${stage}_success`,
        slide,
        status: 'success',
        durationMs: Date.now() - started,
      });
      return result;
    } catch (error) {
      const code = errorCodeOf(error, 'CLASSROOM_RENDER_UNKNOWN');
      log({
        stage: `${stage}_failed`,
        slide,
        status: 'failure',
        errorCode: code,
        durationMs: Date.now() - started,
        reason: (error instanceof Error ? error.message : String(error)).slice(0, 180),
      });
      throw error;
    }
  };

  log({
    renderer: env.renderer,
    browserAvailable: env.browserAvailable,
    chrome: env.chrome,
    pptxSvg: env.pptxSvg,
    pptxSvgVersion: env.pptxSvgVersion,
    pptxSvgApi: env.pptxSvgApi,
    node: env.node,
    pptxBytes: pptxBuffer.length,
    skip: skipIndexes.size,
    renderSlideTimeoutMs,
  });

  if (pptxBuffer.length < 4 || pptxBuffer[0] !== 0x50 || pptxBuffer[1] !== 0x4b) {
    log({ status: 'failure', errorCode: 'CLASSROOM_RENDER_SOURCE_FAILED', reason: 'Invalid PPTX buffer (missing ZIP signature)' });
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
  if (!env.pptxSvg) {
    log({ status: 'failure', errorCode: 'CLASSROOM_RENDER_SOURCE_FAILED', reason: 'pptx-svg renderer assets were not found in the backend image' });
    return {
      success: false,
      slideCount: 0,
      renders: [],
      warnings,
      errors: ['pptx-svg renderer assets were not found in the backend image'],
      method,
    };
  }
  if (!env.chrome) {
    log({
      status: 'failure',
      errorCode: 'CLASSROOM_RENDER_CHROMIUM_ERROR',
      reason: 'Chromium was not found. Install Chromium in the backend image and set PUPPETEER_EXECUTABLE_PATH.',
    });
    return {
      success: false,
      slideCount: 0,
      renders: [],
      warnings,
      errors: [
        'Chromium was not found. Install Chromium in the backend image and set PUPPETEER_EXECUTABLE_PATH.',
      ],
      method,
    };
  }

  const vendorDir = path.join(outputDir, 'pptx-svg');
  await cp(env.pptxSvg, vendorDir, { recursive: true });
  await patchVendorZipInflate(vendorDir);

  let workspace: Awaited<ReturnType<typeof startRenderServer>> | undefined;
  let browser: Browser | undefined;
  try {
    workspace = await startRenderServer({
      pptxBuffer,
      vendorDir,
      outputDir,
      skipIndexes,
      presentationId,
      onProgress: options?.onProgress,
    });
    log({ stage: 'init', origin: workspace.origin, chrome: env.chrome });

    const protocolTimeout = Math.max(
      RENDER_STAGE_TIMEOUT_MS.pptxLoad,
      RENDER_STAGE_TIMEOUT_MS.pptxFetch,
      renderSlideTimeoutMs,
    ) + 15_000;

    browser = await timed('browser_launch', undefined, RENDER_STAGE_TIMEOUT_MS.browserLaunch, () =>
      puppeteer.launch({
        headless: true,
        executablePath: env.chrome!,
        timeout: RENDER_STAGE_TIMEOUT_MS.browserLaunch,
        protocolTimeout,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
        ],
      }),
    );
    log({
      stage: 'browser',
      status: 'success',
      chromium: await browser.version().catch(() => 'unknown'),
    });

    const setupPage = async () => {
      const nextPage = await timed('page_create', 1, RENDER_STAGE_TIMEOUT_MS.pageCreate, () => browser!.newPage());
      nextPage.setDefaultTimeout(protocolTimeout);
      nextPage.setDefaultNavigationTimeout(RENDER_STAGE_TIMEOUT_MS.harnessNavigation);
      nextPage.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          if (/favicon\.ico|status of 404/i.test(text)) return;
          log({ stage: 'page', status: 'failure', reason: text.slice(0, 180) });
        }
      });
      nextPage.on('pageerror', (err: Error) => {
        log({ stage: 'pageerror', status: 'failure', reason: err.message.slice(0, 180) });
      });

      await timed('harness_navigation', 1, RENDER_STAGE_TIMEOUT_MS.harnessNavigation, async () => {
        await nextPage.goto(`${workspace!.origin}/harness.html`, {
          waitUntil: 'domcontentloaded',
          timeout: RENDER_STAGE_TIMEOUT_MS.harnessNavigation,
        });
        await nextPage.waitForFunction(() => Boolean((globalThis as unknown as ClassroomPageApi).__classroomHarnessReady), {
          timeout: 15_000,
        });
      });

      await timed('worker_boot', 1, 10_000, () =>
        nextPage.evaluate(async () => {
          return await (globalThis as unknown as ClassroomPageApi).__classroomBoot();
        }),
      );

      if (options?.hangSlide) {
        await nextPage.evaluate((slide: number) => {
          (globalThis as unknown as ClassroomPageApi).__hangSlide = slide;
        }, options.hangSlide);
      }

      await timed('wasm_init', 1, RENDER_STAGE_TIMEOUT_MS.wasmInit, () =>
        nextPage.evaluate(async () => {
          return await (globalThis as unknown as ClassroomPageApi).__classroomInitWasm();
        }),
      );

      const fetched = await timed('pptx_fetch', 1, RENDER_STAGE_TIMEOUT_MS.pptxFetch, () =>
        nextPage.evaluate(async () => {
          return await (globalThis as unknown as ClassroomPageApi).__classroomFetchPptx();
        }),
      );
      log({ stage: 'pptx_fetch_success', slide: 1, bytes: Number(fetched?.bytes ?? pptxBuffer.length) });

      const loaded = await timed('pptx_load', 1, RENDER_STAGE_TIMEOUT_MS.pptxLoad, () =>
        nextPage.evaluate(async () => {
          return await (globalThis as unknown as ClassroomPageApi).__classroomLoadPptx();
        }),
      );

      const slideCount = Number(loaded?.slideCount ?? 0);
      log({ stage: 'harness', status: 'success', slides: slideCount });
      return { page: nextPage, slideCount };
    };

    let { page, slideCount } = await setupPage();
    if (slideCount === 0) {
      errors.push('Renderer reported zero slides');
      log({ status: 'failure', errorCode: 'CLASSROOM_RENDER_FAILED', reason: 'Renderer reported zero slides' });
      return { success: false, slideCount: 0, renders: workspace.renders, warnings, errors: [...errors, ...workspace.errors], method };
    }

    const lastSlideIndex = Math.min(
      slideCount,
      options?.maxSlides && options.maxSlides > 0 ? options.maxSlides : slideCount,
    ) - 1;
    log({ slides: slideCount, requested: lastSlideIndex + 1 - skipIndexes.size, maxSlides: options?.maxSlides ?? slideCount });

    const reinitAfterHang = async () => {
      await page.close().catch(() => undefined);
      ({ page, slideCount } = await setupPage());
    };

    for (let index = 0; index <= lastSlideIndex; index += 1) {
      if (skipIndexes.has(index)) {
        log({ stage: 'slide_complete', slide: index + 1, total: slideCount, skipped: true, status: 'success' });
        continue;
      }
      const slide = index + 1;
      const started = Date.now();
      log({ stage: 'slide_start', slide, total: slideCount });
      try {
        await options?.onProgress?.({ slide, total: slideCount });
        let result: { ok?: boolean; error?: string; bytes?: number; index?: number } | undefined;
        try {
          result = await timed('render', slide, renderSlideTimeoutMs, () =>
            page.evaluate(async (i: number) => {
              return await (globalThis as unknown as ClassroomPageApi).__classroomRenderSlide(i);
            }, index),
          );
        } catch (firstError) {
          const firstCode = errorCodeOf(firstError, 'CLASSROOM_RENDER_SLIDE_FAILED');
          const reason = (firstError instanceof Error ? firstError.message : String(firstError)).slice(0, 180);
          errors.push(`${firstCode} slide=${slide} reason=${reason}`);
          log({
            stage: 'slide_complete',
            slide,
            total: slideCount,
            status: 'failure',
            errorCode: firstCode,
            reason,
            durationMs: Date.now() - started,
          });
          if (/Target closed|Session closed|Protocol error|Runtime.evaluate/i.test(reason)) {
            await reinitAfterHang();
          }
          continue;
        }

        const render = workspace.renders.find((item) => item.index === index);
        if (!result?.ok || !render?.svgText || !isValidRenderedSvg(render.svgText)) {
          const reason = String(result?.error || 'No SVG generated').slice(0, 180);
          errors.push(`CLASSROOM_RENDER_SLIDE_FAILED slide=${slide} reason=${reason}`);
          log({
            stage: 'slide_complete',
            slide,
            total: slideCount,
            status: 'failure',
            errorCode: result?.ok ? 'CLASSROOM_RENDER_INVALID_SVG' : 'CLASSROOM_RENDER_SLIDE_FAILED',
            reason,
            durationMs: Date.now() - started,
          });
          continue;
        }

        if (options?.onSlideRendered) {
          try {
            log({ stage: 'b2_upload_start', slide, status: 'start' });
            const uploadStarted = Date.now();
            await options.onSlideRendered(render);
            log({
              stage: 'b2_upload_success',
              slide,
              status: 'success',
              durationMs: Date.now() - uploadStarted,
              bytes: render.svgLength,
            });
          } catch (persistError) {
            const persistCode = errorCodeOf(persistError, 'CLASSROOM_RENDER_B2_UPLOAD_FAILED');
            const persistMessage = persistError instanceof Error ? persistError.message : String(persistError);
            errors.push(`${persistCode} slide=${slide} reason=${persistMessage.slice(0, 180)}`);
            log({
              stage: 'b2_upload_failed',
              slide,
              total: slideCount,
              status: 'failure',
              errorCode: persistCode,
              reason: persistMessage.slice(0, 180),
            });
            continue;
          }
        }
        log({
          stage: 'slide_complete',
          slide,
          total: slideCount,
          status: 'success',
          durationMs: Date.now() - started,
          bytes: render.svgLength,
        });
      } catch (slideError) {
        const elapsedMs = Date.now() - started;
        const code = errorCodeOf(slideError, 'CLASSROOM_RENDER_SLIDE_FAILED');
        const reason = slideError instanceof Error ? slideError.message : String(slideError);
        errors.push(`${code} slide=${slide} reason=${reason.slice(0, 180)}`);
        log({
          stage: 'slide_complete',
          slide,
          total: slideCount,
          status: 'failure',
          errorCode: code,
          reason: reason.slice(0, 180),
          durationMs: elapsedMs,
        });
        try {
          await reinitAfterHang();
        } catch (reinitError) {
          const reinitReason = reinitError instanceof Error ? reinitError.message : String(reinitError);
          errors.push(`CLASSROOM_RENDER_CHROMIUM_ERROR reason=${reinitReason.slice(0, 180)}`);
          log({ stage: 'browser_reinit_failed', status: 'failure', errorCode: 'CLASSROOM_RENDER_CHROMIUM_ERROR', reason: reinitReason.slice(0, 180) });
          break;
        }
      }
    }

    errors.push(...workspace.errors);
    const newlyExpected = lastSlideIndex + 1 - [...skipIndexes].filter((index) => index >= 0 && index <= lastSlideIndex).length;
    if (workspace.renders.length !== newlyExpected) {
      warnings.push(`Rendered ${workspace.renders.length} of ${newlyExpected} remaining slides (${slideCount} total)`);
    }

    log({
      complete: true,
      requested: newlyExpected,
      rendered: workspace.renders.length,
      failed: errors.length,
      skipped: skipIndexes.size,
      method,
      status: workspace.renders.length === newlyExpected && errors.length === 0 ? 'success' : 'failure',
    });

    return {
      success: workspace.renders.length === newlyExpected && errors.length === 0,
      slideCount,
      renders: workspace.renders,
      warnings,
      errors,
      method,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const code = errorCodeOf(error, 'CLASSROOM_RENDER_FAILED');
    log({ status: 'failure', errorCode: code, reason: msg.slice(0, 220) });
    errors.push(msg);
    return {
      success: false,
      slideCount: 0,
      renders: workspace?.renders ?? [],
      warnings,
      errors: [...errors, ...(workspace?.errors ?? [])],
      method,
    };
  } finally {
    await browser?.close().catch(() => undefined);
    await workspace?.close().catch(() => undefined);
  }
}

export function validateSlideVisualCoverage(
  sourceSlideCount: number,
  renderCount: number,
  structuredSlideCount: number,
): string[] {
  const issues: string[] = [];
  if (sourceSlideCount !== structuredSlideCount) {
    issues.push(`Structured slide count (${structuredSlideCount}) != source (${sourceSlideCount})`);
  }
  if (renderCount !== sourceSlideCount) {
    issues.push(`Rendered visual count (${renderCount}) != source (${sourceSlideCount})`);
  }
  if (renderCount === 0) {
    issues.push('No slide visuals were generated');
  }
  return issues;
}
