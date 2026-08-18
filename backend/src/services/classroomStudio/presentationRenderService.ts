/**
 * Faithful presentation visual rendering at import time.
 *
 * Original working path: headless Chromium (puppeteer) + pptx-svg WASM.
 * Node cannot instantiate pptx-svg (needs browser Wasm GC).
 *
 * Output: one SVG file per slide under renders/slide-NNN.svg
 */

import { existsSync } from 'node:fs';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

function chromeExecutablePath(): string | undefined {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/lib/chromium/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    ...windowsChromeCandidates(),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function pptxSvgDistDir(): string | null {
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

function harnessHtml(indexJs: string, wasm: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>PPTX Render Harness</title></head>
<body>
<script type="module">
  import { PptxRenderer } from ${JSON.stringify(indexJs)};
  window.__renderAllSlidesFromUrl = async (pptxUrl, skipIndexes) => {
    const skip = new Set(Array.isArray(skipIndexes) ? skipIndexes : []);
    const response = await fetch(pptxUrl);
    if (!response.ok) throw new Error('Failed to read PowerPoint source for rendering');
    const buffer = await response.arrayBuffer();
    const renderer = new PptxRenderer({ logLevel: 'warn' });
    await renderer.init(${JSON.stringify(wasm)});
    const { slideCount } = await renderer.loadPptx(buffer);
    const slides = [];
    for (let i = 0; i < slideCount; i++) {
      if (skip.has(i)) {
        slides.push({ index: i, svg: null, error: null, skipped: true });
        if (typeof window.__onSlideRendered === 'function') {
          await window.__onSlideRendered(i + 1, slideCount);
        }
        continue;
      }
      const svg = renderer.renderSlideSvg(i);
      const failed = !svg || svg.startsWith('ERROR:');
      slides.push({ index: i, svg: failed ? null : svg, error: failed ? (svg || 'Empty SVG output') : null, skipped: false });
      if (typeof window.__onSlideRendered === 'function') {
        await window.__onSlideRendered(i + 1, slideCount);
      }
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
  const renders: SlideRenderResult[] = [];
  const method = 'puppeteer-pptx-svg' as const;
  const skipIndexes = [...(options?.skipIndexes ?? [])];

  if (pptxBuffer.length < 4 || pptxBuffer[0] !== 0x50 || pptxBuffer[1] !== 0x4b) {
    return {
      success: false,
      slideCount: 0,
      renders,
      warnings,
      errors: ['Invalid PPTX buffer (missing ZIP signature)'],
      method,
    };
  }

  await mkdir(outputDir, { recursive: true });
  const distDir = pptxSvgDistDir();
  if (!distDir) {
    return {
      success: false,
      slideCount: 0,
      renders,
      warnings,
      errors: ['pptx-svg renderer assets were not found in the backend image'],
      method,
    };
  }
  const vendorDir = path.join(outputDir, 'pptx-svg');
  await cp(distDir, vendorDir, { recursive: true });
  const assets = {
    indexJs: pathToFileURL(path.join(vendorDir, 'index.js')).href,
    wasm: pathToFileURL(path.join(vendorDir, 'main.wasm')).href,
  };

  const executablePath = chromeExecutablePath();
  if (!executablePath) {
    return {
      success: false,
      slideCount: 0,
      renders,
      warnings,
      errors: [
        'Chromium was not found. Install Chromium in the backend image and set PUPPETEER_EXECUTABLE_PATH.',
      ],
      method,
    };
  }

  const pptxPath = path.join(outputDir, 'source.pptx');
  const harnessPath = path.join(outputDir, 'harness.html');
  await writeFile(pptxPath, pptxBuffer);
  await writeFile(harnessPath, harnessHtml(assets.indexJs, assets.wasm), 'utf8');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      timeout: 120_000,
      protocolTimeout: RENDER_TIMEOUT_MS,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--allow-file-access-from-files',
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(RENDER_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(60_000);
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[Presentation render page]', msg.text());
    });
    page.on('pageerror', (err) => {
      console.error('[Presentation render page error]', err.message);
    });

    await page.exposeFunction('__onSlideRendered', async (slide: number, total: number) => {
      await options?.onProgress?.({ slide, total });
    });

    await page.goto(pathToFileURL(harnessPath).href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => typeof (window as any).__renderAllSlidesFromUrl === 'function', {
      timeout: 30_000,
    });

    const result = await page.evaluate(
      async (pptxUrl: string, skip: number[]) => {
        return await (window as any).__renderAllSlidesFromUrl(pptxUrl, skip);
      },
      pathToFileURL(pptxPath).href,
      skipIndexes,
    );

    const slideCount = Number(result?.slideCount ?? 0);
    const slides: Array<{ index: number; svg: string | null; error: string | null; skipped?: boolean }> =
      result?.slides ?? [];

    if (slideCount === 0) {
      errors.push('Renderer reported zero slides');
      return { success: false, slideCount: 0, renders, warnings, errors, method };
    }

    for (const slide of slides) {
      if (slide.skipped) continue;
      const fileName = `slide-${String(slide.index + 1).padStart(3, '0')}.svg`;
      const relPath = `renders/${fileName}`;
      if (!slide.svg?.trim() || !isSvgMarkup(slide.svg)) {
        errors.push(`Slide ${slide.index + 1}: ${slide.error ?? 'No SVG generated'}`);
        continue;
      }
      const cleanedSvg = stripPptxSvgDefaultTableGridLines(slide.svg);
      await writeFile(path.join(outputDir, fileName), cleanedSvg, 'utf8');
      renders.push({ index: slide.index, path: relPath, svgLength: cleanedSvg.length });
    }

    const newlyExpected = slideCount - skipIndexes.filter((index) => index >= 0 && index < slideCount).length;
    if (renders.length !== newlyExpected) {
      warnings.push(`Rendered ${renders.length} of ${newlyExpected} remaining slides (${slideCount} total)`);
    }

    console.info('[Presentation render] Completed', {
      slideCount,
      rendered: renders.length,
      skipped: skipIndexes.length,
      errors: errors.length,
      method,
      chrome: executablePath,
      host: os.hostname(),
    });

    return {
      success: renders.length > 0 && errors.length === 0,
      slideCount,
      renders,
      warnings,
      errors,
      method,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Presentation render] Failed:', msg);
    errors.push(msg);
    return { success: false, slideCount: 0, renders, warnings, errors, method };
  } finally {
    await browser?.close().catch(() => undefined);
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
