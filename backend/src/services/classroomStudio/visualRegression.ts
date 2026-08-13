/**
 * Visual regression helpers for presentation fidelity testing.
 *
 * Uses sharp (already in project) to rasterize SVG slides and detect
 * blank or severely degraded renders. Does not require byte-identical
 * output — catches meaningful fidelity failures.
 */

import sharp from 'sharp';

export interface VisualRegressionResult {
  passed: boolean;
  slideIndex: number;
  width: number;
  height: number;
  meanLuminance: number;
  nonWhitePixelRatio: number;
  issues: string[];
}

const BLANK_LUMINANCE_THRESHOLD = 252;
const MIN_CONTENT_RATIO = 0.002;

/** Rasterize SVG string to PNG buffer at native SVG dimensions. */
export async function svgToPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg, 'utf8'), { density: 144 })
    .png()
    .toBuffer();
}

/** Detect whether a rendered slide is effectively blank. */
export async function validateSlideVisualContent(
  svg: string,
  slideIndex: number,
): Promise<VisualRegressionResult> {
  const issues: string[] = [];
  const png = await svgToPng(svg);
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sumLuminance = 0;
  let nonWhitePixels = 0;
  const totalPixels = info.width * info.height;

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    sumLuminance += luminance;
    if (luminance < BLANK_LUMINANCE_THRESHOLD) nonWhitePixels++;
  }

  const meanLuminance = sumLuminance / totalPixels;
  const nonWhitePixelRatio = nonWhitePixels / totalPixels;

  if (nonWhitePixelRatio < MIN_CONTENT_RATIO) {
    issues.push(
      `Slide ${slideIndex + 1} appears blank (${(nonWhitePixelRatio * 100).toFixed(2)}% non-white pixels)`,
    );
  }

  if (info.width < 100 || info.height < 50) {
    issues.push(`Slide ${slideIndex + 1} raster dimensions too small (${info.width}x${info.height})`);
  }

  return {
    passed: issues.length === 0,
    slideIndex,
    width: info.width,
    height: info.height,
    meanLuminance,
    nonWhitePixelRatio,
    issues,
  };
}

/** Compare two PNG buffers; returns fraction of differing pixels (0..1). */
export async function comparePngBuffers(a: Buffer, b: Buffer): Promise<number> {
  const imgA = sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const imgB = sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const [ra, rb] = await Promise.all([imgA, imgB]);

  if (ra.info.width !== rb.info.width || ra.info.height !== rb.info.height) {
    return 1;
  }

  let diff = 0;
  const len = ra.data.length;
  for (let i = 0; i < len; i += 4) {
    if (
      Math.abs(ra.data[i] - rb.data[i]) > 8 ||
      Math.abs(ra.data[i + 1] - rb.data[i + 1]) > 8 ||
      Math.abs(ra.data[i + 2] - rb.data[i + 2]) > 8
    ) {
      diff++;
    }
  }

  return diff / (len / 4);
}

/** Verify that rendering the same SVG twice produces deterministic output. */
export async function validateRenderDeterminism(svg: string): Promise<{ passed: boolean; diffRatio: number }> {
  const [a, b] = await Promise.all([svgToPng(svg), svgToPng(svg)]);
  const diffRatio = await comparePngBuffers(a, b);
  return { passed: diffRatio === 0, diffRatio };
}

export async function validateDeckVisualRegression(
  svgs: string[],
): Promise<{ passed: boolean; slides: VisualRegressionResult[]; issues: string[] }> {
  const slides: VisualRegressionResult[] = [];
  const issues: string[] = [];

  for (let i = 0; i < svgs.length; i++) {
    const result = await validateSlideVisualContent(svgs[i], i);
    slides.push(result);
    issues.push(...result.issues);
  }

  return { passed: issues.length === 0, slides, issues };
}
