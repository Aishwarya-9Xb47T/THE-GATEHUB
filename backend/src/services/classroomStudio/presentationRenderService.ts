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

export const SLIDE_RENDER_TIMEOUT_MS = 90_000;
export const SLIDE_RENDER_TIMEOUT_MAX_MS = 240_000;
export const B2_UPLOAD_TIMEOUT_MS = 60_000;

/** Larger decks (images, 17MB+ PPTX) need more than 90s per slide. Cap so a hang cannot last forever. */
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
  window.__hangSlide = 0;
  window.__initClassroomRenderer = async () => {
    const response = await fetch('/source.pptx');
    if (!response.ok) throw new Error('Failed to read PowerPoint source for rendering');
    const buffer = await response.arrayBuffer();
    const renderer = new PptxRenderer({ logLevel: 'warn' });
    await renderer.init('/pptx-svg/main.wasm');
    const { slideCount } = await renderer.loadPptx(buffer);
    window.__classroomPptxRenderer = renderer;
    window.__classroomSlideCount = slideCount;
    return { slideCount };
  };
  window.__renderClassroomSlide = async (index) => {
    const renderer = window.__classroomPptxRenderer;
    const slideCount = Number(window.__classroomSlideCount || 0);
    if (!renderer) throw new Error('PowerPoint renderer was not initialized');
    if (Number(window.__hangSlide) === index + 1) {
      await new Promise(() => {});
    }
    await fetch('/start-slide/' + index + '?total=' + slideCount, { method: 'POST' });
    const svg = renderer.renderSlideSvg(index);
    const failed = !svg || svg.startsWith('ERROR:');
    if (failed) {
      const error = svg || 'Empty SVG output';
      await fetch('/save-slide/' + index, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'ERROR:' + error,
      });
      return { index, ok: false, error, bytes: 0 };
    }
    const saved = await fetch('/save-slide/' + index, {
      method: 'POST',
      headers: { 'Content-Type': 'image/svg+xml' },
      body: svg,
    });
    if (!saved.ok) throw new Error('Failed to persist SVG for slide ' + (index + 1));
    return { index, ok: true, error: null, bytes: svg.length };
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
  node: string;
  pptxSvgVersion: string | null;
} {
  const chrome = chromeExecutablePath() ?? null;
  const pptxSvg = pptxSvgDistDir();
  let pptxSvgVersion: string | null = null;
  try {
    const require = createRequire(import.meta.url);
    pptxSvgVersion = require('pptx-svg/package.json').version ?? null;
  } catch {
    pptxSvgVersion = null;
  }
  return {
    renderer: 'puppeteer-pptx-svg',
    browserAvailable: Boolean(chrome),
    chrome,
    pptxSvg,
    node: process.version,
    pptxSvgVersion,
  };
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
  },
): Promise<PresentationRenderResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const method = 'puppeteer-pptx-svg' as const;
  const skipIndexes = new Set([...(options?.skipIndexes ?? [])]);
  const slideTimeoutMs = slideTimeoutForPptx(pptxBuffer.length, options?.slideTimeoutMs);
  const env = describeClassroomRenderer();

  classroomRenderLog({
    renderer: env.renderer,
    browserAvailable: env.browserAvailable,
    chrome: env.chrome,
    pptxSvg: env.pptxSvg,
    pptxSvgVersion: env.pptxSvgVersion,
    node: env.node,
    pptxBytes: pptxBuffer.length,
    skip: skipIndexes.size,
    slideTimeoutMs,
  });

  if (pptxBuffer.length < 4 || pptxBuffer[0] !== 0x50 || pptxBuffer[1] !== 0x4b) {
    classroomRenderLog({ status: 'FAILED', reason: 'Invalid PPTX buffer (missing ZIP signature)' });
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
      protocolTimeout: Math.max(slideTimeoutMs + 15_000, 120_000),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
    });
    classroomRenderLog({
      stage: 'browser',
      status: 'success',
      chromium: await browser.version().catch(() => 'unknown'),
    });

    const setupPage = async () => {
      const nextPage = await browser!.newPage();
      nextPage.setDefaultTimeout(slideTimeoutMs + 15_000);
      nextPage.setDefaultNavigationTimeout(60_000);
      nextPage.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          if (/favicon\.ico|status of 404/i.test(text)) return;
          classroomRenderLog({ stage: 'page', status: 'FAILED', reason: text.slice(0, 180) });
        }
      });
      nextPage.on('pageerror', (err) => {
        classroomRenderLog({ stage: 'pageerror', status: 'FAILED', reason: err.message.slice(0, 180) });
      });
      await nextPage.goto(`${workspace!.origin}/harness.html`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await nextPage.waitForFunction(() => typeof (window as any).__initClassroomRenderer === 'function', {
        timeout: 30_000,
      });
      if (options?.hangSlide) {
        await nextPage.evaluate((slide: number) => {
          (window as any).__hangSlide = slide;
        }, options.hangSlide);
      }
      const init = await nextPage.evaluate(async () => {
        return await (window as any).__initClassroomRenderer();
      });
      classroomRenderLog({ stage: 'harness', status: 'success', slides: Number(init?.slideCount ?? 0) });
      return { page: nextPage, slideCount: Number(init?.slideCount ?? 0) };
    };

    let { page, slideCount } = await setupPage();
    if (slideCount === 0) {
      errors.push('Renderer reported zero slides');
      classroomRenderLog({ status: 'FAILED', reason: 'Renderer reported zero slides' });
      return { success: false, slideCount: 0, renders: workspace.renders, warnings, errors: [...errors, ...workspace.errors], method };
    }

    classroomRenderLog({ slides: slideCount, requested: slideCount - skipIndexes.size });

    for (let index = 0; index < slideCount; index += 1) {
      if (skipIndexes.has(index)) {
        classroomRenderLog({ stage: 'slide-complete', slide: index + 1, total: slideCount, skipped: true });
        continue;
      }
      const slide = index + 1;
      const started = Date.now();
      classroomRenderLog({ stage: 'slide-start', slide, total: slideCount });
      classroomRenderLog({ stage: 'renderer-start', slide, total: slideCount });
      const evaluateSlide = (timeoutMs: number) =>
        withDeadline(
          page.evaluate(async (i: number) => {
            return await (window as any).__renderClassroomSlide(i);
          }, index),
          timeoutMs,
          'CLASSROOM_RENDER_TIMEOUT',
          `CLASSROOM_RENDER_TIMEOUT slide=${slide}`,
        );
      try {
        let result: { ok?: boolean; error?: string; bytes?: number } | undefined;
        try {
          result = await evaluateSlide(slideTimeoutMs);
        } catch (firstError) {
          const firstCode =
            firstError && typeof firstError === 'object' && 'code' in firstError
              ? String((firstError as { code?: string }).code)
              : 'CLASSROOM_RENDER_UNKNOWN';
          classroomRenderLog({
            stage: 'retry',
            slide,
            total: slideCount,
            code: firstCode,
            reason: (firstError instanceof Error ? firstError.message : String(firstError)).slice(0, 180),
          });
          await page.close().catch(() => undefined);
          ({ page, slideCount } = await setupPage());
          result = await evaluateSlide(Math.min(slideTimeoutMs * 2, 300_000));
        }
        const elapsedMs = Date.now() - started;
        classroomRenderLog({
          stage: 'renderer-complete',
          slide,
          total: slideCount,
          elapsedMs,
          ok: Boolean(result?.ok),
        });
        if (!result?.ok) {
          const reason = String(result?.error || 'No SVG generated').slice(0, 180);
          errors.push(`CLASSROOM_RENDER_INVALID_SVG slide=${slide} reason=${reason}`);
          classroomRenderLog({ stage: 'FAILED', slide, total: slideCount, code: 'CLASSROOM_RENDER_INVALID_SVG', reason, elapsedMs });
          continue;
        }
        const render = workspace.renders.find((item) => item.index === index);
        if (!render) {
          errors.push(`CLASSROOM_RENDER_INVALID_SVG slide=${slide} reason=SVG was not written`);
          classroomRenderLog({ stage: 'FAILED', slide, code: 'CLASSROOM_RENDER_INVALID_SVG', reason: 'SVG was not written' });
          continue;
        }
        classroomRenderLog({ stage: 'svg-generated', slide, total: slideCount, bytes: render.svgLength, elapsedMs });
        classroomRenderLog({ stage: 'svg-validated', slide, total: slideCount, bytes: render.svgLength });
        if (options?.onSlideRendered) {
          try {
            await options.onSlideRendered(render);
          } catch (persistError) {
            const persistCode =
              persistError && typeof persistError === 'object' && 'code' in persistError
                ? String((persistError as { code?: string }).code)
                : 'CLASSROOM_RENDER_B2_UPLOAD_FAILED';
            const persistMessage = persistError instanceof Error ? persistError.message : String(persistError);
            errors.push(`${persistCode} slide=${slide} reason=${persistMessage.slice(0, 180)}`);
            classroomRenderLog({
              stage: 'FAILED',
              slide,
              total: slideCount,
              code: persistCode,
              reason: persistMessage.slice(0, 180),
            });
            continue;
          }
        }
        classroomRenderLog({ stage: 'slide-complete', slide, total: slideCount, elapsedMs, bytes: render.svgLength });
      } catch (slideError) {
        const elapsedMs = Date.now() - started;
        const code =
          slideError && typeof slideError === 'object' && 'code' in slideError
            ? String((slideError as { code?: string }).code)
            : /timeout/i.test(slideError instanceof Error ? slideError.message : String(slideError))
              ? 'CLASSROOM_RENDER_TIMEOUT'
              : 'CLASSROOM_RENDER_UNKNOWN';
        const reason = slideError instanceof Error ? slideError.message : String(slideError);
        errors.push(`${code} slide=${slide} reason=${reason.slice(0, 180)}`);
        classroomRenderLog({
          stage: 'FAILED',
          slide,
          total: slideCount,
          code,
          reason: reason.slice(0, 180),
          elapsedMs,
        });
        await page.close().catch(() => undefined);
        try {
          ({ page, slideCount } = await setupPage());
        } catch (reinitError) {
          const reinitReason = reinitError instanceof Error ? reinitError.message : String(reinitError);
          errors.push(`CLASSROOM_RENDER_CHROMIUM_ERROR reason=${reinitReason.slice(0, 180)}`);
          classroomRenderLog({ stage: 'FAILED', code: 'CLASSROOM_RENDER_CHROMIUM_ERROR', reason: reinitReason.slice(0, 180) });
          break;
        }
      }
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
      success: workspace.renders.length === newlyExpected && errors.length === 0,
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
