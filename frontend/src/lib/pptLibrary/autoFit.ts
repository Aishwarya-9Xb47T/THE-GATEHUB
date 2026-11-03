/**
 * Auto-Fit Utility for PPT/PPTX and PDF Viewers
 *
 * Provides responsive, mathematical viewport-to-document fitting that guarantees
 * zero clipping, zero distortion, and complete visibility across all device types
 * (desktop, laptop, tablet, mobile portrait/landscape, fullscreen).
 */

export interface DocumentDimensions {
  width: number;
  height: number;
  aspectRatio?: number;
}

export interface ContainerDimensions {
  width: number;
  height: number;
}

export interface AutoFitOptions {
  paddingX?: number;
  paddingY?: number;
  manualZoom?: number; // 100 = 1.0x (Auto-Fit default)
  minDimension?: number;
}

export interface AutoFitResult {
  scale: number;
  fittedWidth: number;
  fittedHeight: number;
  availableWidth: number;
  availableHeight: number;
  aspectRatio: number;
  isWidthConstrained: boolean;
}

/**
 * Calculates responsive auto-fit dimensions for a document given container dimensions.
 *
 * Formula:
 * scale = min(availableWidth / documentWidth, availableHeight / documentHeight)
 * fittedWidth = documentWidth * scale
 * fittedHeight = documentHeight * scale
 */
export function calculateAutoFit(
  container: ContainerDimensions,
  doc: DocumentDimensions,
  options: AutoFitOptions = {}
): AutoFitResult {
  const paddingX = options.paddingX ?? 24;
  const paddingY = options.paddingY ?? 24;
  const manualZoom = options.manualZoom ?? 100;
  const minDimension = options.minDimension ?? 120;

  // Protect against zero or negative dimensions
  const safeDocW = Math.max(1, doc.width);
  const safeDocH = Math.max(1, doc.height);
  const aspectRatio = doc.aspectRatio && doc.aspectRatio > 0 ? doc.aspectRatio : safeDocW / safeDocH;

  const availableWidth = Math.max(minDimension, container.width - paddingX * 2);
  const availableHeight = Math.max(minDimension, container.height - paddingY * 2);

  const scaleX = availableWidth / safeDocW;
  const scaleY = availableHeight / safeDocH;

  const baseScale = Math.min(scaleX, scaleY);
  const zoomFactor = Math.max(0.2, manualZoom / 100);
  const effectiveScale = baseScale * zoomFactor;

  const fittedWidth = Math.round(safeDocW * effectiveScale);
  const fittedHeight = Math.round(safeDocH * effectiveScale);

  return {
    scale: effectiveScale,
    fittedWidth,
    fittedHeight,
    availableWidth,
    availableHeight,
    aspectRatio,
    isWidthConstrained: scaleX <= scaleY,
  };
}

/**
 * Parses SVG markup to extract intrinsic width, height, and viewBox aspect ratio.
 */
export function extractSvgDimensions(svgString: string | null | undefined): DocumentDimensions {
  if (!svgString) {
    return { width: 960, height: 540, aspectRatio: 16 / 9 };
  }

  // 1. Try viewBox="minX minY width height"
  const vbMatch = svgString.match(
    /viewBox=["']\s*([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)[,\s]+([-\d.]+)\s*["']/i
  );
  if (vbMatch) {
    const w = parseFloat(vbMatch[3]);
    const h = parseFloat(vbMatch[4]);
    if (w > 0 && h > 0) {
      return { width: w, height: h, aspectRatio: w / h };
    }
  }

  // 2. Try width and height on <svg> tag
  const svgOpenMatch = svgString.match(/<svg\b([^>]*)>/i);
  if (svgOpenMatch) {
    const attrs = svgOpenMatch[1];
    const wMatch = attrs.match(/\bwidth=["']([-\d.]+)p?x?["']/i);
    const hMatch = attrs.match(/\bheight=["']([-\d.]+)p?x?["']/i);
    if (wMatch && hMatch) {
      const w = parseFloat(wMatch[1]);
      const h = parseFloat(hMatch[1]);
      if (w > 0 && h > 0) {
        return { width: w, height: h, aspectRatio: w / h };
      }
    }
  }

  // Default presentation fallback (16:9 standard slide)
  return { width: 960, height: 540, aspectRatio: 16 / 9 };
}

/**
 * Normalizes SVG markup for responsive fitting:
 * - Injects preserveAspectRatio="xMidYMid meet"
 * - Injects viewBox if missing so vector scaling works proportionally
 * - Replaces fixed width/height with 100% so the outer container dictates the fitted dimensions
 */
export function normalizeSlideSvg(svgString: string | null | undefined): string {
  if (!svgString) return "";

  const dimensions = extractSvgDimensions(svgString);
  let normalized = svgString;

  const svgOpenMatch = normalized.match(/<svg\b([^>]*)>/i);
  if (svgOpenMatch) {
    let attrs = svgOpenMatch[1];

    // Ensure preserveAspectRatio="xMidYMid meet"
    if (!/preserveAspectRatio=/i.test(attrs)) {
      attrs += ' preserveAspectRatio="xMidYMid meet"';
    }

    // Ensure viewBox exists
    if (!/viewBox=/i.test(attrs)) {
      attrs += ` viewBox="0 0 ${dimensions.width} ${dimensions.height}"`;
    }

    // Replace fixed width/height attributes with 100%
    attrs = attrs.replace(/\bwidth=["'][^"']*["']/i, 'width="100%"');
    attrs = attrs.replace(/\bheight=["'][^"']*["']/i, 'height="100%"');

    normalized = normalized.replace(/<svg\b[^>]*>/i, `<svg ${attrs}>`);
  }

  return normalized;
}

