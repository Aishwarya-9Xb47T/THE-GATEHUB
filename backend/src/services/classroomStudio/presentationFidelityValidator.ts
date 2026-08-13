/**
 * Presentation Fidelity Validator
 *
 * Automated validation that imported decks preserve source structure without
 * relying on per-deck or per-slide special cases. Validates in canonical
 * source coordinates (EMU) — not rendered CSS pixels.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Tolerance for geometry overflow checks in EMU (~0.1") */
export const GEOMETRY_TOLERANCE_EMU = 100_000;

export type FidelityIssueSeverity = 'error' | 'warning';

export interface FidelityIssue {
  severity: FidelityIssueSeverity;
  slideOrder?: number;
  elementId?: string | number;
  code: string;
  message: string;
}

export interface SlideFidelityResult {
  order: number;
  index: number;
  title?: string;
  dimensions: { width: number; height: number };
  aspectRatio: number;
  structuredElementCount: number;
  hasVisual: boolean;
  visualType?: string;
  visualAssetExists: boolean;
  visualAssetBytes: number;
  issues: FidelityIssue[];
}

export interface DeckFidelityResult {
  passed: boolean;
  sourceSlideCount: number;
  structuredSlideCount: number;
  visualAssetCount: number;
  originalPptxBytes: number | null;
  issues: FidelityIssue[];
  slides: SlideFidelityResult[];
}

export interface SlideContentLike {
  version?: number;
  format?: string;
  size?: { width?: number; height?: number };
  visual?: {
    type?: string;
    src?: string;
    slideIndex?: number;
    width?: number;
    height?: number;
  };
  elements?: ElementLike[];
  extractionWarnings?: string[];
}

export interface ElementLike {
  id?: string | number;
  type?: string;
  transform?: { x?: number; y?: number; width?: number; height?: number };
  position?: { x?: number; y?: number; width?: number; height?: number };
  src?: string;
  paragraphs?: Array<{ text?: string; runs?: Array<{ text?: string }> }>;
  columns?: number[];
  rows?: Array<{ cells?: unknown[]; height?: number }>;
  children?: ElementLike[];
}

function getTransform(el: ElementLike) {
  return el.transform ?? el.position ?? { x: 0, y: 0, width: 0, height: 0 };
}

/** Validate one element tree in canonical slide coordinates (EMU). */
export function validateElementGeometry(
  el: ElementLike,
  slideWidth: number,
  slideHeight: number,
  slideOrder: number,
  depth = 0,
  options?: { validateAssetsResolved?: boolean },
): FidelityIssue[] {
  const issues: FidelityIssue[] = [];
  const validateAssets = options?.validateAssetsResolved !== false;
  const pos = getTransform(el);
  const tag = `[${el.type ?? 'unknown'} id=${el.id ?? '?'}]`;

  if (pos.width === 0 && pos.height === 0) {
    issues.push({
      severity: 'warning',
      slideOrder,
      elementId: el.id,
      code: 'zero_size',
      message: `${tag} has zero width and height`,
    });
  }
  if (pos.x != null && pos.x < -GEOMETRY_TOLERANCE_EMU) {
    issues.push({
      severity: 'error',
      slideOrder,
      elementId: el.id,
      code: 'negative_x',
      message: `${tag} x=${pos.x} EMU is far outside slide bounds`,
    });
  }
  if (pos.y != null && pos.y < -GEOMETRY_TOLERANCE_EMU) {
    issues.push({
      severity: 'error',
      slideOrder,
      elementId: el.id,
      code: 'negative_y',
      message: `${tag} y=${pos.y} EMU is far outside slide bounds`,
    });
  }
  if (pos.x != null && pos.width != null && pos.x + pos.width > slideWidth + GEOMETRY_TOLERANCE_EMU) {
    issues.push({
      severity: 'warning',
      slideOrder,
      elementId: el.id,
      code: 'overflow_right',
      message: `${tag} extends past slide right edge`,
    });
  }
  if (pos.y != null && pos.height != null && pos.y + pos.height > slideHeight + GEOMETRY_TOLERANCE_EMU) {
    issues.push({
      severity: 'warning',
      slideOrder,
      elementId: el.id,
      code: 'overflow_bottom',
      message: `${tag} extends past slide bottom edge`,
    });
  }

  if (el.type === 'image') {
    if (!el.src) {
      issues.push({
        severity: 'warning',
        slideOrder,
        elementId: el.id,
        code: 'image_no_src',
        message: `${tag} has no image source`,
      });
    } else if (el.src.startsWith('asset://')) {
      if (validateAssets) {
        issues.push({
          severity: 'error',
          slideOrder,
          elementId: el.id,
          code: 'unresolved_asset',
          message: `${tag} still references unresolved asset:// URL`,
        });
      }
    }
  }

  if (el.type === 'text') {
    const hasText = (el.paragraphs ?? []).some(
      (p) =>
        (p.runs ?? []).some((r) => r.text?.trim()) ||
        p.text?.trim(),
    );
    if (!hasText) {
      issues.push({
        severity: 'warning',
        slideOrder,
        elementId: el.id,
        code: 'empty_text',
        message: `${tag} is a text element with no text content`,
      });
    }
  }

  if (el.type === 'table') {
    if (!el.columns?.length) {
      issues.push({
        severity: 'warning',
        slideOrder,
        elementId: el.id,
        code: 'table_no_columns',
        message: `${tag} table has no column widths`,
      });
    }
    if (!el.rows?.length) {
      issues.push({
        severity: 'warning',
        slideOrder,
        elementId: el.id,
        code: 'table_no_rows',
        message: `${tag} table has no rows`,
      });
    }
  }

  for (const child of el.children ?? []) {
    issues.push(...validateElementGeometry(child, slideWidth, slideHeight, slideOrder, depth + 1, options));
  }

  return issues;
}

/** Validate a single slide's canonical content model. */
export function validateSlideContent(
  content: SlideContentLike | null | undefined,
  slideOrder: number,
  assetRoot?: string,
  presentationId?: string,
  options?: { validateAssetsResolved?: boolean },
): SlideFidelityResult {
  const issues: FidelityIssue[] = [];
  const sw = Number(content?.size?.width ?? 0);
  const sh = Number(content?.size?.height ?? 0);

  if (!content) {
    issues.push({
      severity: 'error',
      slideOrder,
      code: 'missing_content',
      message: `Slide ${slideOrder} has no content`,
    });
    return {
      order: slideOrder,
      index: slideOrder - 1,
      dimensions: { width: 0, height: 0 },
      aspectRatio: 0,
      structuredElementCount: 0,
      hasVisual: false,
      visualAssetExists: false,
      visualAssetBytes: 0,
      issues,
    };
  }

  if (content.version !== 2) {
    issues.push({
      severity: 'warning',
      slideOrder,
      code: 'version_mismatch',
      message: `Slide ${slideOrder} content.version is not 2`,
    });
  }

  if (sw <= 0 || sh <= 0) {
    issues.push({
      severity: 'error',
      slideOrder,
      code: 'invalid_dimensions',
      message: `Slide ${slideOrder} has invalid canonical dimensions`,
    });
  }

  const elements = content.elements ?? [];
  if (elements.length === 0 && !content.extractionWarnings?.length) {
    issues.push({
      severity: 'warning',
      slideOrder,
      code: 'blank_slide',
      message: `Slide ${slideOrder} has no structured elements`,
    });
  }

  for (const el of elements) {
    issues.push(...validateElementGeometry(el, sw, sh, slideOrder, 0, options));
  }

  const visual = content.visual;
  let visualAssetExists = false;
  let visualAssetBytes = 0;

  if (!visual) {
    issues.push({
      severity: 'error',
      slideOrder,
      code: 'missing_visual',
      message: `Slide ${slideOrder} has no visual block`,
    });
  } else {
    if (typeof visual.slideIndex !== 'number') {
      issues.push({
        severity: 'error',
        slideOrder,
        code: 'missing_slide_index',
        message: `Slide ${slideOrder} visual.slideIndex is missing`,
      });
    } else if (visual.slideIndex !== slideOrder - 1) {
      issues.push({
        severity: 'error',
        slideOrder,
        code: 'slide_index_mismatch',
        message: `Slide ${slideOrder} visual.slideIndex=${visual.slideIndex} != ${slideOrder - 1}`,
      });
    }

    if (visual.type !== 'svg') {
      issues.push({
        severity: 'warning',
        slideOrder,
        code: 'no_prerendered_svg',
        message: `Slide ${slideOrder} uses visual.type=${visual.type} instead of pre-rendered svg`,
      });
    }

    if (assetRoot && visual.src) {
      const rel = visual.src.startsWith('asset://')
        ? visual.src.slice('asset://'.length)
        : resolveVisualRelativePath(visual.src, presentationId);
      const rendersRoot = existsSync(path.join(assetRoot, 'renders')) ? path.join(assetRoot, 'renders') : assetRoot;
      const file = rel.startsWith('renders/')
        ? path.join(assetRoot, rel)
        : path.join(rendersRoot, path.basename(rel));
      if (!existsSync(file)) {
        issues.push({
          severity: 'error',
          slideOrder,
          code: 'missing_visual_file',
          message: `Slide ${slideOrder} visual file missing: ${rel}`,
        });
      } else {
        visualAssetBytes = statSync(file).size;
        visualAssetExists = true;
        if (visualAssetBytes < 50) {
          issues.push({
            severity: 'error',
            slideOrder,
            code: 'visual_too_small',
            message: `Slide ${slideOrder} visual asset is too small (${visualAssetBytes} bytes)`,
          });
        } else if (visual.type === 'svg') {
          const svg = readFileSync(file, 'utf8');
          if (!svg.trim().startsWith('<svg')) {
            issues.push({
              severity: 'error',
              slideOrder,
              code: 'invalid_svg',
              message: `Slide ${slideOrder} visual is not valid SVG`,
            });
          }
        }
      }
    }
  }

  return {
    order: slideOrder,
    index: slideOrder - 1,
    dimensions: { width: sw, height: sh },
    aspectRatio: sw > 0 ? sh / sw : 0,
    structuredElementCount: elements.length,
    hasVisual: Boolean(visual),
    visualType: visual?.type,
    visualAssetExists,
    visualAssetBytes,
    issues,
  };
}

function resolveVisualRelativePath(src: string, presentationId?: string): string {
  if (presentationId) {
    const prefix = `/uploads/classroom-studio/${presentationId}/`;
    if (src.startsWith(prefix)) return src.slice(prefix.length);
  }
  return src.replace(/^\/uploads\/classroom-studio\/[^/]+\//, '');
}

export interface PersistedSlideLike {
  order: number;
  title?: string;
  content?: SlideContentLike;
}

/** Validate full deck coverage: source = structured = visual assets. */
export function validateDeckFidelity(input: {
  slides: PersistedSlideLike[];
  assetRoot?: string;
  presentationId?: string;
  originalPptxPath?: string;
  sourceSlideCount?: number;
  validateAssetsResolved?: boolean;
}): DeckFidelityResult {
  const { slides, assetRoot, presentationId, originalPptxPath, sourceSlideCount, validateAssetsResolved } = input;
  const issues: FidelityIssue[] = [];
  const slideResults = slides.map((s) =>
    validateSlideContent(s.content, s.order, assetRoot, presentationId, { validateAssetsResolved }),
  );

  const structuredSlideCount = slides.length;
  const expectedCount = sourceSlideCount ?? structuredSlideCount;

  if (expectedCount !== structuredSlideCount) {
    issues.push({
      severity: 'error',
      code: 'slide_count_mismatch',
      message: `Structured slide count (${structuredSlideCount}) != source (${expectedCount})`,
    });
  }

  let visualAssetCount = 0;
  if (assetRoot) {
    const rendersDir = existsSync(path.join(assetRoot, 'renders'))
      ? path.join(assetRoot, 'renders')
      : assetRoot;
    if (existsSync(rendersDir)) {
      visualAssetCount = readdirSync(rendersDir).filter((f) => f.endsWith('.svg')).length;
    } else {
      issues.push({
        severity: 'error',
        code: 'renders_missing',
        message: 'renders/ directory is missing',
      });
    }

    if (visualAssetCount !== expectedCount) {
      issues.push({
        severity: 'error',
        code: 'visual_count_mismatch',
        message: `Visual asset count (${visualAssetCount}) != source (${expectedCount})`,
      });
    }
  }

  const svgVisualCount = slideResults.filter((s) => s.visualType === 'svg').length;
  if (svgVisualCount !== expectedCount) {
    issues.push({
      severity: 'error',
      code: 'svg_visual_count_mismatch',
      message: `Slides with visual.type=svg (${svgVisualCount}) != source (${expectedCount})`,
    });
  }

  let originalPptxBytes: number | null = null;
  if (originalPptxPath) {
    if (!existsSync(originalPptxPath)) {
      issues.push({
        severity: 'error',
        code: 'missing_source_pptx',
        message: 'source/original.pptx is missing',
      });
    } else {
      originalPptxBytes = statSync(originalPptxPath).size;
      if (originalPptxBytes < 100) {
        issues.push({
          severity: 'error',
          code: 'invalid_source_pptx',
          message: 'source/original.pptx is too small to be valid',
        });
      }
    }
  }

  // Consistent aspect ratio across slides (same deck should share dimensions)
  const aspectRatios = slideResults
    .filter((s) => s.dimensions.width > 0)
    .map((s) => s.aspectRatio);
  if (aspectRatios.length > 1) {
    const first = aspectRatios[0];
    const drift = aspectRatios.some((r) => Math.abs(r - first) > 0.001);
    if (drift) {
      issues.push({
        severity: 'warning',
        code: 'aspect_ratio_drift',
        message: 'Slides in deck have inconsistent aspect ratios',
      });
    }
  }

  const allIssues = [
    ...issues,
    ...slideResults.flatMap((s) => s.issues),
  ];

  const hasErrors = allIssues.some((i) => i.severity === 'error');

  return {
    passed: !hasErrors,
    sourceSlideCount: expectedCount,
    structuredSlideCount,
    visualAssetCount,
    originalPptxBytes,
    issues: allIssues,
    slides: slideResults,
  };
}

export function formatFidelityReport(result: DeckFidelityResult): string {
  const lines = [
    'PRESENTATION FIDELITY REPORT',
    '============================',
    `Passed: ${result.passed}`,
    `Source slides: ${result.sourceSlideCount}`,
    `Structured slides: ${result.structuredSlideCount}`,
    `Visual assets: ${result.visualAssetCount}`,
    `Original PPTX: ${result.originalPptxBytes ?? 'missing'} bytes`,
    `Issues: ${result.issues.length} (${result.issues.filter((i) => i.severity === 'error').length} errors)`,
  ];

  const errors = result.issues.filter((i) => i.severity === 'error');
  const warnings = result.issues.filter((i) => i.severity === 'warning');

  if (errors.length) {
    lines.push('', 'Errors:');
    for (const e of errors.slice(0, 30)) {
      lines.push(`  [${e.code}]${e.slideOrder ? ` slide ${e.slideOrder}` : ''}: ${e.message}`);
    }
    if (errors.length > 30) lines.push(`  ... and ${errors.length - 30} more`);
  }

  if (warnings.length) {
    lines.push('', 'Warnings:');
    for (const w of warnings.slice(0, 20)) {
      lines.push(`  [${w.code}]${w.slideOrder ? ` slide ${w.slideOrder}` : ''}: ${w.message}`);
    }
    if (warnings.length > 20) lines.push(`  ... and ${warnings.length - 20} more`);
  }

  return lines.join('\n');
}
