/**
 * Faithful presentation visual rendering at import time.
 *
 * Original working path: headless Chromium (puppeteer) + pptx-svg WASM.
 * Node cannot instantiate pptx-svg (needs browser Wasm GC).
 *
 * Output: one SVG file per slide under renders/slide-NNN.svg
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { stripPptxSvgDefaultTableGridLines } from './pptxSvgPostProcess.js';

const RENDER_TIMEOUT_MS = 8 * 60 * 1000;

export interface SlideRenderResult {
  index: number;
  path: string;
  svgLength: number;
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
  method: 'puppeteer-pptx-svg';
}

function classroomRenderLog(fields: Record<string, string | number | boolean | undefined | null>) {
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

function harnessHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>PPTX Render Harness</title></head>
<body>
<script type="module">
  import { PptxRenderer } from '/pptx-svg/index.js';
  window.__renderAllSlides = async (skipIndexes) => {
    const skip = new Set(Array.isArray(skipIndexes) ? skipIndexes : []);
    const response = await fetch('/source.pptx');
    if (!response.ok) throw new Error('Failed to read PowerPoint source for rendering');
    const buffer = await response.arrayBuffer();
    const renderer = new PptxRenderer({ logLevel: 'warn' });
    await renderer.init('/pptx-svg/main.wasm');
    const { slideCount } = await renderer.loadPptx(buffer);
    const slides = [];
    for (let i = 0; i < slideCount; i++) {
      if (skip.has(i)) {
        slides.push({ index: i, skipped: true, error: null, bytes: 0 });
        continue;
      }
      await fetch('/start-slide/' + i + '?total=' + slideCount, { method: 'POST' });
      const svg = renderer.renderSlideSvg(i);
      const failed = !svg || svg.startsWith('ERROR:');
      if (failed) {
        const error = svg || 'Empty SVG output';
        await fetch('/save-slide/' + i, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: 'ERROR:' + error,
        });
        slides.push({ index: i, skipped: false, error, bytes: 0 });
        continue;
      }
      const saved = await fetch('/save-slide/' + i, {
        method: 'POST',
        headers: { 'Content-Type': 'image/svg+xml' },
        body: svg,
      });
      if (!saved.ok) throw new Error('Failed to persist SVG for slide ' + (i + 1));
      slides.push({ index: i, skipped: false, error: null, bytes: svg.length });
    }
    return { slideCount, slides };
  };
</script>
</body>
</html>`;
}

function isSvgMarkup(text: string): boolean {
  const trimmed = text.trimStart().toLowerCase();
  return trimmed.startsWith('<svg') || (trimmed.startsWith('<?xml') && trimmed.includes('<svg'));
}

export function isValidRenderedSvg(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 32) return false;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('{') || lower.startsWith('[')) return false;
  if (lower.startsWith('<!doctype') || lower.startsWith('<html')) return false;
  return isSvgMarkup(trimmed) && lower.includes('<svg');
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

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/harness.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(harness);
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
      const start = url.pathname.match(/^\/start-slide\/(\d+)$/);
      if (req.method === 'POST' && start) {
        const slide = Number(start[1]) + 1;
        const total = Number(url.searchParams.get('total') || 0) || undefined;
        classroomRenderLog({ slide, status: 'start', total });
        await args.onProgress?.({ slide, total: total || slide });
        res.writeHead(204);
        res.end();
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
          classroomRenderLog({ slide: index + 1, status: 'FAILED', reason: reason.slice(0, 180) });
          res.writeHead(204);
          res.end();
          return;
        }
        const cleanedSvg = stripPptxSvgDefaultTableGridLines(text);
        const fileName = `slide-${String(index + 1).padStart(3, '0')}.svg`;
        await writeFile(path.join(args.outputDir, fileName), cleanedSvg, 'utf8');
        renders.push({ index, path: `renders/${fileName}`, svgLength: cleanedSvg.length });
        classroomRenderLog({
          slide: index + 1,
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
      classroomRenderLog({ status: 'FAILED', reason: message.slice(0, 180), stage: 'render-http' });
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
  renderer: 'puppeteer-pptx-svg';
  browserAvailable: boolean;
  chrome: string | null;
  pptxSvg: string | null;
} {
  const chrome = chromeExecutablePath() ?? null;
  const pptxSvg = pptxSvgDistDir();
  return {
    renderer: 'puppeteer-pptx-svg',
    browserAvailable: Boolean(chrome),
    chrome,
    pptxSvg,
  };
}

export async function renderPresentationSlides(
  pptxBuffer: Buffer,
  outputDir: string,
  options?: {
    skipIndexes?: Iterable<number>;
    onProgress?: (event: PresentationRenderProgress) => void | Promise<void>;
  },
): Promise<PresentationRenderResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const method = 'puppeteer-pptx-svg' as const;
  const skipIndexes = new Set([...(options?.skipIndexes ?? [])]);
  const env = describeClassroomRenderer();

  classroomRenderLog({
    renderer: env.renderer,
    browserAvailable: env.browserAvailable,
    chrome: env.chrome,
    pptxSvg: env.pptxSvg,
    pptxBytes: pptxBuffer.length,
    skip: skipIndexes.size,
  });

  if (pptxBuffer.length < 4 || pptxBuffer[0] !== 0x50 || pptxBuffer[1] !== 0x4b) {
    classroomRenderLog({ status: 'FAILED', reason: 'Invalid PPTX buffer (missing ZIP signature)' });
    return {
      success: false,
      slideCount: 0,
      renders: [],
      warnings,
      errors: ['Invalid PPTX buffer (missing ZIP signature)'],
      method,
    };
  }

  await mkdir(outputDir, { recursive: true });
  if (!env.pptxSvg) {
    classroomRenderLog({ status: 'FAILED', reason: 'pptx-svg renderer assets were not found in the backend image' });
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
    classroomRenderLog({
      status: 'FAILED',
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

  let workspace: Awaited<ReturnType<typeof startRenderServer>> | undefined;
  let browser;
  try {
    workspace = await startRenderServer({
      pptxBuffer,
      vendorDir,
      outputDir,
      skipIndexes,
      onProgress: options?.onProgress,
    });
    classroomRenderLog({ stage: 'init', origin: workspace.origin, chrome: env.chrome });

    browser = await puppeteer.launch({
      headless: true,
      executablePath: env.chrome,
      timeout: 120_000,
      protocolTimeout: RENDER_TIMEOUT_MS,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
    });
    classroomRenderLog({ stage: 'browser', status: 'success' });

    const page = await browser.newPage();
    page.setDefaultTimeout(RENDER_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(60_000);
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (/favicon\.ico/i.test(text)) return;
        classroomRenderLog({ stage: 'page', status: 'FAILED', reason: text.slice(0, 180) });
      }
    });
    page.on('pageerror', (err) => {
      classroomRenderLog({ stage: 'pageerror', status: 'FAILED', reason: err.message.slice(0, 180) });
    });

    await page.goto(`${workspace.origin}/harness.html`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => typeof (window as any).__renderAllSlides === 'function', {
      timeout: 30_000,
    });
    classroomRenderLog({ stage: 'harness', status: 'success' });

    const result = await page.evaluate(async (skip: number[]) => {
      return await (window as any).__renderAllSlides(skip);
    }, [...skipIndexes]);

    const slideCount = Number(result?.slideCount ?? 0);
    classroomRenderLog({ slides: slideCount, requested: slideCount - skipIndexes.size });

    if (slideCount === 0) {
      errors.push('Renderer reported zero slides');
      classroomRenderLog({ status: 'FAILED', reason: 'Renderer reported zero slides' });
      return { success: false, slideCount: 0, renders: workspace.renders, warnings, errors: [...errors, ...workspace.errors], method };
    }

    errors.push(...workspace.errors);
    const newlyExpected = slideCount - [...skipIndexes].filter((index) => index >= 0 && index < slideCount).length;
    if (workspace.renders.length !== newlyExpected) {
      warnings.push(`Rendered ${workspace.renders.length} of ${newlyExpected} remaining slides (${slideCount} total)`);
    }

    classroomRenderLog({
      complete: true,
      requested: newlyExpected,
      rendered: workspace.renders.length,
      failed: errors.length,
      skipped: skipIndexes.size,
      method,
    });

    return {
      success: workspace.renders.length > 0 && errors.length === 0,
      slideCount,
      renders: workspace.renders,
      warnings,
      errors,
      method,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    classroomRenderLog({ status: 'FAILED', reason: msg.slice(0, 220) });
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
