/**
 * Faithful presentation visual rendering at import time.
 *
 * Uses headless Chromium (puppeteer) + pptx-svg WASM because Node cannot
 * instantiate the pptx-svg module directly (requires browser Wasm GC).
 *
 * Output: one SVG file per slide under renders/slide-NNN.svg
 */

import puppeteer from 'puppeteer';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripPptxSvgDefaultTableGridLines } from './pptxSvgPostProcess.js';

const require = createRequire(import.meta.url);

function pptxSvgAssetUrls(): { indexJs: string; wasm: string } | null {
  try {
    const indexJsPath = require.resolve('pptx-svg/dist/index.js');
    const wasmPath = path.join(path.dirname(indexJsPath), 'main.wasm');
    return {
      indexJs: pathToFileURL(indexJsPath).href,
      wasm: pathToFileURL(wasmPath).href,
    };
  } catch {
    return null;
  }
}

function harnessHtml(indexJs: string, wasm: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>PPTX Render Harness</title></head>
<body>
<script type="module">
  import { PptxRenderer } from ${JSON.stringify(indexJs)};
  window.__renderAllSlides = async (pptxBase64) => {
    const binary = atob(pptxBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const renderer = new PptxRenderer({ logLevel: 'warn' });
    await renderer.init(${JSON.stringify(wasm)});
    const { slideCount } = await renderer.loadPptx(bytes.buffer);
    const slides = [];
    for (let i = 0; i < slideCount; i++) {
      const svg = renderer.renderSlideSvg(i);
      const failed = !svg || svg.startsWith('ERROR:');
      slides.push({ index: i, svg: failed ? null : svg, error: failed ? (svg || 'Empty SVG output') : null });
    }
    return { slideCount, slides };
  };
</script>
</body>
</html>`;
}

export interface SlideRenderResult {
  index: number;
  path: string;
  svgLength: number;
}

export interface PresentationRenderResult {
  success: boolean;
  slideCount: number;
  renders: SlideRenderResult[];
  warnings: string[];
  errors: string[];
}

export async function renderPresentationSlides(
  pptxBuffer: Buffer,
  outputDir: string,
): Promise<PresentationRenderResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const renders: SlideRenderResult[] = [];

  if (pptxBuffer.length < 4 || pptxBuffer[0] !== 0x50 || pptxBuffer[1] !== 0x4b) {
    return {
      success: false,
      slideCount: 0,
      renders: [],
      warnings,
      errors: ['Invalid PPTX buffer (missing ZIP signature)'],
    };
  }

  await mkdir(outputDir, { recursive: true });

  const assets = pptxSvgAssetUrls();
  if (!assets) {
    return {
      success: false,
      slideCount: 0,
      renders,
      warnings,
      errors: ['CLASSROOM_RENDER_HARNESS_MISSING'],
    };
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--allow-file-access-from-files',
      ],
    });
    const page = await browser.newPage();

    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error') console.error('[Presentation render page]', text);
    });
    page.on('pageerror', (err) => {
      console.error('[Presentation render page error]', err.message);
    });

    await page.setContent(harnessHtml(assets.indexJs, assets.wasm), { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() => typeof (window as any).__renderAllSlides === 'function', {
      timeout: 30_000,
    });

    const pptxBase64 = pptxBuffer.toString('base64');
    const result = await page.evaluate(async (b64: string) => {
      return await (window as any).__renderAllSlides(b64);
    }, pptxBase64);

    const slideCount = Number(result?.slideCount ?? 0);
    const slides: Array<{ index: number; svg: string | null; error: string | null }> = result?.slides ?? [];

    if (slideCount === 0) {
      errors.push('Renderer reported zero slides');
      return { success: false, slideCount: 0, renders, warnings, errors };
    }

    if (slides.length !== slideCount) {
      warnings.push(`Renderer slide array length (${slides.length}) != slideCount (${slideCount})`);
    }

    for (const slide of slides) {
      const fileName = `slide-${String(slide.index + 1).padStart(3, '0')}.svg`;
      const relPath = `renders/${fileName}`;

      if (!slide.svg?.trim()) {
        errors.push(`Slide ${slide.index + 1}: ${slide.error ?? 'No SVG generated'}`);
        continue;
      }

      const cleanedSvg = stripPptxSvgDefaultTableGridLines(slide.svg);
      await writeFile(path.join(outputDir, fileName), cleanedSvg, 'utf8');
      renders.push({
        index: slide.index,
        path: relPath,
        svgLength: cleanedSvg.length,
      });
    }

    if (renders.length !== slideCount) {
      warnings.push(`Rendered ${renders.length} of ${slideCount} slides`);
    }

    console.info('[Presentation render] Completed', {
      slideCount,
      rendered: renders.length,
      errors: errors.length,
    });

    return {
      success: renders.length > 0 && renders.length === slideCount,
      slideCount,
      renders,
      warnings,
      errors,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Presentation render] Failed:', msg);
    errors.push(msg);
    return { success: false, slideCount: 0, renders, warnings, errors };
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
