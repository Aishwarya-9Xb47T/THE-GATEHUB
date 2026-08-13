/**
 * Slide Layout Engine — EMU Coordinate Scaler
 *
 * The slide coordinate system is 960 × 540 px (reference canvas).
 * This maps exactly from OOXML 12,192,000 × 6,858,000 EMU at 72 DPI.
 *
 *   px = emu / EMU_PER_PX            (12700)
 *   pt = halfPoints / 100
 *   px = pt   (at 72 DPI reference canvas, 1 pt = 1 px)
 *
 * Only the outer wrapper container scales via CSS transform.
 * Elements are never individually scaled.
 */

import { useEffect, useRef, useState } from 'react';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Reference canvas width in pixels */
export const REFERENCE_WIDTH_PX = 960;

/** Reference canvas height in pixels */
export const REFERENCE_HEIGHT_PX = 540;

/**
 * EMUs per pixel at the reference canvas resolution.
 * 12,192,000 EMU / 960 px = 12,700 EMU/px
 */
export const EMU_PER_PX = 12_700;

/**
 * Default slide width in EMU (PowerPoint 16:9 widescreen).
 * 13.333" × 914400 EMU/in = 12,192,000 EMU
 */
export const DEFAULT_SLIDE_WIDTH_EMU = 12_192_000;

/**
 * Default slide height in EMU.
 * 7.5" × 914400 EMU/in = 6,858,000 EMU
 */
export const DEFAULT_SLIDE_HEIGHT_EMU = 6_858_000;

// ─── Conversion Helpers ───────────────────────────────────────────────────────

/**
 * Convert EMU to pixels at the 960px reference canvas resolution.
 * This is the ONLY conversion function — never use any other scaling.
 */
export function emuToPx(emu: number): number {
  return emu / EMU_PER_PX;
}

/**
 * Convert OOXML half-points to CSS pixels at the reference canvas.
 * At 72 DPI (reference), 1 pt = 1 px, so font px = half-pts / 100.
 *
 * Example: sz=2400 → 24pt → 24px
 */
export function halfPointToPx(halfPoints: number): number {
  return halfPoints / 100;
}

/**
 * Convert hundredths-of-a-point to CSS pixels at the reference canvas.
 * Used for line spacing exact values and space-before/after.
 */
export function hundredthPtToPx(hundredthPt: number): number {
  return hundredthPt / 100;
}

/**
 * Compute the CSS transform scale for a slide container.
 * @param containerWidthPx - Actual rendered width of the slide wrapper element
 * @param slideWidthEmu    - Slide width from content (defaults to standard 16:9)
 */
export function computeSlideScale(
  containerWidthPx: number,
  slideWidthEmu: number = DEFAULT_SLIDE_WIDTH_EMU,
): number {
  // Reference px width for this slide
  const refPx = emuToPx(slideWidthEmu);
  return containerWidthPx / refPx;
}

// ─── React Hook ───────────────────────────────────────────────────────────────

/**
 * Measures the DOM element and returns the CSS scale that maps the
 * 960-px reference coordinate space to the actual rendered size.
 *
 * Uses ResizeObserver so the scale automatically updates when the
 * container is resized (e.g. panel resize, window resize).
 */
export function useSlideScale(
  containerRef: React.RefObject<HTMLElement | null>,
  slideWidthEmu: number = DEFAULT_SLIDE_WIDTH_EMU,
): number {
  const [scale, setScale] = useState<number>(1);
  const slideWidthRef = useRef(slideWidthEmu);
  slideWidthRef.current = slideWidthEmu;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = (widthPx: number) => {
      setScale(computeSlideScale(widthPx, slideWidthRef.current));
    };

    // Measure immediately on mount
    update(el.offsetWidth || el.getBoundingClientRect().width);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) update(entry.contentRect.width);
    });
    ro.observe(el);

    return () => ro.disconnect();
  }, [containerRef]);

  return scale;
}
