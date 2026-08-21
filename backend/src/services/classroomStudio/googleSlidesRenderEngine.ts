/**
 * Dedicated Google Slides High-Fidelity Rendering & Extraction Engine
 *
 * Primary Source of Truth: Google's native vector/raster PDF export
 * Converts all Google Slides into full-resolution PNG visuals, crisp thumbnails,
 * SVG wrappers, and structured slide models with mathematical content preserved.
 */

import puppeteer, { type Browser, type Page } from 'puppeteer';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { persistAtPublicRelative } from '../../middlewares/persistUpload.js';
import { requireDurableClassroomStorage } from './classroomSourceResolver.js';
import {
  canonicalSlidePngRelative,
  canonicalSlideSvgRelative,
  canonicalSlideThumbnailRelative,
  canonicalSourcePdfRelative,
  PNG_MIME,
  SVG_MIME,
} from './classroomAssetPath.js';

export interface RenderedSlideVisual {
  slideIndex: number;
  slideNumber: number;
  title: string;
  textContent: string;
  paragraphs: string[];
  width: number;
  height: number;
  aspectRatio: number;
  pngBuffer: Buffer;
  thumbBuffer: Buffer;
  svgText: string;
  pngUrl: string;
  thumbUrl: string;
  svgUrl: string;
  isBlack: boolean;
}

export interface GoogleSlidesRenderResult {
  success: boolean;
  slideCount: number;
  slides: RenderedSlideVisual[];
  pdfBuffer: Buffer;
  aspectRatio: number;
  error?: string;
}

/**
 * Check if a rendered image buffer is completely or predominantly black/empty.
 */
export async function isImageBlackOrBlank(buffer: Buffer): Promise<{ isBlack: boolean; avgLuminance: number; stdDev: number }> {
  try {
    const stats = await sharp(buffer).stats();
    const channels = stats.channels;
    const avgR = channels[0]?.mean ?? 0;
    const avgG = channels[1]?.mean ?? 0;
    const avgB = channels[2]?.mean ?? 0;
    const avgLuminance = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;
    const stdDevR = channels[0]?.stdev ?? 0;
    const stdDevG = channels[1]?.stdev ?? 0;
    const stdDevB = channels[2]?.stdev ?? 0;
    const avgStdDev = (stdDevR + stdDevG + stdDevB) / 3;

    const isBlack = avgLuminance < 1.0 && avgStdDev < 1.0;
    return { isBlack, avgLuminance, stdDev: avgStdDev };
  } catch {
    return { isBlack: false, avgLuminance: 128, stdDev: 50 };
  }
}

/**
 * Save classroom asset to local uploads disk and sync with durable storage.
 */
async function saveClassroomAsset(relativeUnderUploads: string, buffer: Buffer, mime: string): Promise<string> {
  const normalizedRel = relativeUnderUploads.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^uploads\//, '');
  const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
  const diskPath = path.resolve(uploadRoot, normalizedRel);
  await mkdir(path.dirname(diskPath), { recursive: true });
  await writeFile(diskPath, buffer);
  try {
    await persistAtPublicRelative(diskPath, `uploads/${normalizedRel}`, mime, { keepLocal: true });
  } catch {
    // Local copy is written and active
  }
  return `/uploads/${normalizedRel}`;
}

/**
 * High-fidelity Google Slides PDF renderer using Puppeteer + PDF.js canvas harness.
 */
export async function renderGoogleSlidesPdf(
  presentationId: string,
  pdfBuffer: Buffer,
): Promise<GoogleSlidesRenderResult> {
  console.info(`[GoogleSlides] Starting high-fidelity PDF render for presentationId=${presentationId} (pdfBytes=${pdfBuffer.length})`);

  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      timeout: 10000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
    });

    const page: Page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
          <style>
            html, body { margin: 0; padding: 0; background: #000; overflow: hidden; }
            canvas { display: block; }
          </style>
        </head>
        <body>
          <canvas id="pdf-canvas"></canvas>
        </body>
      </html>
    `;

    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const pdfBase64 = pdfBuffer.toString('base64');

    const pageCount = await page.evaluate(async (b64: string) => {
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const binary = atob(b64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      (window as any).__pdfDoc = await (window as any).pdfjsLib.getDocument({ data: bytes }).promise;
      return (window as any).__pdfDoc.numPages;
    }, pdfBase64);

    if (!pageCount || pageCount < 1) {
      throw new Error('Google Slides PDF contains 0 pages');
    }

    console.info(`[GoogleSlides] Detected ${pageCount} slides in Google presentation`);

    requireDurableClassroomStorage();

    // Persist source PDF
    const sourcePdfRel = canonicalSourcePdfRelative(presentationId);
    await saveClassroomAsset(sourcePdfRel, pdfBuffer, 'application/pdf');

    const slides: RenderedSlideVisual[] = [];
    let deckAspectRatio = 16 / 9;

    for (let i = 1; i <= pageCount; i++) {
      const slideIndex = i - 1;
      const slideNumber = i;

      console.info(`[GoogleSlides] Rendering slide ${slideNumber}/${pageCount} visual...`);

      const slideData = await page.evaluate(async (pIndex: number) => {
        const pdf = (window as any).__pdfDoc;
        const pageObj = await pdf.getPage(pIndex);
        // Scale 2.0 ensures 1440x810 or 1920x1080 crisp rendering
        const viewport = pageObj.getViewport({ scale: 2.0 });

        const canvas = document.getElementById('pdf-canvas') as HTMLCanvasElement;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas 2d context');

        await pageObj.render({ canvasContext: ctx, viewport }).promise;

        // Extract structured text from page
        const textContent = await pageObj.getTextContent();
        const items = textContent.items || [];
        const lines: string[] = [];
        let currentLine = '';
        let lastY: number | null = null;

        for (const item of items) {
          const str = (item.str || '').trim();
          if (!str) continue;
          const y = item.transform?.[5] ?? null;
          if (lastY === null || (y !== null && Math.abs(y - lastY) > 5)) {
            if (currentLine) lines.push(currentLine.trim());
            currentLine = str;
          } else {
            currentLine += (currentLine ? ' ' : '') + str;
          }
          lastY = y;
        }
        if (currentLine) lines.push(currentLine.trim());

        const title = lines[0] || `Slide ${pIndex}`;

        return {
          width: Math.round(viewport.width),
          height: Math.round(viewport.height),
          aspectRatio: viewport.width / viewport.height,
          title,
          lines,
          rawText: lines.join('\n'),
        };
      }, i);

      if (i === 1 && slideData.aspectRatio > 0) {
        deckAspectRatio = slideData.aspectRatio;
      }

      const canvasEl = await page.$('#pdf-canvas');
      if (!canvasEl) {
        throw new Error(`Failed to capture canvas for slide ${slideNumber}`);
      }

      const pngBuffer = (await canvasEl.screenshot({ type: 'png' })) as Buffer;
      const blackCheck = await isImageBlackOrBlank(pngBuffer);

      if (blackCheck.isBlack) {
        console.warn(`[GoogleSlides][WARN] Slide ${slideNumber} rendered with low luminance (mean=${blackCheck.avgLuminance.toFixed(2)})`);
      }

      // Generate 320x180 crisp thumbnail
      const thumbBuffer = await sharp(pngBuffer)
        .resize(320, 180, { fit: 'inside' })
        .png()
        .toBuffer();

      // Generate SVG wrapper embedding the PNG for vector/raster compatibility
      const base64Png = pngBuffer.toString('base64');
      const svgText = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${slideData.width} ${slideData.height}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <image width="${slideData.width}" height="${slideData.height}" href="data:image/png;base64,${base64Png}" />
</svg>`;
      const svgBuffer = Buffer.from(svgText, 'utf8');

      // Canonical paths
      const pngRel = canonicalSlidePngRelative(presentationId, slideNumber);
      const svgRel = canonicalSlideSvgRelative(presentationId, slideNumber);
      const thumbRel = canonicalSlideThumbnailRelative(presentationId, slideNumber);

      // Persist to storage
      await saveClassroomAsset(pngRel, pngBuffer, PNG_MIME);
      await saveClassroomAsset(svgRel, svgBuffer, SVG_MIME);
      await saveClassroomAsset(thumbRel, thumbBuffer, PNG_MIME);

      // Also persist legacy visuals/N.png and visuals/N.svg for backwards compatibility
      const legacyVisualPngRel = `uploads/classroom/${presentationId}/visuals/${slideNumber}.png`;
      const legacyVisualSvgRel = `uploads/classroom/${presentationId}/visuals/${slideNumber}.svg`;
      await saveClassroomAsset(legacyVisualPngRel, pngBuffer, PNG_MIME);
      await saveClassroomAsset(legacyVisualSvgRel, svgBuffer, SVG_MIME);

      const title = slideData.title;
      const textContent = slideData.rawText;
      const paragraphs = slideData.lines;

      const pngUrl = `/api/classroom-studio/presentations/${presentationId}/assets/renders/slide-${String(slideNumber).padStart(3, '0')}.png`;
      const thumbUrl = `/api/classroom-studio/presentations/${presentationId}/assets/renders/slide-${String(slideNumber).padStart(3, '0')}.png`;
      const svgUrl = `/api/classroom-studio/presentations/${presentationId}/assets/visuals/${slideNumber}.svg`;

      slides.push({
        slideIndex,
        slideNumber,
        title,
        textContent,
        paragraphs,
        width: slideData.width,
        height: slideData.height,
        aspectRatio: slideData.aspectRatio,
        pngBuffer,
        thumbBuffer,
        svgText,
        pngUrl,
        thumbUrl,
        svgUrl,
        isBlack: blackCheck.isBlack,
      });

      console.info(`[GoogleSlides] Slide ${slideNumber} successfully rendered & persisted (${slideData.width}x${slideData.height}, pngBytes=${pngBuffer.length}, thumbBytes=${thumbBuffer.length})`);
    }

    await browser.close();
    browser = null;

    console.info(`[GoogleSlides] Completed rendering all ${slides.length} slides successfully`);

    return {
      success: true,
      slideCount: slides.length,
      slides,
      pdfBuffer,
      aspectRatio: deckAspectRatio,
    };
  } catch (error) {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[GoogleSlides][ERROR] Failed to render Google Slides PDF: ${message}`, error);
    return {
      success: false,
      slideCount: 0,
      slides: [],
      pdfBuffer,
      aspectRatio: 16 / 9,
      error: message,
    };
  }
}
