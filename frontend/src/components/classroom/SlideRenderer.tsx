/**
 * True PowerPoint Slide Layout Engine — Fixed-Layout Faithful Renderer.
 *
 * Rendering contract (2026-08 overhaul):
 *  1. Each slide uses its ACTUAL slideWidthEmu/slideHeightEmu as the source of truth.
 *  2. Reference canvas: width = 1280 px fixed, height = 1280 * slideHeight / slideWidth.
 *     This preserves the ORIGINAL PPT aspect ratio for ANY format (16:9, 4:3, custom).
 *  3. Element coordinates are PROPORTIONAL to slide dims (not hardcoded EMU/12700):
 *       xPx = elem.x / slideWidth  * refW
 *       yPx = elem.y / slideHeight * refH
 *  4. Only the outer canvas is scaled (CSS transform: scale) to fit the viewport.
 *     Everything inside scales uniformly — fonts, images, shapes, tables.
 *  5. No overflow-hidden on the wrapper. Canvas height is determined by aspect ratio.
 *  6. The destructive "layout engine" is DISABLED for imported slides. It was
 *     shifting elements below the canvas bounds where overflow-hidden clipped them.
 */

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { withUploadAuth } from '@/lib/courseMediaUrls';
import {
  classroomRenderedImageUrl,
  decodeSlideAltText,
  isOfficeGeneratedAlt,
  rewriteClassroomAssetRef,
} from '@/lib/classroom/classroomAssetUrls';
import { OriginalPresentationViewer, clearClassroomPptxBufferCache as clearOriginalPptxCache } from '@/components/classroom/OriginalPresentationViewer';
import { usesOriginalPresentationSource } from '@/lib/classroom/originalPresentationUrls';
import { classroomImageCacheKey, classroomSlideUiState } from '@/lib/classroom/classroomRenderState';
import { resolveColor, buildGradient } from './engine/colorResolver';
import {
  halfPointToPx, hundredthPtToPx,
  DEFAULT_SLIDE_WIDTH_EMU, DEFAULT_SLIDE_HEIGHT_EMU,
  REFERENCE_WIDTH_PX,
} from './engine/scaler';
import type {
  NormalizedSlide, NormalizedElement, NormalizedBackground,
  Paragraph, Run, RunStyle, ParagraphStyle, TextBodyProps,
  TableCell, TableRow, Transform, Fill, BorderLine, CellBorder,
  ThemeColors, GradientStop,
} from './engine/types';

// ─── Reference Canvas ────────────────────────────────────────────────────────

/** Reference canvas width in CSS pixels - MUST match scaler.ts */
const REF_CANVAS_W = REFERENCE_WIDTH_PX;

/** Google Slides / PowerPoint default graphicFrame placeholder extent (EMU) */
const GRAPHIC_FRAME_PLACEHOLDER_EMU = 3_000_000;

/** Resolve table bounds from tblGrid when graphicFrame xfrm is a placeholder */
function resolveTableBounds(
  position: Transform,
  columns: number[],
  rows: { height?: number }[],
): Transform {
  const colSum = columns.reduce((s, c) => s + Number(c || 0), 0);
  const rowSum = rows.reduce((s, r) => s + Number(r.height ?? 0), 0);
  const isPlaceholder =
    position.width === GRAPHIC_FRAME_PLACEHOLDER_EMU &&
    position.height === GRAPHIC_FRAME_PLACEHOLDER_EMU;

  let width = position.width;
  let height = position.height;
  if (colSum > 0 && (isPlaceholder || colSum > width * 1.02)) width = colSum;
  if (rowSum > 0 && (isPlaceholder || rowSum > height * 1.02 || (isPlaceholder && rowSum < height))) {
    height = rowSum;
  }
  return { ...position, width, height };
}

/**
 * Given a slide's actual EMU dimensions, return {w, h} of the reference canvas in px.
 * Height is derived from the slide's real aspect ratio — never hardcoded 16:9.
 */
function canvasPx(slideWidthEmu: number, slideHeightEmu: number) {
  const w = REF_CANVAS_W;
  const h = slideWidthEmu > 0 ? (REF_CANVAS_W * slideHeightEmu) / slideWidthEmu : REF_CANVAS_W * 9 / 16;
  return { w, h };
}

/**
 * Convert an EMU value on the X axis to a pixel value on the reference canvas.
 * Uses ctx (slideW + refW) for proportional mapping — never hardcoded EMU/12700.
 */
function emuXToPx(emu: number, ctx: CanvasCtx): number {
  return ctx.slideW > 0 ? (emu / ctx.slideW) * ctx.refW : 0;
}

/** Convert an EMU value on the Y axis to a reference-canvas pixel. */
function emuYToPx(emu: number, ctx: CanvasCtx): number {
  return ctx.slideH > 0 ? (emu / ctx.slideH) * ctx.refH : 0;
}

// ─── Public API (unchanged from previous version) ─────────────────────────────

export type { NormalizedSlide as SlideDocument, NormalizedElement as SlideElement };
export type CellBorderType = CellBorder | null | undefined;

export type SlideRendererProps = {
  content?: unknown;
  title?: string;
  slideNumber?: number;
  /** For diagnostics and canonical asset URLs */
  presentationId?: string;
  slideId?: string;
  className?: string;
  onPointerMove?: (point: { x: number; y: number }) => void;
  pointer?: { x: number; y: number } | null;
  /** Show bounding boxes + EMU/px labels for geometry debugging */
  debugGeometry?: boolean;
  canRepair?: boolean;
  onRepair?: () => void;
  repairing?: boolean;
  pipelineStatus?: string;
  slideCount?: number;
  renderProgressSlide?: number;
  renderStage?: string;
  sourceType?: string;
  sourceUrl?: string;
};

type RenderDiagnostic = {
  presentationId?: string;
  slideId?: string;
  slideIndex: number;
  format: string;
  hasVisual: boolean;
  visualType?: string;
  visualSrc?: string;
  nativeRendererAttempted: boolean;
  nativeRendererSucceeded: boolean;
  structuredRendererUsed: boolean;
  structuredElementCount: number;
  nativeSvgLength: number;
  fallbackReason?: string;
  activeRenderer: 'pre-rendered-svg' | 'raster-image' | 'structured-fallback' | 'none';
};

// ─── Slide Normalization ──────────────────────────────────────────────────────

function normalizeColor(raw: unknown): string | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'string') return raw.startsWith('scheme:') || raw.startsWith('#') ? raw : undefined;
  const obj = raw as any;
  const rgb = obj?.['a:srgbClr']?.['@_val'] ?? obj?.['@_val'];
  if (rgb) return `#${rgb}`;
  const sys = obj?.['a:sysClr']?.['@_lastClr'];
  if (sys) return `#${sys}`;
  const scheme = obj?.['a:schemeClr']?.['@_val'];
  if (scheme) return `scheme:${scheme}`;
  return undefined;
}

function normalizeParagraphs(raw: unknown[] | undefined): Paragraph[] {
  if (!raw?.length) return [];
  return raw.map((p: any) => {
    const style: ParagraphStyle = p.style ?? {};
    const runs: Run[] = (p.runs ?? []).map((r: any) => ({
      text: String(r.text ?? ''),
      style: {
        sz: r.style?.sz != null ? Number(r.style.sz) : undefined,
        b: r.style?.b === '1' || r.style?.b === true || r.style?.b === 1,
        i: r.style?.i === '1' || r.style?.i === true || r.style?.i === 1,
        u: r.style?.u != null ? String(r.style.u) : undefined,
        strike: r.style?.strike != null ? String(r.style.strike) : undefined,
        latin: typeof r.style?.latin === 'string' ? r.style.latin : undefined,
        color: normalizeColor(r.style?.color),
        baseline: r.style?.baseline != null ? Number(r.style.baseline) : undefined,
        spc: r.style?.spc != null ? Number(r.style.spc) : undefined,
        cap: typeof r.style?.cap === 'string' ? r.style.cap : undefined,
      } satisfies RunStyle,
      hyperlink: r.hyperlink && (r.hyperlink.url || r.hyperlink.toolTip)
        ? { url: r.hyperlink.url, toolTip: r.hyperlink.toolTip, external: r.hyperlink.external }
        : undefined,
    }));
    return {
      text: String(p.text ?? runs.map((r: Run) => r.text).join('')),
      level: Number(p.level ?? 0),
      runs,
      style: {
        algn: style.algn ?? (p.style?.alignment as string | undefined),
        lnSpc: style.lnSpc != null ? Number(style.lnSpc) : undefined,
        spcBef: style.spcBef != null ? Number(style.spcBef) : undefined,
        spcAft: style.spcAft != null ? Number(style.spcAft) : undefined,
        marL: style.marL != null ? Number(style.marL) : undefined,
        indent: style.indent != null ? Number(style.indent) : undefined,
        bullet: style.bullet,
        bulletChar: style.bulletChar,
        bulletFont: style.bulletFont,
        defTabSz: style.defTabSz != null ? Number(style.defTabSz) : undefined,
      } satisfies ParagraphStyle,
    };
  });
  // Keep ALL paragraphs including blank ones — they represent intentional line breaks.
}

function normalizeFill(el: any): Fill | undefined {
  // Rich fill object already parsed by enhanced parser
  if (el.fill && typeof el.fill === 'object' && 'type' in el.fill) return el.fill as Fill;
  // Legacy: string from style.fill
  const fillStr = typeof el.style?.fill === 'string' ? el.style.fill : undefined;
  if (!fillStr) return undefined;
  if (fillStr === 'none') return { type: 'none' };
  return { type: 'solid', color: fillStr };
}

function normalizeLine(el: any): BorderLine | null | undefined {
  // Rich line object from enhanced parser
  if (el.line !== undefined) {
    if (el.line === null) return null;
    return el.line as BorderLine;
  }
  // Legacy: border from style.line
  const lineStr = typeof el.style?.line === 'string' ? el.style.line : undefined;
  if (lineStr) return { color: lineStr, width: 1 };
  return undefined;
}

function normalizeTransform(pos: any, _slideWidth: number, _slideHeight: number, childExtent?: { width?: number; height?: number }): Transform {
  const width = Number(pos?.width ?? 0) || Number(childExtent?.width ?? 0);
  const height = Number(pos?.height ?? 0) || Number(childExtent?.height ?? 0);
  return {
    x: Number(pos?.x ?? 0),
    y: Number(pos?.y ?? 0),
    width,
    height,
    rotation: Number(pos?.rotation ?? 0),
    flipH: Boolean(pos?.flipH),
    flipV: Boolean(pos?.flipV),
  };
}

function normalizeElement(el: any, index: number, slideWidth: number, slideHeight: number): NormalizedElement {
  let transform = normalizeTransform(el.position ?? el.transform, slideWidth, slideHeight, el.childExtent);
  const paragraphs = normalizeParagraphs(el.paragraphs);
  const columns: number[] | undefined = Array.isArray(el.columns) ? el.columns.map(Number) : undefined;

  const rows: TableRow[] | undefined = Array.isArray(el.rows)
    ? el.rows.filter(Boolean).map((row: any) => ({
        height: Number(row.height ?? 457200),
        cells: (row.cells ?? []).map((cell: any) => {
          // Normalize cell borders — support both old format and new
          let borders = cell.borders;
          if (!borders && cell.border != null) borders = cell.border;

          return {
            paragraphs: normalizeParagraphs(cell.paragraphs ?? (cell.text ? [{ text: cell.text, runs: [] }] : [])),
            fill: cell.fill
              ? (typeof cell.fill === 'string'
                  ? (cell.fill === 'none' ? { type: 'none' as const } : { type: 'solid' as const, color: cell.fill })
                  : cell.fill as Fill)
              : undefined,
            borders,
            rowSpan: cell.rowSpan ? Number(cell.rowSpan) : undefined,
            colSpan: cell.colSpan ? Number(cell.colSpan) : undefined,
            hMerge: Boolean(cell.hMerge),
            vMerge: Boolean(cell.vMerge),
            anchor: typeof cell.anchor === 'string' ? cell.anchor : undefined,
            marL: cell.marL != null ? Number(cell.marL) : undefined,
            marR: cell.marR != null ? Number(cell.marR) : undefined,
            marT: cell.marT != null ? Number(cell.marT) : undefined,
            marB: cell.marB != null ? Number(cell.marB) : undefined,
          } satisfies TableCell;
        }),
      }))
    : undefined;

  if (el.type === 'table' && columns?.length && rows?.length) {
    transform = resolveTableBounds(transform, columns, rows);
  }

  // Group children positions are in the group's child coordinate space (chOff/chExt EMU).
  // We still normalize them using slide-level dims because their EMU values ARE relative
  // to the group's child space — GroupElement's subCtx will re-map them correctly.
  // We use slideWidth/slideHeight (the actual slide dims) so the fallback dimensions
  // (used when position is missing) are reasonable slide-level values.
  const children: NormalizedElement[] | undefined = Array.isArray(el.children)
    ? el.children.map((c: any, i: number) => normalizeElement(c, i, slideWidth, slideHeight))
    : undefined;

  if (el.type === 'group' && children?.length) {
    if (!transform.width || !transform.height) {
      let maxX = 0;
      let maxY = 0;
      for (const child of children) {
        maxX = Math.max(maxX, child.transform.x + child.transform.width);
        maxY = Math.max(maxY, child.transform.y + child.transform.height);
      }
      if (!transform.width) transform.width = maxX;
      if (!transform.height) transform.height = maxY;
    }
  }

  const hyperlink = el.hyperlink && (el.hyperlink.url || el.hyperlink.toolTip)
    ? { url: el.hyperlink.url, toolTip: el.hyperlink.toolTip, external: el.hyperlink.external }
    : undefined;

  return {
    id: String(el.id ?? `el-${index}`),
    type: el.type ?? 'shape',
    name: el.name,
    transform,
    zIndex: index + 1,
    paragraphs: paragraphs.length ? paragraphs : undefined,
    // hasVisibleText is used by isElementVisible — true only if at least one paragraph has content.
    // We cannot filter paragraphs here because blank paragraphs represent blank lines.
    textBody: el.textBody,
    geometry: el.geometry,
    fill: normalizeFill(el),
    line: normalizeLine(el),
    shadow: el.shadow,
    src: el.src,
    alt: el.alt,
    crop: el.crop && typeof el.crop === 'object' ? el.crop : undefined,
    columns,
    rows,
    children,
    childOffset: el.childOffset,
    childExtent: el.childExtent,
    chart: el.chart,
    hyperlink,
  };
}

/** Extract solid/gradient fill from any OOXML fill container node */
function extractOoxmlFillToBackground(fillContainer: any): NormalizedBackground | undefined {
  if (!fillContainer) return undefined;
  // Solid fill
  const solidFill = fillContainer['a:solidFill'];
  if (solidFill) {
    const rgb = solidFill['a:srgbClr']?.['@_val'];
    const sys = solidFill['a:sysClr']?.['@_lastClr'];
    const scheme = solidFill['a:schemeClr']?.['@_val'];
    if (rgb) return { type: 'solid', color: `#${rgb}` };
    if (sys) return { type: 'solid', color: `#${sys}` };
    if (scheme) return { type: 'solid', color: `scheme:${scheme}` };
  }
  // Gradient fill
  const gradFill = fillContainer['a:gradFill'];
  if (gradFill) {
    const lin = gradFill['a:lin'];
    const angle = lin ? Number(lin['@_ang'] ?? 0) / 60000 : 180;
    const stopsRaw = gradFill?.['a:gsLst']?.['a:gs'];
    const stopsArr = Array.isArray(stopsRaw) ? stopsRaw : stopsRaw ? [stopsRaw] : [];
    const stops: GradientStop[] = stopsArr.map((s: any) => {
      const pos = Number(s['@_pos'] ?? 0);
      const rgb = s['a:srgbClr']?.['@_val'];
      const sys = s['a:sysClr']?.['@_lastClr'];
      const scheme = s['a:schemeClr']?.['@_val'];
      return { pos, color: rgb ? `#${rgb}` : sys ? `#${sys}` : scheme ? `scheme:${scheme}` : '#ffffff' };
    });
    if (stops.length) return { type: 'gradient', gradient: { stops, angle } };
  }
  return undefined;
}

function normalizeBackground(raw: unknown, doc?: any): NormalizedBackground {
  // Already-normalized (has a 'type' field)
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'type' in (raw as object)) return raw as NormalizedBackground;
  // Plain string color
  if (typeof raw === 'string') return { type: 'solid', color: raw };

  // OOXML p:bg node (either from slide or layout/master)
  if (raw && typeof raw === 'object') {
    const bg = raw as any;
    const bgPr = bg['p:bgPr'];
    if (bgPr) {
      const fromBgPr = extractOoxmlFillToBackground(bgPr);
      if (fromBgPr) return fromBgPr;
    }
    const bgRef = bg['p:bgRef'];
    if (bgRef) {
      const rgb = bgRef?.['a:srgbClr']?.['@_val'];
      if (rgb) return { type: 'solid', color: `#${rgb}` };
      const scheme = bgRef?.['a:schemeClr']?.['@_val'];
      if (scheme) return { type: 'solid', color: `scheme:${scheme}` };
    }
  }

  // No background in slide — check stored layout XML (ooxml.layout)
  if (doc?.ooxml?.layout) {
    const layout = doc.ooxml.layout as any;
    // Layout p:bg via p:sldLayout
    const layoutBg = layout['p:sldLayout']?.['p:cSld']?.['p:bg']
                  ?? layout['p:cSld']?.['p:bg'];
    if (layoutBg) {
      const fromLayout = normalizeBackground(layoutBg);
      if (fromLayout.color !== '#ffffff' || fromLayout.type !== 'solid') return fromLayout;
    }
  }

  // Transparent (the full-slide layout background image covers the background)
  // Don't return #ffffff — return none so layout images are visible without a white overlay.
  return { type: 'none' };
}

function extractTheme(raw: unknown): ThemeColors | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as ThemeColors;
}

const A = <T,>(value: T | T[] | undefined): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];

/** Extract flat EMU transform from OOXML spPr / xfrm node */
function extractTransformFromNode(node: any): Transform {
  const xfrm = node?.['a:xfrm'] ?? node?.['p:xfrm'] ?? node;
  const off = xfrm?.['a:off'] ?? {};
  const ext = xfrm?.['a:ext'] ?? {};
  return {
    x: Number(off['@_x'] ?? 0),
    y: Number(off['@_y'] ?? 0),
    width: Number(ext['@_cx'] ?? 0),
    height: Number(ext['@_cy'] ?? 0),
    rotation: Number(xfrm?.['@_rot'] ?? 0) / 60000,
    flipH: xfrm?.['@_flipH'] === '1',
    flipV: xfrm?.['@_flipV'] === '1',
  };
}

function layoutFillFromSpPr(spPr: any): Fill | undefined {
  if (!spPr) return undefined;
  if (spPr['a:noFill'] !== undefined) return { type: 'none' };
  const rgb = spPr['a:solidFill']?.['a:srgbClr']?.['@_val'];
  const sys = spPr['a:solidFill']?.['a:sysClr']?.['@_lastClr'];
  const scheme = spPr['a:solidFill']?.['a:schemeClr']?.['@_val'];
  if (rgb) return { type: 'solid', color: `#${rgb}` };
  if (sys) return { type: 'solid', color: `#${sys}` };
  if (scheme) return { type: 'solid', color: `scheme:${scheme}` };
  return undefined;
}

/** Merge slideLayout decorations for slides imported before layout merge existed */
function mergeStoredLayoutDecorations(
  doc: any,
  elements: NormalizedElement[],
  slideWidth: number,
  slideHeight: number,
): NormalizedElement[] {
  if (elements.some((e) => (e as any).fromLayout)) return elements;
  const layout = doc.ooxml?.layout;
  if (!layout) return elements;

  const layoutRels: Record<string, { target: string; external?: boolean }> =
    doc.ooxml?.layoutRelationships ?? {};
  const tree = layout['p:sldLayout']?.['p:cSld']?.['p:spTree'] ?? layout['p:cSld']?.['p:spTree'];
  if (!tree) return elements;

  const decorations: NormalizedElement[] = [];
  let idx = 0;

  const relSrc = (embed: string | undefined) => {
    if (!embed) return undefined;
    const rel = layoutRels[embed];
    if (!rel || rel.external) return rel?.target;
    const name = rel.target.split('/').pop();
    return name ? `asset://media/${name}` : undefined;
  };

  for (const pic of A(tree['p:pic'])) {
    const embed = pic['p:blipFill']?.['a:blip']?.['@_r:embed'] ?? pic['p:blipFill']?.['a:blip']?.['@_r:link'];
    decorations.push(normalizeElement({
      id: pic['p:nvPicPr']?.['p:cNvPr']?.['@_id'] ?? `layout-pic-${idx}`,
      type: 'image',
      position: extractTransformFromNode(pic['p:spPr']),
      src: relSrc(embed),
      fromLayout: true,
    }, idx++, slideWidth, slideHeight));
  }

  for (const shape of A(tree['p:sp'])) {
    if (shape['p:nvSpPr']?.['p:nvPr']?.['p:ph']) continue;
    const spPr = shape['p:spPr'];
    const txBody = shape['p:txBody'];
    const hasText = Boolean(txBody?.['a:p']);
    decorations.push(normalizeElement({
      id: shape['p:nvSpPr']?.['p:cNvPr']?.['@_id'] ?? `layout-sp-${idx}`,
      type: hasText ? 'text' : 'shape',
      position: extractTransformFromNode(spPr),
      paragraphs: hasText ? txBody['a:p'] : undefined,
      fill: layoutFillFromSpPr(spPr),
      geometry: spPr?.['a:prstGeom']?.['@_prst'],
      fromLayout: true,
    }, idx++, slideWidth, slideHeight));
  }

  return decorations.length ? [...decorations, ...elements] : elements;
}

function normalizeSlide(content: unknown): NormalizedSlide {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return { version: 2, size: { width: DEFAULT_SLIDE_WIDTH_EMU, height: DEFAULT_SLIDE_HEIGHT_EMU }, background: { type: 'solid', color: '#ffffff' }, elements: [] };
  }
  const doc = content as any;
  // Legacy format — Google's older adapter output (text/images flat arrays)
  if (!doc.elements && (Array.isArray(doc.text) || Array.isArray(doc.images))) {
    const els: NormalizedElement[] = [
      ...(doc.text ?? []).map((value: string, i: number) => ({
        id: `legacy-text-${i}`, type: 'text' as const, transform: { x: 800000, y: 600000 + i * 440000, width: 10400000, height: 360000, rotation: 0, flipH: false, flipV: false }, zIndex: i + 1, paragraphs: [{ text: value, level: 0, runs: [{ text: value, style: { sz: i === 0 ? 4000 : 2400 } as RunStyle }], style: {} as ParagraphStyle }],
      })),
      ...(doc.images ?? []).map((image: any, i: number) => ({
        id: `legacy-image-${i}`, type: 'image' as const, transform: { x: 1000000, y: 1300000 + i * 800000, width: 3500000, height: 1800000, rotation: 0, flipH: false, flipV: false }, zIndex: (doc.text?.length ?? 0) + i + 1, src: image.contentUrl ?? image.sourceUrl,
      })),
    ];
    return { version: 2, size: { width: DEFAULT_SLIDE_WIDTH_EMU, height: DEFAULT_SLIDE_HEIGHT_EMU }, background: { type: 'solid', color: '#ffffff' }, elements: els };
  }
  const slideWidth = Number(doc.size?.width ?? DEFAULT_SLIDE_WIDTH_EMU);
  const slideHeight = Number(doc.size?.height ?? DEFAULT_SLIDE_HEIGHT_EMU);
  const rawElements = (doc.elements ?? []).map((el: any, i: number) => normalizeElement(el, i, slideWidth, slideHeight));
  const elements = mergeStoredLayoutDecorations(doc, rawElements, slideWidth, slideHeight);
  // Pass doc so normalizeBackground can fall through to ooxml.layout if slide has no bg
  const background = normalizeBackground(doc.background, doc);
  return {
    version: 2,
    size: { width: slideWidth, height: slideHeight },
    background,
    elements,
    theme: extractTheme(doc.theme),
    footer: doc.footer,
    pageNumber: doc.pageNumber,
  };
}

// ─── CSS Helpers ──────────────────────────────────────────────────────────────

function backgroundCSS(bg: NormalizedBackground, theme?: ThemeColors): React.CSSProperties {
  if (bg.type === 'none') return { background: 'transparent' };
  if (bg.type === 'solid' && bg.color) return { background: resolveColor(bg.color, theme) };
  if (bg.type === 'gradient' && bg.gradient) {
    return { background: buildGradient(bg.gradient.stops, bg.gradient.angle, theme) };
  }
  // Final fallback: white for slides with no bg info
  return { background: '#f8f8f8' };
}

function fillCSS(fill: Fill | undefined, theme?: ThemeColors): { background?: string } {
  if (!fill || fill.type === 'none') return { background: 'transparent' };
  if (fill.type === 'solid') return { background: resolveColor(fill.color, theme) };
  if (fill.type === 'gradient') return { background: buildGradient(fill.stops, fill.angle, theme) };
  return {};
}

function borderLineCSS(bl: BorderLine | null | undefined, theme?: ThemeColors): string {
  if (bl === null || bl === undefined) return 'none';
  const color = resolveColor(bl.color, theme);
  return `${Math.max(1, Math.round(bl.width))}px solid ${color}`;
}

function cellBorderCSS(border: CellBorder | null | undefined, theme?: ThemeColors): string {
  if (border === null || border === undefined) return 'none';
  const color = resolveColor((border as any).color, theme);
  const width = Math.max(1, Math.round(Number((border as any).width ?? 1)));
  return `${width}px solid ${color}`;
}

// ─── Element Box ──────────────────────────────────────────────────────────────

interface CanvasCtx {
  slideW: number;  // EMU width of this coordinate space
  slideH: number;  // EMU height of this coordinate space
  refW: number;    // rendered px width for this space
  refH: number;    // rendered px height for this space
}

/**
 * Build the absolute-positioned box CSS for an element using the ctx.
 * Coordinate mapping:  originalX / slideW * refW
 * Every element uses the SAME space-wide proportional transform.
 */
function elementBoxStyle(
  transform: Transform,
  ctx: CanvasCtx,
  overflow: 'hidden' | 'visible' = 'hidden',
  debugId?: string,
): React.CSSProperties {
  const { x, y, width, height, rotation, flipH, flipV } = transform;
  const px_l = emuXToPx(x, ctx);
  const px_t = emuYToPx(y, ctx);
  const px_w = Math.max(emuXToPx(width, ctx), 1);
  const px_h = Math.max(emuYToPx(height, ctx), 1);

  // Debug: Log for first few elements
  if (debugId && Math.random() < 0.1) { // Only log ~10% to avoid spam
    console.log(`[ElementBoxStyle ${debugId}]`, {
      original: { x, y, width, height },
      ctx: { slideW: ctx.slideW, slideH: ctx.slideH, refW: ctx.refW, refH: ctx.refH },
      rendered: { left: px_l, top: px_t, width: px_w, height: px_h },
      normalized: {
        xNorm: x / ctx.slideW,
        yNorm: y / ctx.slideH,
        wNorm: width / ctx.slideW,
        hNorm: height / ctx.slideH,
      },
    });
  }

  const transforms: string[] = [];
  if (rotation) transforms.push(`rotate(${rotation}deg)`);
  if (flipH) transforms.push('scaleX(-1)');
  if (flipV) transforms.push('scaleY(-1)');

  return {
    position: 'absolute',
    left: `${px_l}px`,
    top: `${px_t}px`,
    width: `${px_w}px`,
    height: `${px_h}px`,
    transform: transforms.length ? transforms.join(' ') : undefined,
    transformOrigin: 'center center',
    overflow,
    boxSizing: 'border-box',
  };
}

// ─── Run Style → CSS ──────────────────────────────────────────────────────────

function runCSS(style: RunStyle, theme?: ThemeColors): React.CSSProperties {
  const sz = style.sz;
  const fontSize = sz ? halfPointToPx(sz) : undefined;

  const hasUnderline = Boolean(style.u) && style.u !== 'none' && style.u !== '0';
  const hasStrike = Boolean(style.strike) && style.strike !== 'noStrike' && style.strike !== '0';
  const textDecoration = [hasUnderline && 'underline', hasStrike && 'line-through'].filter(Boolean).join(' ') || undefined;

  let verticalAlign: React.CSSProperties['verticalAlign'];
  if (style.baseline) {
    if (style.baseline > 0) verticalAlign = 'super';
    else if (style.baseline < 0) verticalAlign = 'sub';
  }

  let textTransform: React.CSSProperties['textTransform'];
  if (style.cap === 'all') textTransform = 'uppercase';
  else if (style.cap === 'small') textTransform = 'small-caps';

  return {
    fontSize: fontSize != null ? `${fontSize}px` : undefined,
    fontFamily: style.latin ?? undefined,
    fontWeight: style.b ? 700 : undefined,
    fontStyle: style.i ? 'italic' : undefined,
    textDecoration: textDecoration || undefined,
    color: style.color ? resolveColor(style.color, theme) : undefined,
    verticalAlign,
    textTransform,
    letterSpacing: style.spc != null ? `${hundredthPtToPx(style.spc)}px` : undefined,
  };
}

// ─── Paragraph Line Height ────────────────────────────────────────────────────

/**
 * Calculate CSS line-height for a paragraph given its line spacing spec.
 * lnSpc encoding: >0 = percent thousandths (100000=100%), <0 = exact -(hundredths of pt), 0/undefined = default.
 */
function lineHeightCSS(lnSpc: number | undefined, fontSizePx: number): number {
  if (lnSpc === undefined || lnSpc === 0) {
    // PowerPoint default "Single" — ~1.05× font em (Latin) tighter than traditional document 1.2×
    return fontSizePx * 1.05;
  }
  if (lnSpc > 0) {
    // Percentage (100000 = 100%)
    return fontSizePx * (lnSpc / 100000);
  }
  // Exact value in hundredths-of-a-point (stored as negative)
  return hundredthPtToPx(Math.abs(lnSpc));
}

// ─── Text Alignment ───────────────────────────────────────────────────────────

const ALGN_MAP: Record<string, React.CSSProperties['textAlign']> = {
  l: 'left', r: 'right', ctr: 'center', just: 'justify', dist: 'justify', thaiDist: 'justify',
};

// ─── Vertical Anchor → Flex ───────────────────────────────────────────────────

const ANCHOR_FLEX: Record<string, React.CSSProperties['justifyContent']> = {
  t: 'flex-start', ctr: 'center', b: 'flex-end',
  dist: 'space-between', just: 'flex-start',
};

// ─── Text Element ─────────────────────────────────────────────────────────────

/**
 * Renders a PowerPoint text body with:
 * - Exact font sizes from sz (half-points)
 * - Calculated line heights from lnSpc
 * - Paragraph spacing from spcBef/spcAft
 * - Hanging indent from marL/indent
 * - Vertical alignment from anchor
 * - Inset padding from lIns/rIns/tIns/bIns
 * - Text alignment from algn
 * - Overflow: hidden (clipped as PowerPoint does)
 */
function TextElement({ paragraphs, textBody, theme, elementId, ctx }: { 
  paragraphs: Paragraph[]; 
  textBody?: TextBodyProps; 
  theme?: ThemeColors;
  elementId?: string;
  ctx: CanvasCtx;
}) {
  const anchor = textBody?.anchor ?? 't';
  const lIns = emuXToPx(textBody?.lIns ?? 91440, ctx);
  const rIns = emuXToPx(textBody?.rIns ?? 91440, ctx);
  const tIns = emuYToPx(textBody?.tIns ?? 45720, ctx);
  const bIns = emuYToPx(textBody?.bIns ?? 45720, ctx);

  // Use overflow:visible so browser line-height differences never clip text.
  // The slide canvas itself uses overflow:hidden as the outer boundary, which is
  // semantically equivalent to PowerPoint's slide boundary clipping.
  // Previously using 'hidden' here caused text that rendered slightly taller
  // (due to browser vs. PPT line-height differences) to be silently clipped.
  const textOverflow = 'visible';
  const minHeight = 0;

  return (
    <div
      id={elementId}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: ANCHOR_FLEX[anchor] ?? 'flex-start',
        padding: `${tIns}px ${rIns}px ${bIns}px ${lIns}px`,
        overflow: textOverflow,
        overflowWrap: 'anywhere',
        boxSizing: 'border-box',
        minHeight,
      }}
    >
      {paragraphs.map((para, pi) => <ParagraphElement key={pi} paragraph={para} theme={theme} ctx={ctx} />)}
    </div>
  );
}

function ParagraphElement({ paragraph, theme, ctx }: { paragraph: Paragraph; theme?: ThemeColors; ctx: CanvasCtx }) {
  const { runs, style, level } = paragraph;

  // Determine representative font size for line-height calculation
  // Use LARGEST sz among runs (max sz → max line height), with a 1400 half-point (14px)
  // fallback so body text doesn't accidentally use 24px leading (the old 2400 default).
  let largestSz = 0;
  for (const r of runs) if (r.style.sz && r.style.sz > largestSz) largestSz = r.style.sz;
  const repSz = largestSz > 0 ? largestSz : 1400;
  const repFontPx = halfPointToPx(repSz);
  const lineHeight = lineHeightCSS(style.lnSpc, repFontPx);

  // Space before/after
  const spcBefPx = style.spcBef != null
    ? (style.spcBef > 0 ? repFontPx * (style.spcBef / 100000) : hundredthPtToPx(Math.abs(style.spcBef)))
    : 0;
  const spcAftPx = style.spcAft != null
    ? (style.spcAft > 0 ? repFontPx * (style.spcAft / 100000) : hundredthPtToPx(Math.abs(style.spcAft)))
    : 0;

  // Left indent: marL is total indent, indent is first-line (negative = hanging)
  const marLPx = style.marL != null ? emuXToPx(style.marL, ctx) : level * 22.8; // 22.8px ≈ 0.25in per level
  const indentPx = style.indent != null ? emuXToPx(style.indent, ctx) : 0;

  // Bullet prefix
  let bulletPrefix = '';
  if (style.bullet === 'bullet') bulletPrefix = style.bulletChar ?? '•';
  // For numbered bullets, we'd need the paragraph index — pass it as a prop if needed

  const textAlign = ALGN_MAP[style.algn ?? 'l'] ?? 'left';

  // Only skip paragraphs that are completely empty (no runs, no text, no bullet).
  // Paragraphs with runs but empty text strings represent blank lines — keep them.
  if (!runs.length && !paragraph.text && !bulletPrefix) return <p style={{ margin: 0, padding: 0, lineHeight: `${lineHeight}px` }} />;
  if (false) return null; // unreachable but keeps TS happy

  const runContent = runs.length
    ? runs.map((run, ri) => {
        const base = <span key={ri} style={runCSS(run.style, theme)}>{run.text}</span>;
        if (!run.hyperlink?.url) return base;
        const safeUrl = /^(https?:|mailto:|tel:|#|action:)/i.test(run.hyperlink.url) ? run.hyperlink.url : undefined;
        return (
          <a
            key={`a-${ri}`}
            href={safeUrl ?? '#'}
            title={run.hyperlink.toolTip || run.hyperlink.url}
            target={run.hyperlink.external && safeUrl?.startsWith('http') ? '_blank' : undefined}
            rel={run.hyperlink.external && safeUrl?.startsWith('http') ? 'noopener noreferrer' : undefined}
            onClick={(e) => { if (!safeUrl) e.preventDefault(); }}
            style={{ color: 'inherit', textDecoration: 'underline' }}
          >{base}</a>
        );
      })
    : <span style={{ fontSize: `${repFontPx}px` }}>{paragraph.text}</span>;

  return (
    <p
      style={{
        margin: 0,
        padding: 0,
        marginTop: `${spcBefPx}px`,
        marginBottom: `${spcAftPx}px`,
        lineHeight: `${lineHeight}px`,
        textAlign,
        paddingLeft: `${marLPx + Math.max(indentPx, 0)}px`,
        textIndent: indentPx < 0 ? `${indentPx}px` : undefined, // hanging indent
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
      }}
    >
      {bulletPrefix && <span style={{ marginRight: '4px' }}>{bulletPrefix}</span>}
      {runContent}
    </p>
  );
}

// ─── Image Element ────────────────────────────────────────────────────────────

/**
 * Renders an image with exact PowerPoint crop semantics.
 *
 * OOXML srcRect l/r/t/b are in units of 1/100000 (100000 = 100% of image).
 * The element bounds already represent the VISIBLE area after crop.
 * We expand the image beyond the bounds and clip it to show only the crop region.
 *
 * Formula:
 *   scaleW = 1 / (1 - l/100000 - r/100000)
 *   scaleH = 1 / (1 - t/100000 - b/100000)
 *   imgLeft = -(l/100000) * scaleW * 100%
 *   imgTop  = -(t/100000) * scaleH * 100%
 *   imgW    = scaleW * 100%
 *   imgH    = scaleH * 100%
 */
/** User-facing error for native PPTX visual load failures */

function resolveSlideAssetUrl(src: string | undefined, presentationId?: string): string | undefined {
  if (!src || /^(data:|blob:)/i.test(src)) return src;
  const rewritten = rewriteClassroomAssetRef(src, presentationId);
  if (rewritten.startsWith('/uploads/') || rewritten.includes('/uploads/')) return withUploadAuth(rewritten);
  return rewritten;
}

export function clearClassroomPptxBufferCache() {
  clearOriginalPptxCache();
}

function ImageElement({ element, theme: _theme }: { element: NormalizedElement; theme?: ThemeColors }) {
  const { src: rawSrc, alt, crop, transform } = element;
  const src = resolveSlideAssetUrl(rawSrc);
  const { flipH, flipV, rotation } = transform;
  const altLabel = alt ? decodeSlideAltText(alt) : '';
  const showAlt = Boolean(altLabel) && !isOfficeGeneratedAlt(altLabel);

  // No src — keep layout without dumping Office alt markup onto the slide.
  if (!src) {
    return (
      <div
        style={{
          position: 'absolute', inset: 0,
          background: '#f1f5f9',
          border: '1px dashed #94a3b8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 4,
          color: '#64748b',
          fontSize: 11,
          textAlign: 'center',
          overflow: 'hidden',
        }}
      >
        <span style={{ fontSize: 20 }}>🖼</span>
        <span>Image unavailable</span>
        {showAlt && (
          <span style={{ maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {altLabel}
          </span>
        )}
      </div>
    );
  }

  const fl = (crop?.l ?? 0) / 100000;
  const fr = (crop?.r ?? 0) / 100000;
  const ft = (crop?.t ?? 0) / 100000;
  const fb = (crop?.b ?? 0) / 100000;

  const hasCrop = fl || fr || ft || fb;

  const imgFlips: string[] = [];
  if (flipH) imgFlips.push('scaleX(-1)');
  if (flipV) imgFlips.push('scaleY(-1)');

  if (!hasCrop) {
    return (
      <img
        src={src}
        alt={showAlt ? altLabel : ''}
        draggable={false}
        style={{
          position: 'absolute', inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'fill',   // PowerPoint default: stretch to fill (no ratio preservation unless explicitly set)
          display: 'block',
          transform: imgFlips.length ? imgFlips.join(' ') : undefined,
          transformOrigin: 'center center',
        }}
      />
    );
  }

  // Cropped image: expand beyond bounds and clip
  const scaleW = fl + fr < 1 ? 1 / (1 - fl - fr) : 1;
  const scaleH = ft + fb < 1 ? 1 / (1 - ft - fb) : 1;
  const imgLeftPct = -(fl * scaleW * 100);
  const imgTopPct  = -(ft * scaleH * 100);
  const imgWidthPct  = scaleW * 100;
  const imgHeightPct = scaleH * 100;

  const imgTransform = imgFlips.length ? imgFlips.join(' ') : undefined;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <img
        src={src}
        alt={showAlt ? altLabel : ''}
        draggable={false}
        style={{
          position: 'absolute',
          left: `${imgLeftPct}%`,
          top: `${imgTopPct}%`,
          width: `${imgWidthPct}%`,
          height: `${imgHeightPct}%`,
          display: 'block',
          transform: imgTransform,
          transformOrigin: 'center center',
        }}
      />
    </div>
  );
}

// ─── Shape Element (SVG) ──────────────────────────────────────────────────────

function shapePath(geometry: string, w: number, h: number, _style?: any): string {
  const g = (geometry ?? 'rect').toLowerCase();
  if (g === 'ellipse') return `M ${w / 2},0 A ${w / 2},${h / 2} 0 1,1 ${w / 2 - 0.001},0 Z`;
  if (g === 'triangle' || g === 'isoscelesTriangle') return `M ${w / 2},0 L ${w},${h} L 0,${h} Z`;
  if (g === 'rtTriangle' || g === 'rightTriangle') return `M 0,0 L ${w},${h} L 0,${h} Z`;
  if (g === 'diamond') return `M ${w / 2},0 L ${w},${h / 2} L ${w / 2},${h} L 0,${h / 2} Z`;
  if (g === 'parallelogram') return `M ${w * 0.25},0 L ${w},0 L ${w * 0.75},${h} L 0,${h} Z`;
  if (g === 'trapezoid') return `M ${w * 0.2},0 L ${w * 0.8},0 L ${w},${h} L 0,${h} Z`;
  if (g === 'pentagon') {
    const cx = w / 2, top = 0, r = Math.min(w, h) / 2;
    const pts = [0, 1, 2, 3, 4].map(i => {
      const a = (i * 72 - 90) * Math.PI / 180;
      return `${cx + r * Math.cos(a)},${h / 2 + r * Math.sin(a)}`;
    });
    return `M ${pts.join(' L ')} Z`;
  }
  if (g === 'hexagon') {
    const cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2;
    const pts = [0, 1, 2, 3, 4, 5].map(i => {
      const a = (i * 60 - 30) * Math.PI / 180;
      return `${cx + rx * Math.cos(a)},${cy + ry * Math.sin(a)}`;
    });
    return `M ${pts.join(' L ')} Z`;
  }
  if (g === 'octagon') {
    const d = Math.min(w, h) * 0.293;
    return `M ${d},0 L ${w - d},0 L ${w},${d} L ${w},${h - d} L ${w - d},${h} L ${d},${h} L 0,${h - d} L 0,${d} Z`;
  }
  if (g === 'star4' || g === 'star5' || g === 'star6' || g === 'star8') {
    const points = parseInt(g.slice(4)) || 5;
    const cx = w / 2, cy = h / 2, outerR = Math.min(w, h) / 2, innerR = outerR * 0.382;
    const pts: string[] = [];
    for (let i = 0; i < points * 2; i++) {
      const a = (i * 180 / points - 90) * Math.PI / 180;
      const r = i % 2 === 0 ? outerR : innerR;
      pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
    }
    return `M ${pts.join(' L ')} Z`;
  }
  if (g === 'line' || g === 'straightconnector1' || g.startsWith('connector')) {
    return `M 0,${h / 2} L ${w},${h / 2}`;
  }
  if (g === 'arrow' || g === 'rightarrow') {
    const ah = h * 0.4, aw = w * 0.3;
    return `M 0,${(h - ah) / 2} L ${w - aw},${(h - ah) / 2} L ${w - aw},0 L ${w},${h / 2} L ${w - aw},${h} L ${w - aw},${(h + ah) / 2} L 0,${(h + ah) / 2} Z`;
  }
  // Default: rectangle
  return `M 0,0 L ${w},0 L ${w},${h} L 0,${h} Z`;
}

function ShapeElement({ element, theme, ctx }: { element: NormalizedElement; theme?: ThemeColors; ctx: CanvasCtx }) {
  const { fill, line, geometry, transform, shadow } = element;
  const w = emuXToPx(transform.width, ctx);
  const h = emuYToPx(transform.height, ctx);

  // Fill
  let svgFill = 'none';
  let cssBackground: string | undefined;
  if (fill && fill.type !== 'none') {
    if (fill.type === 'solid') svgFill = resolveColor(fill.color, theme);
    else if (fill.type === 'gradient') {
      // Use CSS gradient on the container instead of SVG gradient for simplicity
      cssBackground = buildGradient(fill.stops, fill.angle, theme);
      svgFill = 'url(#grad)'; // Overridden by CSS
    }
  }

  const isRoundRect = geometry === 'roundRect';
  const cornerRadius = isRoundRect ? Math.min(w, h) * 0.1 : 0;
  const isEllipse = geometry === 'ellipse';

  // Stroke
  const strokeColor = line === null ? 'none' : (line ? resolveColor(line.color, theme) : 'none');
  const strokeWidth = line ? Math.max(0.5, line.width) : 0;

  // Shadow CSS
  const shadowCSS = shadow
    ? `${emuXToPx(shadow.dist, ctx)}px ${emuXToPx(shadow.dist * 0.5, ctx)}px ${emuXToPx(shadow.blurRadius, ctx)}px ${resolveColor(shadow.color, theme)}`
    : undefined;

  if (fill?.type === 'gradient' && fill.type === 'gradient') {
    // For gradient fills, use a div with CSS gradient + SVG overlay for stroke
    return (
      <>
        <div style={{ position: 'absolute', inset: 0, background: cssBackground, boxShadow: shadowCSS, borderRadius: isRoundRect ? `${cornerRadius}px` : isEllipse ? '50%' : undefined }} />
        {strokeWidth > 0 && (
          <svg style={{ position: 'absolute', inset: 0, overflow: 'visible' }} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            {isEllipse
              ? <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - strokeWidth / 2} ry={h / 2 - strokeWidth / 2} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
              : isRoundRect
              ? <rect x={strokeWidth / 2} y={strokeWidth / 2} width={w - strokeWidth} height={h - strokeWidth} rx={cornerRadius} ry={cornerRadius} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
              : <path d={shapePath(geometry ?? 'rect', w, h)} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />}
          </svg>
        )}
      </>
    );
  }

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ position: 'absolute', inset: 0, overflow: 'visible', filter: shadow ? `drop-shadow(${shadowCSS})` : undefined }}
    >
      {isEllipse ? (
        <ellipse
          cx={w / 2} cy={h / 2}
          rx={Math.max(1, w / 2 - strokeWidth / 2)}
          ry={Math.max(1, h / 2 - strokeWidth / 2)}
          fill={svgFill !== 'url(#grad)' ? svgFill : 'none'}
          stroke={strokeColor} strokeWidth={strokeWidth}
        />
      ) : isRoundRect ? (
        <rect
          x={strokeWidth / 2} y={strokeWidth / 2}
          width={Math.max(1, w - strokeWidth)} height={Math.max(1, h - strokeWidth)}
          rx={cornerRadius} ry={cornerRadius}
          fill={svgFill !== 'url(#grad)' ? svgFill : 'none'}
          stroke={strokeColor} strokeWidth={strokeWidth}
        />
      ) : (
        <path
          d={shapePath(geometry ?? 'rect', w, h)}
          fill={svgFill !== 'url(#grad)' ? svgFill : 'none'}
          stroke={strokeColor} strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

// ─── Table Element ─────────────────────────────────────────────────────────────

/**
 * PowerPoint-accurate table rendering.
 *
 * Critical rules:
 * 1. table-layout: fixed — browser never auto-sizes columns
 * 2. <colgroup> with exact px widths from OOXML tblGrid
 * 3. <tr> with exact px heights from OOXML tr[@h]
 * 4. <td> with exact padding from tcPr marL/R/T/B
 * 5. Cell borders from per-edge OOXML border descriptors
 * 6. Vertical alignment from tcPr anchor
 * 7. No automatic sizing anywhere
 */
function TableElement({ element, theme, ctx }: { element: NormalizedElement; theme?: ThemeColors; ctx: CanvasCtx }) {
  const { columns = [], rows = [] } = element;
  const tableWidth = emuXToPx(element.transform.width, ctx);
  const tableHeight = emuYToPx(element.transform.height, ctx);

  // Compute column widths in px — scale to table width if grid exceeds frame (legacy imports)
  const rawColWidths = columns.length
    ? columns.map((c) => emuXToPx(c, ctx))
    : rows[0]?.cells.map(() => tableWidth / Math.max(1, rows[0].cells.length)) ?? [];
  const rawColSum = rawColWidths.reduce((s, w) => s + w, 0);
  const colScale = rawColSum > tableWidth * 1.01 ? tableWidth / rawColSum : 1;
  const colWidths = rawColWidths.map((w) => w * colScale);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <table
        style={{
          tableLayout: 'fixed',
          borderCollapse: 'collapse',
          width: `${tableWidth}px`,
          height: `${tableHeight}px`,
          margin: 0,
          padding: 0,
        }}
      >
        <colgroup>
          {(colWidths ?? []).map((w, i) => <col key={i} style={{ width: `${w}px` }} />)}
        </colgroup>
        <tbody>
          {rows.map((row, ri) => {
            const rowHeightPx = emuYToPx(row.height, ctx);
            return (
              <tr key={ri} style={{ height: `${rowHeightPx}px` }}>
                {row.cells.map((cell, ci) => {
                  if (cell.hMerge || cell.vMerge) return null;

                  const marL = emuXToPx(cell.marL ?? 91440, ctx);
                  const marR = emuXToPx(cell.marR ?? 91440, ctx);
                  const marT = emuYToPx(cell.marT ?? 45720, ctx);
                  const marB = emuYToPx(cell.marB ?? 45720, ctx);

                  const anchor = cell.anchor ?? 't';
                  const vAlign = anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top';

                  let cellBg: string | undefined;
                  if (cell.fill && cell.fill.type !== 'none') {
                    if (cell.fill.type === 'solid') cellBg = resolveColor(cell.fill.color, theme);
                    else if (cell.fill.type === 'gradient') cellBg = buildGradient(cell.fill.stops, cell.fill.angle, theme);
                  } else if (!cell.fill && typeof (cell as any).fill === 'string') {
                    const raw = (cell as any).fill as string;
                    if (raw !== 'none' && !raw.startsWith('scheme:')) cellBg = raw;
                  }

                  const borderTop = cellBorderCSS(cell.borders?.top, theme);
                  const borderBottom = cellBorderCSS(cell.borders?.bottom, theme);
                  const borderLeft = cellBorderCSS(cell.borders?.left, theme);
                  const borderRight = cellBorderCSS(cell.borders?.right, theme);

                  return (
                    <td
                      key={ci}
                      rowSpan={cell.rowSpan || 1}
                      colSpan={cell.colSpan || 1}
                      style={{
                        padding: `${marT}px ${marR}px ${marB}px ${marL}px`,
                        verticalAlign: vAlign,
                        background: cellBg,
                        borderTop,
                        borderBottom,
                        borderLeft,
                        borderRight,
                        overflow: 'hidden',
                        boxSizing: 'border-box',
                      }}
                    >
                      {cell.paragraphs.length > 0 && (
                        <div style={{ position: 'relative', width: '100%' }}>
                          {cell.paragraphs.map((para, pi) => (
                            <ParagraphElement key={pi} paragraph={para} theme={theme} ctx={ctx} />
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Group Element ────────────────────────────────────────────────────────────

/**
 * Groups implement a child coordinate space via chOff/chExt.
 * Children's transforms are in the group's child coordinate space.
 * We scale from child coordinate space to the group's rendered px size.
 */
function GroupElement({ element, theme, ctx }: { element: NormalizedElement; theme?: ThemeColors; ctx: CanvasCtx }) {
  const { children = [], childOffset, childExtent, transform } = element;
  const groupW = emuXToPx(transform.width, ctx);
  const groupH = emuYToPx(transform.height, ctx);

  // Child coordinate space (OOXML chOff/chExt)
  const chW = childExtent?.width ?? transform.width;
  const chH = childExtent?.height ?? transform.height;
  const chOx = childOffset?.x ?? 0;
  const chOy = childOffset?.y ?? 0;

  // Sub-context mapping child-EMU space → group's rendered px
  // Child at (chOx, chOy) → group (0, 0); child at (chOx+chW, chOy+chH) → group (groupW, groupH)
  const subCtx: CanvasCtx = {
    slideW: chW,
    slideH: chH,
    refW: groupW,
    refH: groupH,
  };
  const offX = emuXToPx(chOx, subCtx);
  const offY = emuYToPx(chOy, subCtx);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          transform: `translate(${-offX}px, ${-offY}px)`,
          overflow: 'visible',
        }}
      >
        {children.map((child, idx) => (
          <ElementRenderer
            key={`${child.id || "child"}-${idx}`}
            element={child}
            theme={theme}
            ctx={subCtx}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Element Dispatcher ───────────────────────────────────────────────────────

function isElementVisible(el: NormalizedElement): boolean {
  const hasText = Boolean(el.paragraphs?.some(p => p.runs?.some((r: any) => r.text) || p.text));
  const isContent = ['image', 'table', 'chart', 'video', 'audio', 'smartArt', 'embedded', 'group', 'equation'].includes(el.type);
  if (hasText) return true;
  if (el.type === 'group' && (el.children?.length ?? 0) > 0) return true;
  if (el.type === 'image' && el.src) return true;
  // Skip zero-size elements (both dims must be zero — a zero-width line still exists)
  if (el.transform.width === 0 && el.transform.height === 0) return false;
  // Images with no src get a placeholder, so we still render them
  // Skip empty shapes with no fill, no line, no text, no content
  const hasFill = el.fill && el.fill.type !== 'none';
  const hasLine = el.line !== null && el.line !== undefined;
  if ((el.type === 'shape' || el.type === 'connector') && !hasText && !hasFill && !hasLine && !isContent) return false;
  return true;
}

function wrapWithHyperlink(
  url: string | undefined,
  toolTip: string | undefined,
  external: boolean | undefined,
  children: React.ReactNode,
): React.ReactNode {
  if (!url) return children;
  const safeUrl = /^(https?:|mailto:|tel:|#|action:)/i.test(url) ? url : undefined;
  const props: React.AnchorHTMLAttributes<HTMLAnchorElement> = {
    href: safeUrl ?? '#',
    title: toolTip || url,
    target: external && safeUrl?.startsWith('http') ? '_blank' : undefined,
    rel: external && safeUrl?.startsWith('http') ? 'noopener noreferrer' : undefined,
    onClick: (e) => { if (!safeUrl) e.preventDefault(); },
    style: { display: 'contents', color: 'inherit', textDecoration: 'none' },
  };
  return <a {...props}>{children}</a>;
}

function ChartPlaceholder({ fallback }: { fallback?: any }) {
  if (fallback && Array.isArray(fallback.rows) && Array.isArray(fallback.columns)) {
    const columns = fallback.columns as string[];
    const rows = fallback.rows as (string | number)[][];
    return (
      <div style={{ width: '100%', height: '100%', overflow: 'auto', padding: 8, background: '#fafafa', fontSize: 11, color: '#1e293b' }}>
        <div style={{ fontWeight: 600, marginBottom: 4, color: '#334155' }}>
          Chart · {(fallback.chartType as string) ?? 'unknown'}
        </div>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 200 }}>
          <thead>
            <tr>
              {columns.map((c: string, i: number) => (
                <th key={i} style={{ border: '1px solid #cbd5e1', padding: '3px 6px', background: '#e2e8f0', textAlign: 'left', fontWeight: 600 }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row: (string | number)[], ri: number) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ border: '1px solid #cbd5e1', padding: '3px 6px', background: ri % 2 ? '#f8fafc' : '#ffffff' }}>
                    {String(cell ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: '#eef2ff', color: '#4338ca', fontSize: 12, fontWeight: 600 }}>
      📊 Chart
    </div>
  );
}

function ElementRenderer({ 
  element, 
  theme,
  ctx,
  debugGeometry,
}: { 
  element: NormalizedElement; 
  theme?: ThemeColors;
  ctx: CanvasCtx;
  debugGeometry?: boolean;
}) {
  if (!isElementVisible(element)) return null;

  const { type, transform, paragraphs = [], textBody, fill, line, shadow, hyperlink, chart } = element;
  
  // Base box using consistent ctx-based transform, then override with dynamic values if provided
  const baseBox = elementBoxStyle(transform, ctx, 'hidden', element.id);
  const boxStyle: React.CSSProperties = {
    ...baseBox,
    overflow: 'visible',
  };

  const wrap = (node: React.ReactNode) => {
    const inner = wrapWithHyperlink(hyperlink?.url, hyperlink?.toolTip, hyperlink?.external, node);
    if (!debugGeometry) return inner;
    const px_l = emuXToPx(transform.x, ctx);
    const px_t = emuYToPx(transform.y, ctx);
    const px_w = Math.max(emuXToPx(transform.width, ctx), 1);
    const px_h = Math.max(emuYToPx(transform.height, ctx), 1);
    return (
      <>
        {inner}
        <div
          style={{
            position: 'absolute',
            left: baseBox.left,
            top: baseBox.top,
            width: baseBox.width,
            height: baseBox.height,
            border: '1px dashed #ef4444',
            background: 'rgba(239,68,68,0.06)',
            pointerEvents: 'none',
            zIndex: 9998,
            fontSize: 9,
            color: '#b91c1c',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ padding: 2, lineHeight: 1.2, background: 'rgba(255,255,255,0.85)' }}>
            {type.toUpperCase()} {element.id}
            <br />
            EMU {Math.round(transform.x)},{Math.round(transform.y)} {Math.round(transform.width)}×{Math.round(transform.height)}
            <br />
            px {px_l.toFixed(0)},{px_t.toFixed(0)} {px_w.toFixed(0)}×{px_h.toFixed(0)}
          </div>
        </div>
      </>
    );
  };

  // Text element (text + optional shape background)
  if (type === 'text' || type === 'equation') {
    const hasShapeBackground = fill && fill.type !== 'none';
    const borderLine = line != null ? borderLineCSS(line, theme) : undefined;
    return wrap(
      <div id={element.id} style={{ ...boxStyle, ...fillCSS(fill, theme), border: borderLine, boxSizing: 'border-box' }}>
        <TextElement paragraphs={paragraphs} textBody={textBody} theme={theme} elementId={element.id} ctx={ctx} />
      </div>
    );
  }

  // Shape with optional text
  if (type === 'shape' || type === 'connector') {
    const hasText = paragraphs.length > 0;
    return wrap(
      <div id={element.id} style={boxStyle}>
        <ShapeElement element={element} theme={theme} ctx={ctx} />
        {hasText && <TextElement paragraphs={paragraphs} textBody={textBody} theme={theme} elementId={element.id} ctx={ctx} />}
      </div>
    );
  }

  // Image
  if (type === 'image') {
    return wrap(
      <div style={{ ...boxStyle, overflow: 'visible' }}>
        <ImageElement element={element} theme={theme} />
      </div>
    );
  }

  // Table
  if (type === 'table') {
    return wrap(
      <div style={{ ...boxStyle, overflow: 'visible' }}>
        <TableElement element={element} theme={theme} ctx={ctx} />
      </div>
    );
  }

  // Chart
  if (type === 'chart') {
    const fallback = (chart as any)?.fallback ?? (element as any).fallback;
    return wrap(
      <div style={boxStyle}><ChartPlaceholder fallback={fallback} /></div>
    );
  }

  // Group
  if (type === 'group' && element.children?.length) {
    return wrap(
      <div style={elementBoxStyle(transform, ctx, 'visible', element.id)}><GroupElement element={element} theme={theme} ctx={ctx} /></div>
    );
  }

  // Video / Audio
  if (type === 'video' || type === 'audio') {
    const src = typeof element.src === 'string' ? resolveSlideAssetUrl(element.src) : undefined;
    const inner = (
      <div style={{ ...boxStyle, display: 'grid', placeItems: 'stretch', padding: 4, background: '#0f172a' }}>
        {type === 'video' && typeof src === 'string'
          ? <video src={src} controls style={{ width: '100%', height: '100%', background: '#000', objectFit: 'contain' }} />
          : type === 'audio' && typeof src === 'string'
            ? <audio src={src} controls style={{ width: '100%' }} />
            : <span style={{ display: 'grid', placeItems: 'center', color: '#cbd5e1', fontSize: 12 }}>
                {type === 'video' ? '▶ Video' : '🔊 Audio'}
              </span>}
      </div>
    );
    return wrap(inner);
  }

  // SmartArt / Embedded
  if (type === 'smartArt' || type === 'embedded') {
    const smartArtParagraphs = (paragraphs && paragraphs.length) ? paragraphs : (element as any).smartArt?.paragraphs;
    return wrap(
      <div style={{ ...boxStyle, overflow: 'auto', background: '#f1f5f9', border: '1px dashed #cbd5e1', padding: 6 }}>
        {Array.isArray(smartArtParagraphs) && smartArtParagraphs.length
          ? <TextElement paragraphs={smartArtParagraphs} theme={theme} elementId={`${element.id}-sa`} ctx={ctx} />
          : <span style={{ display: 'grid', placeItems: 'center', color: '#64748b', fontSize: 11, height: '100%' }}>
              {type === 'smartArt' ? 'SmartArt' : 'Embedded'}
            </span>}
      </div>
    );
  }

  // Fallback: render any text content
  if (paragraphs.length) {
    return wrap(
      <div style={boxStyle}>
        <TextElement paragraphs={paragraphs} textBody={textBody} theme={theme} ctx={ctx} />
      </div>
    );
  }

  return null;
}

// ─── Main SlideRenderer ───────────────────────────────────────────────────────

export function SlideRenderer({
  content,
  title,
  slideNumber,
  presentationId,
  slideId,
  className = '',
  onPointerMove,
  pointer,
  debugGeometry = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('slideDebug') === '1',
  canRepair = false,
  onRepair,
  repairing = false,
  pipelineStatus,
  slideCount,
  renderProgressSlide,
  renderStage,
  sourceType,
  sourceUrl,
}: SlideRendererProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const slideCanvasRef = useRef<HTMLDivElement>(null);
  const slide = useMemo(() => normalizeSlide(content), [content]);
  const [fitScale, setFitScale] = useState(1);
  const [nativeImageUrl, setNativeImageUrl] = useState<string | null>(null);
  const [nativeVisualError, setNativeVisualError] = useState<{ code: string; message: string } | null>(null);
  const [renderWaitTimedOut, setRenderWaitTimedOut] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [imageRetry, setImageRetry] = useState(0);
  const imageRetryTimer = useRef<number | null>(null);

  const visual = useMemo(() => {
    const raw = (content as any)?.visual;
    if (!raw || typeof raw !== 'object') return undefined;
    return raw;
  }, [content]);
  const format = String((content as any)?.format ?? 'unknown');
  const slideIndex = Math.max(0, Number(visual?.slideIndex ?? (slideNumber != null ? slideNumber - 1 : 0)));
  const resolvedSlideNumber = slideNumber ?? slideIndex + 1;
  const renderedImageUrl = classroomRenderedImageUrl(
    presentationId,
    resolvedSlideNumber,
    visual?.renderedImageUrl || visual?.src,
  );
  const authorizedImageSrc = renderedImageUrl
    ? withUploadAuth(renderedImageUrl)
    : null;
  const cacheKey = classroomImageCacheKey(visual);
  const displayImageSrc = authorizedImageSrc
    ? `${authorizedImageSrc}${authorizedImageSrc.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheKey)}${imageRetry > 0 ? `&retry=${imageRetry}` : ''}`
    : null;
  const uiState = classroomSlideUiState({
    visual,
    pipelineStatus,
    imageReady,
    sourceType,
  });
  const pipelineRendering = uiState === 'rendering';
  const visualFailed = uiState === 'failed';
  const useOriginalViewer = Boolean(presentationId && usesOriginalPresentationSource(sourceType, visual));

  const logRenderDiagnostic = useCallback((diag: RenderDiagnostic) => {
    if (import.meta.env.DEV) {
      console.info(
        [
          'PRESENTATION RENDER DIAGNOSTIC',
          '------------------------------',
          `presentationId: ${diag.presentationId ?? '(unknown)'}`,
          `slideId: ${diag.slideId ?? '(unknown)'}`,
          `slideIndex: ${diag.slideIndex}`,
          `format: ${diag.format}`,
          `hasVisual: ${diag.hasVisual}`,
          `visualType: ${diag.visualType ?? '(none)'}`,
          `visualSrc: ${diag.visualSrc ?? '(none)'}`,
          `nativeRendererAttempted: ${diag.nativeRendererAttempted}`,
          `nativeRendererSucceeded: ${diag.nativeRendererSucceeded}`,
          `structuredRendererUsed: ${diag.structuredRendererUsed}`,
          `structuredElementCount: ${diag.structuredElementCount}`,
          `nativeSvgLength: ${diag.nativeSvgLength}`,
          `activeRenderer: ${diag.activeRenderer}`,
          `fallbackReason: ${diag.fallbackReason ?? '(none)'}`,
        ].join('\n'),
      );
    }
  }, []);

  useEffect(() => {
    const rendering = uiState === 'rendering' || uiState === 'image_loading';
    if (!rendering) {
      setRenderWaitTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setRenderWaitTimedOut(true), 3 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [uiState, presentationId]);

  useEffect(() => {
    if (useOriginalViewer) {
      setNativeVisualError(null);
      setNativeImageUrl(null);
      return;
    }
    const loadNativeVisual = async () => {
      if (!visual && !presentationId) {
        setNativeVisualError(null);
        setNativeImageUrl(null);
        return;
      }
      setNativeImageUrl(displayImageSrc);
      if (uiState === 'ready') {
        setNativeVisualError(null);
        return;
      }
      if (uiState === 'image_loading' || (displayImageSrc && uiState !== 'failed')) {
        if (uiState === 'rendering' && !renderWaitTimedOut) {
          const total = slideCount || resolvedSlideNumber;
          const progress = renderProgressSlide || resolvedSlideNumber;
          const stageLabel =
            renderStage === 'PPTX_TO_PDF'
              ? 'Converting PowerPoint to PDF…'
              : renderStage === 'PPTX_DOWNLOAD' || renderStage === 'PPTX_VALIDATION'
                ? 'Preparing the original PowerPoint…'
                : renderStage === 'VISUAL_UPLOAD'
                  ? `Saving slide ${progress} of ${total}…`
                  : total
                    ? `Rendering slide ${progress} of ${total}…`
                    : `Rendering slide ${progress}…`;
          setNativeVisualError({ code: 'CLASSROOM_RENDERING', message: stageLabel });
          return;
        }
        setNativeVisualError(null);
        return;
      }
      if (visualFailed && (renderWaitTimedOut || uiState === 'failed')) {
        setNativeVisualError({
          code: String(visual?.errorCode || 'CLASSROOM_RENDER_FAILED'),
          message: String(visual?.errorMessage || 'Slide visual rendering failed. Retry rendering.'),
        });
        return;
      }
      if (uiState === 'rendering' && !renderWaitTimedOut) {
        const total = slideCount || resolvedSlideNumber;
        const progress = renderProgressSlide || resolvedSlideNumber;
        setNativeVisualError({
          code: 'CLASSROOM_RENDERING',
          message: total ? `Rendering slide ${progress} of ${total}…` : `Rendering slide ${progress}…`,
        });
        return;
      }
      setNativeVisualError(null);
    };

    void loadNativeVisual();
  }, [useOriginalViewer, visual?.type, visual?.src, visual?.renderedImageUrl, visual?.slideIndex, visual?.availability, visual?.errorCode, visual?.errorMessage, visualFailed, displayImageSrc, pipelineRendering, pipelineStatus, renderWaitTimedOut, slideNumber, presentationId, slideId, resolvedSlideNumber, slideCount, renderProgressSlide, renderStage, uiState]);

  useEffect(() => {
    if (imageRetryTimer.current != null) {
      window.clearTimeout(imageRetryTimer.current);
      imageRetryTimer.current = null;
    }
    setImageRetry(0);
    setImageReady(false);
  }, [cacheKey, presentationId, slideId]);

  useEffect(() => () => {
    if (imageRetryTimer.current != null) window.clearTimeout(imageRetryTimer.current);
  }, []);

  // Debug geometry logging (only when slideDebug=1)
  useEffect(() => {
    if (!debugGeometry) return;
    const canvas = canvasPx(slide.size.width, slide.size.height);
    console.log('[SlideRenderer debug]', title, {
      sizeEmu: slide.size,
      canvasPx: canvas,
      elements: slide.elements.map((el) => ({
        id: el.id,
        type: el.type,
        emu: el.transform,
        px: {
          x: emuXToPx(el.transform.x, { slideW: slide.size.width, slideH: slide.size.height, refW: canvas.w, refH: canvas.h }),
          y: emuYToPx(el.transform.y, { slideW: slide.size.width, slideH: slide.size.height, refW: canvas.w, refH: canvas.h }),
          w: emuXToPx(el.transform.width, { slideW: slide.size.width, slideH: slide.size.height, refW: canvas.w, refH: canvas.h }),
          h: emuYToPx(el.transform.height, { slideW: slide.size.width, slideH: slide.size.height, refW: canvas.w, refH: canvas.h }),
        },
      })),
    });
  }, [slide, title, debugGeometry]);

  const handlePointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!onPointerMove) return;
      const rect = event.currentTarget.getBoundingClientRect();
      onPointerMove({
        x: ((event.clientX - rect.left) / rect.width) * 100,
        y: ((event.clientY - rect.top) / rect.height) * 100,
      });
    },
    [onPointerMove],
  );

  const canvas = canvasPx(slide.size.width, slide.size.height);
  const slideWidthPx = canvas.w;
  const slideHeightPx = canvas.h;
  const ctx: CanvasCtx = {
    slideW: slide.size.width,
    slideH: slide.size.height,
    refW: canvas.w,
    refH: canvas.h,
  };

  // Auto-fit: constrain by width AND height so the entire slide is always visible.
  // Uses ResizeObserver so it responds immediately when side panels collapse/expand.
  useEffect(() => {
    const updateFitScale = () => {
      if (!wrapperRef.current) return;
      const container = wrapperRef.current;
      const margin = 16;
      const availW = Math.max(1, container.clientWidth - margin * 2);
      const availH = Math.max(1, container.clientHeight - margin * 2);
      const scaleByW = availW / slideWidthPx;
      const scaleByH = availH / slideHeightPx;
      // Fit into the smaller dimension so no cropping occurs
      const scale = Math.min(scaleByW, scaleByH);
      setFitScale(Math.max(0.05, Math.min(scale, 4)));
    };

    updateFitScale();
    const ro = new ResizeObserver(updateFitScale);
    if (wrapperRef.current) {
      ro.observe(wrapperRef.current);
      return () => ro.disconnect();
    }
  }, [slideWidthPx, slideHeightPx]);

  const scaledW = slideWidthPx * fitScale;
  const scaledH = slideHeightPx * fitScale;
  const showSourceVisual = Boolean(visual) && !useOriginalViewer;
  const sourceVisualReady = imageReady;

  if (useOriginalViewer) {
    return (
      <div
        ref={wrapperRef}
        className={`flex items-center justify-center bg-black ${className}`}
        onPointerMove={handlePointer}
        style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden', position: 'relative' }}
      >
        <OriginalPresentationViewer
          presentationId={presentationId}
          slideNumber={resolvedSlideNumber}
          sourceType={sourceType || (visual?.type === 'google_slides' ? 'google_slides' : 'powerpoint')}
          sourceUrl={sourceUrl || visual?.googleSlidesUrl}
          googleSlidesId={visual?.googleSlidesId}
          visualSource={visual?.visualSource}
          className="w-full h-full"
        />
        {pointer && (
          <span
            style={{
              pointerEvents: 'none',
              position: 'absolute',
              zIndex: 9999,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#ef4444',
              border: '2px solid white',
              boxShadow: '0 0 6px rgba(0,0,0,.4)',
              left: `calc(${pointer.x}% - 8px)`,
              top: `calc(${pointer.y}% - 8px)`,
            }}
          />
        )}
      </div>
    );
  }

  const sourceVisualStatus = nativeVisualError ? (
    <div
      data-testid="classroom-visual-error"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        padding: 40,
        textAlign: 'center',
        background: '#0f172a',
        color: '#e2e8f0',
        zIndex: 10,
      }}
    >
      <div>
        <p style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>
          {nativeVisualError.code === 'CLASSROOM_RENDERING'
            ? 'Slide visual is still rendering'
            : nativeVisualError.code === 'IMAGE_LOAD_FAILED'
              ? 'Unable to load rendered slide image.'
            : nativeVisualError.code === 'CLASSROOM_RENDER_FAILED'
              ? 'Slide visual rendering failed. Retry.'
              : nativeVisualError.code === 'CLASSROOM_RENDER_SLIDE_FAILED'
                ? 'Slide visual rendering failed. Retry.'
                : 'Slide visual rendering failed. Retry.'}
        </p>
        <p style={{ fontSize: 14, margin: '0 0 12px', color: '#94a3b8', maxWidth: 420 }}>
          {nativeVisualError.code === 'CLASSROOM_RENDERING'
            ? nativeVisualError.message
            : nativeVisualError.code === 'IMAGE_LOAD_FAILED'
              ? 'The rendered image is stored, but the browser could not load it yet. This is not a PowerPoint conversion failure.'
            : 'The original slide image could not be loaded. Structured extraction is kept for search and interactions, but it is not shown as the classroom visual.'}
        </p>
        <p style={{ fontSize: 12, margin: 0, color: '#64748b', fontFamily: 'ui-monospace, monospace' }}>
          Code: {nativeVisualError.code}
          {slideNumber != null ? ` · Slide: ${slideNumber}` : ''}
          {presentationId ? ` · Presentation: ${presentationId}` : ''}
        </p>
        {canRepair && onRepair && nativeVisualError.code !== 'CLASSROOM_RENDERING' && nativeVisualError.code !== 'IMAGE_LOAD_FAILED' && (
          <button
            type="button"
            onClick={onRepair}
            disabled={repairing}
            style={{
              marginTop: 16,
              padding: '8px 14px',
              borderRadius: 8,
              border: 0,
              background: '#6d28d9',
              color: 'white',
              fontWeight: 600,
              cursor: repairing ? 'wait' : 'pointer',
            }}
          >
            {repairing ? 'Regenerating…' : nativeVisualError.code === 'CLASSROOM_RENDER_SLIDE_FAILED' ? 'Retry this slide' : 'Retry rendering'}
          </button>
        )}
      </div>
    </div>
  ) : (
    <div
      data-testid="classroom-visual-loading"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: '#0f172a',
        color: '#e2e8f0',
        zIndex: 10,
      }}
    >
      Loading slide visual…
    </div>
  );

  return (
    <div
      ref={wrapperRef}
      className={`flex items-center justify-center bg-[#F7F8FA] ${className}`}
      onPointerMove={handlePointer}
      style={{
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/*
        Scale-to-fit: outer clip box matches the *visual* scaled size.
        Inner canvas keeps source dimensions and scales from top-left so
        layout size (960×540) does not fight flex centering.
      */}
      <div
        style={{
          width: `${scaledW}px`,
          height: `${scaledH}px`,
          overflow: 'hidden',
          flexShrink: 0,
          position: 'relative',
          boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
          ...(showSourceVisual && sourceVisualReady ? {} : backgroundCSS(slide.background, slide.theme)),
        }}
      >
        <div
          ref={slideCanvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${slideWidthPx}px`,
            height: `${slideHeightPx}px`,
            transformOrigin: '0 0',
            transform: `scale(${fitScale})`,
            transition: 'transform 120ms ease',
          }}
        >
          {showSourceVisual && displayImageSrc ? (
            <>
              <img
                data-testid="classroom-slide-visual"
                src={displayImageSrc}
                alt={title || `Slide ${slideNumber ?? ''}`}
                onLoad={() => {
                  setImageReady(true);
                  setNativeVisualError(null);
                }}
                onError={() => {
                  setImageReady(false);
                  const maxRetries = 5;
                  if (imageRetry < maxRetries) {
                    const delay = Math.min(8000, 400 * (2 ** imageRetry));
                    if (imageRetryTimer.current != null) window.clearTimeout(imageRetryTimer.current);
                    imageRetryTimer.current = window.setTimeout(() => {
                      setImageRetry((value) => value + 1);
                    }, delay);
                    if (uiState === 'failed') {
                      setNativeVisualError({
                        code: String(visual?.errorCode || 'CLASSROOM_RENDER_SLIDE_FAILED'),
                        message: String(visual?.errorMessage || 'Slide visual unavailable'),
                      });
                      return;
                    }
                    setNativeVisualError({
                      code: 'CLASSROOM_RENDERING',
                      message: `Rendering slide ${resolvedSlideNumber} of ${slideCount || resolvedSlideNumber}…`,
                    });
                    return;
                  }
                  if (uiState === 'failed') {
                    setNativeVisualError({
                      code: String(visual?.errorCode || 'CLASSROOM_RENDER_SLIDE_FAILED'),
                      message: String(visual?.errorMessage || 'Slide visual unavailable'),
                    });
                    return;
                  }
                  setNativeVisualError({
                    code: 'IMAGE_LOAD_FAILED',
                    message: 'Unable to load rendered slide image.',
                  });
                }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  background: '#000',
                  pointerEvents: 'none',
                  zIndex: 0,
                  opacity: sourceVisualReady ? 1 : 0,
                }}
              />
              {!sourceVisualReady ? sourceVisualStatus : null}
            </>
          ) : showSourceVisual ? (
            sourceVisualStatus
          ) : (
            <>
              {slide.elements.map((el, idx) => (
                <ElementRenderer
                  key={`${el.id || "el"}-${idx}`}
                  element={el}
                  theme={slide.theme}
                  ctx={ctx}
                  debugGeometry={debugGeometry}
                />
              ))}
            </>
          )}

          {/* Laser pointer */}
          {pointer && (
            <span
              style={{
                pointerEvents: 'none',
                position: 'absolute',
                zIndex: 9999,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#ef4444',
                border: '2px solid white',
                boxShadow: '0 0 6px rgba(0,0,0,.4)',
                left: `${pointer.x * slideWidthPx / 100 - 8}px`,
                top: `${pointer.y * slideHeightPx / 100 - 8}px`,
              }}
            />
          )}

          {/* Footer / page number only for manually authored slides */}
          {!showSourceVisual && slide.footer && (
            <div style={{ position: 'absolute', bottom: 8, left: 20, fontSize: 10, color: '#64748b', zIndex: 9990 }}>
              {slide.footer}
            </div>
          )}
          {!showSourceVisual && (slide.pageNumber ?? slideNumber) && (
            <div style={{ position: 'absolute', bottom: 8, right: 16, fontSize: 10, color: '#64748b', zIndex: 9990 }}>
              {slide.pageNumber ?? slideNumber}
            </div>
          )}

          {!showSourceVisual && !slide.elements.length && !nativeVisualError && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 40, textAlign: 'center', color: '#64748b' }}>
              <div>
                <p style={{ fontSize: 24, fontWeight: 600, color: '#334155', margin: '0 0 8px' }}>{title ?? 'Untitled slide'}</p>
                <p style={{ fontSize: 14, margin: 0 }}>This slide has no visible objects.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
