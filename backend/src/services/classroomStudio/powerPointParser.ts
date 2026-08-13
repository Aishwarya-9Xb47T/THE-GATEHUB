/**
 * OOXML-aware PowerPoint importer.
 *
 * Architecture:
 *  - PPTX is a ZIP containing XML parts with relationship-based references.
 *  - Never infer slide order, media paths, or layout links from filenames.
 *  - All cross-part references are resolved through .rels files.
 *  - Output is a typed SlideDocument stored in the database; OOXML is never
 *    sent to the browser.
 *
 * Enhanced extraction (2025-08):
 *  - Full paragraph props: lnSpc, spcBef, spcAft, marL, indent
 *  - Full run props: sz, b, i, u, strike, latin, color, baseline, spc, cap
 *  - Text body props: anchor, wrap, autofit, insets (lIns/rIns/tIns/bIns), rot, vert
 *  - Rich fills: solid, gradient (stops + angle), noFill explicit
 *  - Shape lines: width, color, dash
 *  - Table cell: anchor, marL/R/T/B padding, per-edge borders
 *  - Groups: correct grpSpPr position + parsed child element objects
 */

import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import type { ImportResult, PowerPointImportOptions } from './types.js';

// ─── XML Parser ───────────────────────────────────────────────────────────────

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: false,
  parseTagValue: false,
});

// ─── Utility Helpers ──────────────────────────────────────────────────────────

/** Ensure a value is always an array */
const A = <T>(value: T | T[] | undefined): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];

/** Extract text content from OOXML text node */
const text = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object'
      ? String((value as any)['#text'] ?? '')
      : '';

/** Extract XML attributes (keys starting with @_) into a plain object */
const attrs = (value: any) =>
  Object.fromEntries(
    Object.entries(value ?? {})
      .filter(([k]) => k.startsWith('@_'))
      .map(([k, v]) => [k.slice(2), v]),
  );

/** Resolve a relative relationship target path */
const relTarget = (part: string, target: string): string => {
  const base = part.slice(0, part.lastIndexOf('/') + 1);
  const joined = target.startsWith('/') ? target.slice(1) : `${base}${target}`;
  const out: string[] = [];
  for (const p of joined.split('/')) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/');
};

const extMime: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', svg: 'image/svg+xml',
  emf: 'image/emf', wmf: 'image/wmf', mp4: 'video/mp4', mov: 'video/quicktime',
  webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', wma: 'audio/x-ms-wma',
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Relationships = Record<string, { target: string; type: string; external: boolean }>;
export interface ImportedAsset { path: string; data: Buffer; mimeType: string; }

// ─── Relationship Parsing ─────────────────────────────────────────────────────

function relationshipsFromXml(part: string, source: string | undefined): Relationships {
  if (!source) return {};
  const parsed = xml.parse(source);
  const result: Relationships = {};
  for (const rel of A(parsed.Relationships?.Relationship)) {
    const id = rel['@_Id'];
    const target = rel['@_Target'];
    if (id && target) {
      result[id] = {
        target: relTarget(part, target),
        type: rel['@_Type'] ?? '',
        external: rel['@_TargetMode'] === 'External',
      };
    }
  }
  return result;
}

// ─── Transform Extraction ─────────────────────────────────────────────────────

function transform(node: any) {
  const x = node?.['a:xfrm'] ?? node?.['p:xfrm'] ?? node;
  const off = x?.['a:off'] ?? {};
  const ext = x?.['a:ext'] ?? {};
  return {
    x: Number(off['@_x'] ?? 0),
    y: Number(off['@_y'] ?? 0),
    width: Number(ext['@_cx'] ?? 0),
    height: Number(ext['@_cy'] ?? 0),
    rotation: Number(x?.['@_rot'] ?? 0) / 60000,
    flipH: x?.['@_flipH'] === '1',
    flipV: x?.['@_flipV'] === '1',
  };
}

/** Google Slides / PowerPoint default graphicFrame extent when real size lives in tblGrid */
const GRAPHIC_FRAME_PLACEHOLDER_EMU = 3_000_000;

/** Resolve table frame bounds from tblGrid column widths and row heights when xfrm is a placeholder */
function resolveTableBounds(
  position: ReturnType<typeof transform>,
  tblData: { columns: number[]; rows: { height?: number }[] },
): ReturnType<typeof transform> {
  const colSum = tblData.columns.reduce((s, c) => s + Number(c || 0), 0);
  const rowSum = tblData.rows.reduce((s, r) => s + Number(r.height ?? 0), 0);
  const isPlaceholder =
    position.width === GRAPHIC_FRAME_PLACEHOLDER_EMU &&
    position.height === GRAPHIC_FRAME_PLACEHOLDER_EMU;

  let { width, height } = position;
  if (colSum > 0 && (isPlaceholder || colSum > width * 1.02)) width = colSum;
  if (rowSum > 0 && (isPlaceholder || rowSum > height * 1.02 || (isPlaceholder && rowSum < height))) {
    height = rowSum;
  }
  return { ...position, width, height };
}

/** Extract group position from p:grpSpPr */
function groupTransform(grpSpPr: any) {
  const xfrm = grpSpPr?.['a:xfrm'] ?? {};
  const off   = xfrm['a:off']   ?? {};
  const ext   = xfrm['a:ext']   ?? {};
  const chOff = xfrm['a:chOff'] ?? {};
  const chExt = xfrm['a:chExt'] ?? {};
  return {
    position: {
      x: Number(off['@_x'] ?? 0),
      y: Number(off['@_y'] ?? 0),
      width: Number(ext['@_cx'] ?? 0),
      height: Number(ext['@_cy'] ?? 0),
      rotation: Number(xfrm['@_rot'] ?? 0) / 60000,
      flipH: xfrm['@_flipH'] === '1',
      flipV: xfrm['@_flipV'] === '1',
    },
    childOffset: {
      x: Number(chOff['@_x'] ?? 0),
      y: Number(chOff['@_y'] ?? 0),
    },
    childExtent: {
      width: Number(chExt['@_cx'] ?? 0),
      height: Number(chExt['@_cy'] ?? 0),
    },
  };
}

// ─── Color Extraction ─────────────────────────────────────────────────────────

/** Resolve a color from an OOXML color node container (e.g. a:solidFill parent) */
function resolveColorNode(node: any): string | undefined {
  if (!node) return undefined;
  if (node['a:noFill'] !== undefined) return 'none';
  const fill = node['a:solidFill'];
  if (!fill) return undefined;
  const rgb = fill['a:srgbClr']?.['@_val'];
  if (rgb) return `#${rgb}`;
  const sys = fill['a:sysClr']?.['@_lastClr'];
  if (sys) return `#${sys}`;
  const scheme = fill['a:schemeClr']?.['@_val'];
  if (scheme) return `scheme:${scheme}`;
  return undefined;
}

function color(node: any): string | undefined { return resolveColorNode(node); }

/** Extract a color from a run properties node (a:rPr) */
function runColor(rPr: any): string | undefined {
  if (!rPr) return undefined;
  return resolveColorNode(rPr);
}

// ─── Fill Extraction (Rich) ───────────────────────────────────────────────────

/**
 * Extract a rich fill descriptor from a shape property node (p:spPr or similar).
 * Returns a typed object compatible with the frontend Fill type.
 */
function extractFill(spPr: any): { type: string; color?: string; stops?: any[]; angle?: number } | undefined {
  if (!spPr) return undefined;
  if (spPr['a:noFill'] !== undefined) return { type: 'none' };

  const solidFill = spPr['a:solidFill'];
  if (solidFill) {
    const clr = color(spPr);
    return clr ? { type: 'solid', color: clr } : undefined;
  }

  const gradFill = spPr['a:gradFill'];
  if (gradFill) {
    const lin = gradFill['a:lin'];
    const angle = lin ? Number(lin['@_ang'] ?? 0) / 60000 : 0;
    const stopsRaw = gradFill?.['a:gsLst']?.['a:gs'];
    const stopsArr = Array.isArray(stopsRaw) ? stopsRaw : stopsRaw ? [stopsRaw] : [];
    const stops = stopsArr.map((gs: any) => {
      const pos = Number(gs['@_pos'] ?? 0);
      const rgb = gs['a:srgbClr']?.['@_val'];
      const sys = gs['a:sysClr']?.['@_lastClr'];
      const scheme = gs['a:schemeClr']?.['@_val'];
      return { pos, color: rgb ? `#${rgb}` : sys ? `#${sys}` : scheme ? `scheme:${scheme}` : '#000000' };
    });
    return { type: 'gradient', stops, angle };
  }

  return undefined;
}

// ─── Line Extraction ──────────────────────────────────────────────────────────

/** Extract border/line descriptor from a:ln node */
function extractLine(spPr: any): { color: string; width: number; dash?: string } | null | undefined {
  const ln = spPr?.['a:ln'];
  if (!ln) return undefined;
  if (ln['a:noFill'] !== undefined) return null; // explicit no-line
  const w = Number(ln['@_w'] ?? 12700); // 12700 EMU = 1pt
  const solid = ln['a:solidFill'];
  const rgb    = solid?.['a:srgbClr']?.['@_val'];
  const sys    = solid?.['a:sysClr']?.['@_lastClr'];
  const scheme = solid?.['a:schemeClr']?.['@_val'];
  const clr = rgb ? `#${rgb}` : sys ? `#${sys}` : scheme ? `scheme:${scheme}` : '#000000';
  const dash = ln['a:prstDash']?.['@_val'] || undefined;
  return { color: clr, width: Math.max(1, Math.round(w / 12700)), dash };
}

// ─── Border (Table/Cell) Extraction ──────────────────────────────────────────

function parseBorderLine(ln: any): { color: string; width: number } | null | undefined {
  if (ln === undefined) return undefined;
  if (ln['a:noFill'] !== undefined) return null;
  const w = Number(ln['@_w'] ?? 12700);
  const solid = ln['a:solidFill'];
  const rgb    = solid?.['a:srgbClr']?.['@_val'];
  const sys    = solid?.['a:sysClr']?.['@_lastClr'];
  const scheme = solid?.['a:schemeClr']?.['@_val'];
  const clr = rgb ? `#${rgb}` : sys ? `#${sys}` : scheme ? `scheme:${scheme}` : '#000000';
  return { color: clr, width: Math.round(w / 12700) };
}

function parseCellBorders(tcPr: any) {
  if (!tcPr) return {};
  return {
    top:    parseBorderLine(tcPr['a:lnT']),
    bottom: parseBorderLine(tcPr['a:lnB']),
    left:   parseBorderLine(tcPr['a:lnL']),
    right:  parseBorderLine(tcPr['a:lnR']),
  };
}

// ─── Text Body Props ──────────────────────────────────────────────────────────

/**
 * Extract text body properties from p:txBody or p:sp's p:txBody.
 * Returns props for the SlideDocument textBody field.
 */
function textBodyProps(txBody: any): Record<string, unknown> | undefined {
  const bodyPr = txBody?.['a:bodyPr'];
  if (!bodyPr) return undefined;

  const autofit = bodyPr['a:normAutofit']
    ? 'normAutofit'
    : bodyPr['a:spAutoFit']
    ? 'spAutofit'
    : bodyPr['a:noAutofit']
    ? 'none'
    : undefined;

  return {
    anchor:  bodyPr['@_anchor']  || undefined,
    wrap:    bodyPr['@_wrap']    || undefined,
    autofit,
    lIns: Number(bodyPr['@_lIns'] ?? 91440),
    rIns: Number(bodyPr['@_rIns'] ?? 91440),
    tIns: Number(bodyPr['@_tIns'] ?? 45720),
    bIns: Number(bodyPr['@_bIns'] ?? 45720),
    rot:  bodyPr['@_rot'] ? Number(bodyPr['@_rot']) / 60000 : undefined,
    vert: bodyPr['@_vert'] || undefined,
  };
}

// ─── Paragraph Parsing ────────────────────────────────────────────────────────

/**
 * Parse all paragraphs from a text body node into the canonical format.
 * Extracts full paragraph and run properties needed for accurate layout,
 * including hyperlinks via a:hlinkClick relationships.
 */
function paragraphs(txBody: any, rels: Relationships = {}): any[] {
  if (!txBody) return [];

  return A(txBody['a:p']).map((p: any) => {
    const pPr = p['a:pPr'] ?? {};

    // ── Run extraction ────────────────────────────────────────────────────────
    const runs = [
      ...A(p['a:r']).map((r: any) => {
        const rPr = r['a:rPr'] ?? {};
        let hyperlink: { url?: string; toolTip?: string; external?: boolean } | undefined;
        const hlinkClick = rPr['a:hlinkClick'];
        if (hlinkClick) {
          const rid = hlinkClick['@_r:id'];
          const toolTip = hlinkClick['@_tooltip'];
          const rel = rid ? rels[rid] : undefined;
          if (rel) {
            hyperlink = {
              url: rel.target,
              toolTip: toolTip || undefined,
              external: rel.external,
            };
          } else if (hlinkClick['@_action']) {
            hyperlink = {
              url: `action:${hlinkClick['@_action']}`,
              toolTip: toolTip || undefined,
              external: true,
            };
          }
        }
        return {
          text: text(r['a:t']),
          style: {
            sz:       rPr['@_sz'] != null ? Number(rPr['@_sz']) : undefined,
            b:        rPr['@_b'] === '1',
            i:        rPr['@_i'] === '1',
            u:        rPr['@_u'] != null ? String(rPr['@_u']) : undefined,
            strike:   rPr['@_strike'] != null ? String(rPr['@_strike']) : undefined,
            latin:    rPr['a:latin']?.['@_typeface'] ? String(rPr['a:latin']['@_typeface']).replace('+mj-lt', '').replace('+mn-lt', '').trim() || undefined : undefined,
            color:    runColor(rPr),
            baseline: rPr['@_baseline'] != null ? Number(rPr['@_baseline']) : undefined,
            spc:      rPr['@_spc'] != null ? Number(rPr['@_spc']) : undefined,
            cap:      rPr['@_cap'] || undefined,
          },
          hyperlink,
        };
      }),
      // Field runs (slide number, date, etc.)
      ...A(p['a:fld']).map((fld: any) => ({
        text: text(fld['a:t']),
        style: {},
      })),
    ];

    // ── Line spacing ──────────────────────────────────────────────────────────
    let lnSpc: number | undefined;
    const lnSpcNode = pPr['a:lnSpc'];
    if (lnSpcNode?.['a:spcPct']) {
      // Percentage: value in thousandths of a percent (100000 = 100%)
      lnSpc = Number(lnSpcNode['a:spcPct']['@_val'] ?? 100000);
    } else if (lnSpcNode?.['a:spcPts']) {
      // Exact: value in hundredths of a point — store as negative to differentiate
      lnSpc = -Number(lnSpcNode['a:spcPts']['@_val'] ?? 0);
    }

    // ── Space before / after ─────────────────────────────────────────────────
    let spcBef: number | undefined;
    const spcBefNode = pPr['a:spcBef'];
    if (spcBefNode?.['a:spcPts']) spcBef = -Number(spcBefNode['a:spcPts']['@_val'] ?? 0);
    else if (spcBefNode?.['a:spcPct']) spcBef = Number(spcBefNode['a:spcPct']['@_val'] ?? 0);

    let spcAft: number | undefined;
    const spcAftNode = pPr['a:spcAft'];
    if (spcAftNode?.['a:spcPts']) spcAft = -Number(spcAftNode['a:spcPts']['@_val'] ?? 0);
    else if (spcAftNode?.['a:spcPct']) spcAft = Number(spcAftNode['a:spcPct']['@_val'] ?? 0);

    // ── Bullet ───────────────────────────────────────────────────────────────
    let bullet: string | undefined;
    let bulletChar: string | undefined;
    let bulletFont: string | undefined;
    if (pPr['a:buNone']) {
      bullet = 'none';
    } else if (pPr['a:buAutoNum']) {
      bullet = 'numbered';
    } else if (pPr['a:buChar']) {
      bullet = 'bullet';
      bulletChar = String(pPr['a:buChar']['@_char'] ?? '•');
    } else if (pPr['a:buBlip']) {
      bullet = 'bullet';
      bulletChar = '●';
    }
    if (pPr['a:buFont']) {
      bulletFont = String(pPr['a:buFont']['@_typeface'] ?? '');
    }

    const paragraphText = runs.map((r: any) => r.text).join('');

    return {
      text: paragraphText,
      level: Number(pPr['@_lvl'] ?? 0),
      runs,
      style: {
        algn:      pPr['@_algn'] || undefined,
        lnSpc,
        spcBef,
        spcAft,
        marL:      pPr['@_marL'] != null ? Number(pPr['@_marL']) : undefined,
        indent:    pPr['@_indent'] != null ? Number(pPr['@_indent']) : undefined,
        defTabSz:  pPr['@_defTabSz'] != null ? Number(pPr['@_defTabSz']) : undefined,
        bullet,
        bulletChar,
        bulletFont,
      },
    };
  });
  // Note: We intentionally keep ALL paragraphs, including blank ones.
  // Blank paragraphs represent intentional line breaks in PowerPoint.
  // Filtering them out changes vertical spacing versus the original.
}

// ─── Hyperlink Extraction ─────────────────────────────────────────────────────

/** Extract a hyperlink descriptor from a shape's cNvPr (non-visual drawing props) */
function shapeHyperlink(cNvPr: any, rels: Relationships): { url?: string; toolTip?: string; external?: boolean } | undefined {
  if (!cNvPr) return undefined;
  const hlinkClick = cNvPr['a:hlinkClick'];
  if (!hlinkClick) return undefined;
  const rid = hlinkClick['@_r:id'];
  const toolTip = hlinkClick['@_tooltip'];
  const rel = rid ? rels[rid] : undefined;
  if (rel) {
    return { url: rel.target, toolTip: toolTip || undefined, external: rel.external };
  }
  if (hlinkClick['@_action']) {
    return { url: `action:${hlinkClick['@_action']}`, toolTip: toolTip || undefined, external: true };
  }
  return undefined;
}

// ─── Table Parsing ────────────────────────────────────────────────────────────

function table(tbl: any, rels: Relationships = {}): any {
  const rows = A(tbl['a:tr'])
    .map((row: any) => {
      const rowHeight = Number(row['@_h'] ?? 0);
      if (rowHeight === 0) return null; // invisible separator

      return {
        height: rowHeight,
        cells: A(row['a:tc']).map((cell: any) => {
          const tcPr = cell['a:tcPr'];
          const cellParagraphs = paragraphs(cell['a:txBody'], rels);

          // Cell fill
          let fill: any = undefined;
          if (tcPr) {
            if (tcPr['a:noFill'] !== undefined) fill = { type: 'none' };
            else {
              const solidFill = tcPr['a:solidFill'];
              if (solidFill) {
                const rgb = solidFill['a:srgbClr']?.['@_val'];
                const sys = solidFill['a:sysClr']?.['@_lastClr'];
                const scheme = solidFill['a:schemeClr']?.['@_val'];
                const clr = rgb ? `#${rgb}` : sys ? `#${sys}` : scheme ? `scheme:${scheme}` : undefined;
                if (clr) fill = { type: 'solid', color: clr };
              }
              const gradFill = tcPr['a:gradFill'];
              if (gradFill) {
                const lin = gradFill['a:lin'];
                const angle = lin ? Number(lin['@_ang'] ?? 0) / 60000 : 0;
                const stopsRaw = gradFill?.['a:gsLst']?.['a:gs'];
                const stopsArr = Array.isArray(stopsRaw) ? stopsRaw : stopsRaw ? [stopsRaw] : [];
                const stops = stopsArr.map((gs: any) => ({
                  pos: Number(gs['@_pos'] ?? 0),
                  color: gs['a:srgbClr']?.['@_val'] ? `#${gs['a:srgbClr']['@_val']}` : '#ffffff',
                }));
                fill = { type: 'gradient', stops, angle };
              }
            }
          }

          return {
            text: cellParagraphs.map((p: any) => p.text).join('\n'),
            paragraphs: cellParagraphs,
            rowSpan: Number(cell['@_rowSpan'] ?? 1),
            colSpan: Number(cell['@_gridSpan'] ?? 1),
            hMerge: cell['@_hMerge'] === '1',
            vMerge: cell['@_vMerge'] === '1',
            fill,
            borders: parseCellBorders(tcPr),
            // Vertical alignment: t (top), ctr (center), b (bottom)
            anchor: tcPr?.['@_anchor'] || undefined,
            // Cell padding in EMU
            marL: tcPr?.['@_marL'] != null ? Number(tcPr['@_marL']) : 91440,
            marR: tcPr?.['@_marR'] != null ? Number(tcPr['@_marR']) : 91440,
            marT: tcPr?.['@_marT'] != null ? Number(tcPr['@_marT']) : 45720,
            marB: tcPr?.['@_marB'] != null ? Number(tcPr['@_marB']) : 45720,
          };
        }),
      };
    })
    .filter(Boolean);

  return {
    columns: A(tbl['a:tblGrid']?.['a:gridCol']).map((c: any) => Number(c['@_w'] ?? 0)),
    rows,
  };
}

// ─── Invisible Table Detection ────────────────────────────────────────────────

function isInvisibleTable(tblData: { columns: number[]; rows: any[] }): boolean {
  for (const row of tblData.rows) {
    for (const cell of row.cells) {
      const b = cell.borders as Record<string, any>;
      for (const side of ['top', 'bottom', 'left', 'right']) {
        if (b[side] !== null) return false;
      }
      if (cell.fill && cell.fill.type !== 'none') return false;
      if (cell.text?.trim()) return false;
    }
  }
  return true;
}

// ─── Text Extraction (notes / fallback) ──────────────────────────────────────

function findText(node: any): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(findText).join('');
  if (typeof node !== 'object') return '';
  return Object.entries(node)
    .filter(([k]) => !k.startsWith('@_'))
    .map(([k, v]) => (k === 'a:t' || k === '#text' ? findText(v) : findText(v)))
    .join('');
}

// ─── SmartArt / Diagram Fallback Extraction ───────────────────────────────────

/**
 * Extract readable text from a SmartArt/diagram data part.
 * SmartArt stores its own shape tree in dgm:spTree inside the diagram part (e.g. ppt/diagrams/diagramN.xml).
 * This walks that tree and extracts all text into a series of paragraphs.
 */
function extractSmartArtFallback(diagramXml: string | undefined): { paragraphs: any[]; rawText: string } | undefined {
  if (!diagramXml) return undefined;
  try {
    const parsed = xml.parse(diagramXml);
    const found: any[] = [];
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (node['dgm:spTxbx']?.['a:txBody'] || node['dgm:t']) {
        const txBody = node['dgm:spTxbx']?.['a:txBody'] ?? (node['dgm:t'] ? { 'a:p': [{ 'a:r': [{ 'a:t': node['dgm:t'] }] }] } : undefined);
        if (txBody) {
          const paras = paragraphs(txBody, {});
          for (const p of paras) found.push(p);
        }
      }
      for (const v of Object.values(node)) {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') walk(v);
      }
    };
    walk(parsed);
    if (found.length === 0) return undefined;
    return { paragraphs: found, rawText: found.map((p: any) => p.text).filter(Boolean).join('\n') };
  } catch {
    return undefined;
  }
}

// ─── Chart Fallback Extraction ────────────────────────────────────────────────

/**
 * Convert a chart XML part into a tabular fallback structure.
 * Extracts category axis (c:cat) and series values (c:val) into rows/columns
 * so the chart is still representable even if we don't render a plot.
 */
function extractChartFallback(chartXml: string | undefined): { columns: string[]; rows: any[]; chartType?: string } | undefined {
  if (!chartXml) return undefined;
  try {
    const c = xml.parse(chartXml);
    const plotArea = c['c:chartSpace']?.['c:chart']?.['c:plotArea'];
    if (!plotArea) return undefined;

    const chartTypes = ['c:barChart', 'c:bar3DChart', 'c:lineChart', 'c:line3DChart', 'c:pieChart', 'c:pie3DChart',
      'c:doughnutChart', 'c:areaChart', 'c:area3DChart', 'c:scatterChart', 'c:bubbleChart', 'c:radarChart'];
    let chartType: string | undefined;
    let chartNode: any = undefined;
    for (const t of chartTypes) {
      if (plotArea[t]) { chartType = t.slice(2); chartNode = plotArea[t]; break; }
    }
    if (!chartNode || !chartType) return undefined;

    const series = A(chartNode['c:ser']);
    if (series.length === 0) return undefined;

    const catText = (arr: any) => A(arr?.['c:strRef']?.['c:strCache']?.['c:pt'] ?? arr?.['c:numRef']?.['c:numCache']?.['c:pt'])
      .map((pt: any) => text(pt['c:v'] ?? pt)).filter(Boolean);

    const seriesLabels = series.map((s: any) =>
      text(s?.['c:tx']?.['c:v'] ?? s?.['c:tx']?.['c:strRef']?.['c:strCache']?.['c:pt']?.[0]?.['c:v'] ?? s?.['c:idx']?.['@_val'] ?? 'Series')
    );
    const categories = catText(series[0]?.['c:cat']);
    const columns = ['Category', ...seriesLabels];
    const rows: any[] = [];
    const rowCount = Math.max(categories.length, ...series.map((s: any) => catText(s?.['c:val']).length));
    for (let r = 0; r < rowCount; r++) {
      const cells = [categories[r] ?? ''];
      for (const s of series) {
        const vals = catText(s?.['c:val']);
        cells.push(vals[r] ?? '');
      }
      rows.push({ height: 0, cells: cells.map((t) => ({ text: t, paragraphs: [{ text: t, runs: [{ text: t, style: {} }], style: {} }], fill: undefined, borders: {}, rowSpan: 1, colSpan: 1 })) });
    }
    return { columns, rows, chartType };
  } catch {
    return undefined;
  }
}

// ─── Group Children Parsing ───────────────────────────────────────────────────

/** Parse child elements within a p:grpSp node into normalized element objects */
async function parseGroupChildren(
  group: any,
  rels: Relationships,
  slideIndex: number,
  assetUrlFn: (target: string, external: boolean) => Promise<string | undefined>,
): Promise<any[]> {
  const children: any[] = [];

  // Shapes (text or plain shapes)
  for (const shape of A(group['p:sp'])) {
    const shapeParagraphs = paragraphs(shape['p:txBody'], rels);
    const spPr = shape['p:spPr'];
    const cNvPr = shape?.['p:nvSpPr']?.['p:cNvPr'];
    children.push({
      id: String(cNvPr?.['@_id'] ?? `grp-sp-${slideIndex}-${children.length}`),
      type: shapeParagraphs.length ? 'text' : 'shape',
      name: cNvPr?.['@_name'],
      position: transform(spPr),
      style: { fill: color(spPr) },
      fill: extractFill(spPr),
      line: extractLine(spPr),
      paragraphs: shapeParagraphs,
      textBody: textBodyProps(shape['p:txBody']),
      geometry: spPr?.['a:prstGeom']?.['@_prst'],
      hyperlink: shapeHyperlink(cNvPr, rels),
    });
  }

  // Pictures
  for (const pic of A(group['p:pic'])) {
    const blip = pic['p:blipFill']?.['a:blip'];
    const embed = blip?.['@_r:embed'];
    const relation = rels[embed];
    const cNvPr = pic?.['p:nvPicPr']?.['p:cNvPr'];
    children.push({
      id: String(cNvPr?.['@_id'] ?? `grp-pic-${slideIndex}-${children.length}`),
      type: 'image',
      name: cNvPr?.['@_name'],
      position: transform(pic['p:spPr']),
      src: relation ? await assetUrlFn(relation.target, relation.external) : undefined,
      crop: attrs(pic['p:blipFill']?.['a:srcRect']),
      alt: cNvPr?.['@_descr'],
      hyperlink: shapeHyperlink(cNvPr, rels),
    });
  }

  // Nested groups (recursion)
  for (const subGroup of A(group['p:grpSp'])) {
    const gt = groupTransform(subGroup['p:grpSpPr']);
    const subChildren = await parseGroupChildren(subGroup, rels, slideIndex, assetUrlFn);
    children.push({
      id: String(subGroup?.['p:nvGrpSpPr']?.['p:cNvPr']?.['@_id'] ?? `grp-grp-${slideIndex}-${children.length}`),
      type: 'group',
      name: subGroup?.['p:nvGrpSpPr']?.['p:cNvPr']?.['@_name'],
      position: gt.position,
      childOffset: gt.childOffset,
      childExtent: gt.childExtent,
      style: {},
      children: subChildren,
    });
  }

  return children;
}

// ─── Slide Layout Decorations ─────────────────────────────────────────────────

/** True when a layout shape is a placeholder replaced by slide content */
function isLayoutPlaceholder(node: any): boolean {
  return Boolean(node?.['p:nvSpPr']?.['p:nvPr']?.['p:ph']);
}

/**
 * Parse non-placeholder decorations from slideLayout (background images, logo, footer bars).
 * These live on the layout/master, not in the slide spTree, but must render behind slide content.
 */
async function parseLayoutDecorations(
  layoutDocument: any,
  layoutRels: Relationships,
  slideIndex: number,
  assetUrlFn: (target: string, external: boolean) => Promise<string | undefined>,
): Promise<any[]> {
  const tree = layoutDocument?.['p:sldLayout']?.['p:cSld']?.['p:spTree']
    ?? layoutDocument?.['p:cSld']?.['p:spTree'];
  if (!tree) return [];

  const decorations: any[] = [];
  let counter = 0;

  for (const pic of A(tree['p:pic'])) {
    const blip = pic['p:blipFill']?.['a:blip'];
    const embed = blip?.['@_r:embed'] ?? blip?.['@_r:link'];
    const relation = embed ? layoutRels[embed] : undefined;
    const cNvPr = pic['p:nvPicPr']?.['p:cNvPr'];
    decorations.push({
      id: String(cNvPr?.['@_id'] ?? `layout-pic-${slideIndex}-${counter++}`),
      type: 'image',
      name: cNvPr?.['@_name'],
      position: transform(pic['p:spPr']),
      src: relation ? await assetUrlFn(relation.target, relation.external) : undefined,
      crop: attrs(pic['p:blipFill']?.['a:srcRect']),
      alt: cNvPr?.['@_descr'],
      fromLayout: true,
    });
  }

  for (const shape of A(tree['p:sp'])) {
    if (isLayoutPlaceholder(shape)) continue;
    const spPr = shape['p:spPr'];
    const shapeParagraphs = paragraphs(shape['p:txBody'], layoutRels);
    const cNvPr = shape['p:nvSpPr']?.['p:cNvPr'];
    decorations.push({
      id: String(cNvPr?.['@_id'] ?? `layout-sp-${slideIndex}-${counter++}`),
      type: shapeParagraphs.length ? 'text' : 'shape',
      name: cNvPr?.['@_name'],
      position: transform(spPr),
      style: { fill: color(spPr) },
      fill: extractFill(spPr),
      line: extractLine(spPr),
      paragraphs: shapeParagraphs,
      textBody: textBodyProps(shape['p:txBody']),
      geometry: spPr?.['a:prstGeom']?.['@_prst'],
      fromLayout: true,
    });
  }

  return decorations;
}

// ─── Slide error placeholder ───────────────────────────────────────────────────

function createSlideErrorPlaceholder(
  slideNumber: number,
  presentation: any,
  message: string,
) {
  return {
    title: `Slide ${slideNumber}`,
    notes: `[Import error on slide ${slideNumber}: ${message}]`,
    content: {
      version: 2,
      format: 'ooxml',
      size: {
        width: Number(presentation?.['p:sldSz']?.['@_cx'] ?? 12192000),
        height: Number(presentation?.['p:sldSz']?.['@_cy'] ?? 6858000),
      },
      elements: [{
        id: `slide-${slideNumber}-error`,
        type: 'text',
        name: 'Import Error Placeholder',
        position: { x: 914400, y: 914400, width: 10363200, height: 3657600 },
        style: {},
        paragraphs: [{
          text: `Slide ${slideNumber} could not be fully extracted.\n${message}`,
          level: 0,
          runs: [{
            text: `Slide ${slideNumber} could not be fully extracted.\n${message}`,
            style: { sz: 2400, color: '#ff0000' },
          }],
          style: { algn: 'ctr' },
        }],
        error: message,
      }],
      extractionWarnings: [message],
    },
  };
}

// ─── Main Parser ──────────────────────────────────────────────────────────────

export async function parsePowerPoint(
  fileBuffer: Buffer,
  options: PowerPointImportOptions = { extractNotes: true, generateThumbnails: false, preserveAnimations: true },
): Promise<ImportResult> {
  try {
    console.info('[Classroom import] Parser started', { bytes: fileBuffer.length });

    const zip = await JSZip.loadAsync(fileBuffer);
    const read = async (path: string): Promise<string | undefined> => zip.file(path)?.async('string');

    // ── Presentation root ──────────────────────────────────────────────────
    const presentationXml = await read('ppt/presentation.xml');
    if (!presentationXml) {
      return { success: false, error: 'This file is not a valid PPTX presentation package.' };
    }
    const presentation = xml.parse(presentationXml)['p:presentation'];
    const presentationRels = relationshipsFromXml(
      'ppt/presentation.xml',
      await read('ppt/_rels/presentation.xml.rels'),
    );
    const slideIds = A(presentation?.['p:sldIdLst']?.['p:sldId']);
    console.info('[Classroom import] Presentation XML parsed', { slideCount: slideIds.length });

    // ── Asset URL builder ──────────────────────────────────────────────────
    const assets: ImportedAsset[] = [];
    const assetUrl = async (target: string, external: boolean): Promise<string | undefined> => {
      if (external) return target;
      const file = zip.file(target);
      if (!file) return undefined;
      const data = await file.async('nodebuffer');
      const name = target.split('/').pop()!;
      const extension = name.split('.').pop()?.toLowerCase() ?? '';
      const path = `media/${name}`;
      if (!assets.some(a => a.path === path)) {
        assets.push({ path, data, mimeType: extMime[extension] ?? 'application/octet-stream' });
      }
      return `asset://${path}`;
    };

    // ── Slide loop ─────────────────────────────────────────────────────────
    const slides: any[] = [];
    const slideErrors: Array<{ slide: number; error: string }> = [];

    for (let index = 0; index < slideIds.length; index++) {
      const slideNumber = index + 1;
      let elementIdCounter = 0;
      try {
        const id = slideIds[index]?.['@_r:id'];
        const rel = presentationRels[id];
        if (!rel || rel.external) {
          const msg = rel?.external
            ? 'External slide reference is not supported'
            : 'Missing slide relationship in presentation';
          slideErrors.push({ slide: slideNumber, error: msg });
          slides.push(createSlideErrorPlaceholder(slideNumber, presentation, msg));
          continue;
        }

        const part = rel.target;
        const source = await read(part);
        if (!source) {
          const msg = `Slide part not found: ${part}`;
          slideErrors.push({ slide: slideNumber, error: msg });
          slides.push(createSlideErrorPlaceholder(slideNumber, presentation, msg));
          continue;
        }

      const document = xml.parse(source)['p:sld'];
      const rels = relationshipsFromXml(
        part,
        await read(`${part.slice(0, part.lastIndexOf('/'))}/_rels/${part.slice(part.lastIndexOf('/') + 1)}.rels`),
      );

      const tree = document?.['p:cSld']?.['p:spTree'] ?? {};
      const elements: any[] = [];

      // ── add() helper ─────────────────────────────────────────────────────
      const add = (kind: string, node: any, value: any = {}) => {
        const cNvPr = node?.['p:nvSpPr']?.['p:cNvPr'] ?? node?.['p:nvPicPr']?.['p:cNvPr'] ?? node?.['p:nvGraphicFramePr']?.['p:cNvPr'] ?? node?.['p:nvGrpSpPr']?.['p:cNvPr'];
        const hyperlink = shapeHyperlink(cNvPr, rels);
        const element = {
          id: String(
            cNvPr?.['@_id'] ?? `pptx-${index}-${elementIdCounter++}`,
          ),
          type: kind,
          name: cNvPr?.['@_name'],
          position: transform(
            node?.['p:spPr'] ?? node?.['p:pic']?.['p:spPr'] ?? node?.['p:xfrm'],
          ),
          style: {
            fill: color(node?.['p:spPr']),
            ...attrs(node?.['p:spPr']?.['a:prstGeom']),
          },
          hyperlink,
          ...value,
        };

        // ── Filtering ───────────────────────────────────────────────────────
        const placeholder = value.placeholder;
        const hasNoFill = node?.['p:spPr']?.['a:noFill'] !== undefined;
        const hasNoLine = node?.['p:spPr']?.['a:ln']?.['a:noFill'] !== undefined;
        const isHidden = node?.['p:spPr']?.['p:style']?.['@_hidden'] === '1' ||
                         document?.['@_show'] === '0';
        const hasText = value.paragraphs && value.paragraphs.length > 0;
        const isContent = ['image', 'table', 'chart', 'video', 'audio', 'smartArt', 'embedded'].includes(kind);
        const hasFill = value.fill && value.fill.type !== 'none';
        const hasLine = value.line !== null && value.line !== undefined;

        if (isHidden) return;
        if (placeholder && !hasText && !isContent && !hasFill && (hasNoFill || !element.style.fill)) return;
        if (kind === 'shape' && hasNoFill && hasNoLine && !hasText && !isContent) return;
        if (kind === 'connector' && hasNoFill && hasNoLine && !hasText) return;
        if (kind === 'table' && value.rows && isInvisibleTable({ columns: value.columns ?? [], rows: value.rows })) return;

        if (kind === 'table' && value.columns?.length && value.rows?.length) {
          element.position = resolveTableBounds(element.position, {
            columns: value.columns,
            rows: value.rows,
          });
        }

        elements.push(element);
      };

      // ── Parse shapes ─────────────────────────────────────────────────────
      for (const shape of A(tree['p:sp'])) {
        const spPr = shape['p:spPr'];
        const shapeParagraphs = paragraphs(shape['p:txBody'], rels);
        // Classify as 'text' if any paragraph has an actual text run or field text.
        // We keep blank paragraphs in shapeParagraphs (they represent blank lines),
        // but we don't classify a shape as 'text' just because it has blank-only content.
        const hasActualText = shapeParagraphs.some((p: any) =>
          (p.runs?.length && p.runs.some((r: any) => r.text !== '')) || p.text
        );
        add(
          hasActualText ? 'text' : 'shape',
          shape,
          {
            paragraphs: shapeParagraphs,
            textBody: textBodyProps(shape['p:txBody']),
            fill: extractFill(spPr),
            line: extractLine(spPr),
            placeholder: attrs(shape['p:nvSpPr']?.['p:nvPr']?.['p:ph']),
            geometry: spPr?.['a:prstGeom']?.['@_prst'],
          },
        );
      }

      // ── Parse pictures ───────────────────────────────────────────────────
      for (const pic of A(tree['p:pic'])) {
        const blip = pic['p:blipFill']?.['a:blip'];
        const embed = blip?.['@_r:embed'];
        const link  = blip?.['@_r:link'];
        const relation = rels[embed ?? link];
        add('image', pic, {
          src: relation ? await assetUrl(relation.target, relation.external) : undefined,
          crop: attrs(pic['p:blipFill']?.['a:srcRect']),
          alt: pic['p:nvPicPr']?.['p:cNvPr']?.['@_descr'],
        });
      }

      // ── Parse graphic frames (tables, charts, smartArt) ──────────────────
      for (const frame of A(tree['p:graphicFrame'])) {
        const data = frame['a:graphic']?.['a:graphicData'];
        const uri = data?.['@_uri'] ?? '';

        if (data?.['a:tbl']) {
          const tblData = table(data['a:tbl'], rels);
          add('table', frame, tblData);
        } else if (data?.['c:chart']) {
          const relation = rels[data['c:chart']?.['@_r:id']];
          const chartXml = relation && !relation.external ? await read(relation.target) : undefined;
          const fallback = extractChartFallback(chartXml);
          add('chart', frame, {
            chartRelationship: relation?.target,
            chart: chartXml ? xml.parse(chartXml) : undefined,
            chartType: fallback?.chartType,
            fallback,
          });
        } else if (uri.includes('diagram') || data?.['dgm:relIds']) {
          const dgmRelIds = data?.['dgm:relIds'];
          const dataModelRid = dgmRelIds?.['@_r:dm'];
          const diagramRel = dataModelRid ? rels[dataModelRid] : Object.values(rels).find(r => r.target.includes('/diagrams/diagram'));
          const diagramXml = diagramRel && !diagramRel.external ? await read(diagramRel.target) : undefined;
          const fallback = extractSmartArtFallback(diagramXml);
          add('smartArt', frame, {
            uri,
            paragraphs: fallback?.paragraphs,
            text: fallback?.rawText,
          });
        } else {
          add('embedded', frame, { uri });
        }
      }

      // ── Parse groups ─────────────────────────────────────────────────────
      for (const group of A(tree['p:grpSp'])) {
        const gt = groupTransform(group['p:grpSpPr']);
        const groupChildren = await parseGroupChildren(group, rels, index, assetUrl);
        add('group', group, {
          position: gt.position,
          childOffset: gt.childOffset,
          childExtent: gt.childExtent,
          children: groupChildren,
        });
      }

      // ── Parse connectors ─────────────────────────────────────────────────
      for (const connector of A(tree['p:cxnSp'])) {
        const spPr = connector['p:spPr'];
        add('connector', connector, {
          fill: extractFill(spPr),
          line: extractLine(spPr),
          geometry: spPr?.['a:prstGeom']?.['@_prst'],
        });
      }

      // ── Parse media (video / audio) ──────────────────────────────────────
      for (const [rid, mrel] of Object.entries(rels)) {
        if (mrel.external) continue;
        const ltype = mrel.type.toLowerCase();
        const tag = ltype.includes('/video') ? 'video' : ltype.includes('/audio') ? 'audio' : null;
        if (!tag) continue;
        const src = await assetUrl(mrel.target, false);
        // Try to find the corresponding media shape for positioning
        let posNode: any = undefined;
        let cNvPr: any = undefined;
        for (const shape of [...A(tree['p:sp']), ...A(tree['p:pic']), ...A(tree['p:graphicFrame'])]) {
          const nv = shape['p:nvSpPr'] ?? shape['p:nvPicPr'] ?? shape['p:nvGraphicFramePr'];
          const nvp = nv?.['p:nvPr'];
          const matchRid =
            nvp?.['p:videoFile']?.['@_r:link'] === rid ||
            nvp?.['p:audioFile']?.['@_r:link'] === rid ||
            nvp?.['p:media']?.['p:mediaRid']?.['@_r:val'] === rid;
          if (matchRid) { posNode = shape; cNvPr = nv?.['p:cNvPr']; break; }
        }
        elements.push({
          id: String(cNvPr?.['@_id'] ?? `pptx-${index}-${tag}-${elements.length}`),
          type: tag,
          name: cNvPr?.['@_name'] ?? `${tag} ${elements.length}`,
          position: posNode ? transform(posNode['p:spPr'] ?? posNode['p:pic']?.['p:spPr']) : { x: 0, y: 0, width: 0, height: 0 },
          style: {},
          src,
        });
      }

      // ── Notes ─────────────────────────────────────────────────────────────
      const notesRelation = Object.values(rels).find(r => r.type.endsWith('/notesSlide'));
      const notesXml = options.extractNotes && notesRelation && !notesRelation.external
        ? await read(notesRelation.target)
        : undefined;
      let notesText: string | undefined;
      if (notesXml) {
        try {
          const notesParsed = xml.parse(notesXml);
          const notesShapes = notesParsed['p:notes']?.['p:cSld']?.['p:spTree']?.['p:sp'];
          const all: string[] = [];
          for (const ns of A(notesShapes)) {
            const paras = paragraphs(ns['p:txBody'], {});
            for (const p of paras) if (p.text) all.push(p.text);
          }
          notesText = all.join('\n').trim();
        } catch {
          notesText = findText(xml.parse(notesXml)).trim();
        }
      }

      // ── Layout reference ──────────────────────────────────────────────────
      const layoutRelation = Object.values(rels).find(r => r.type.endsWith('/slideLayout'));
      const layoutPart = layoutRelation && !layoutRelation.external ? layoutRelation.target : undefined;
      const layoutXml = layoutPart ? await read(layoutPart) : undefined;
      let layoutParsed: any = undefined;
      let layoutRels: Relationships = {};
      if (layoutXml && layoutPart) {
        layoutParsed = xml.parse(layoutXml);
        const layoutRelPath = `${layoutPart.slice(0, layoutPart.lastIndexOf('/'))}/_rels/${layoutPart.slice(layoutPart.lastIndexOf('/') + 1)}.rels`;
        layoutRels = relationshipsFromXml(layoutPart, await read(layoutRelPath));
        const layoutDecorations = await parseLayoutDecorations(layoutParsed, layoutRels, index, assetUrl);
        if (layoutDecorations.length) {
          elements.unshift(...layoutDecorations);
        }
      }

      // ── Title extraction ──────────────────────────────────────────────────
      const titleShape = A(tree['p:sp']).find((s: any) =>
        ['title', 'ctrTitle'].includes(s['p:nvSpPr']?.['p:nvPr']?.['p:ph']?.['@_type']),
      );
      const titleText = titleShape
        ? paragraphs(titleShape['p:txBody'], rels).map((p: any) => p.text).join(' ').trim()
        : (elements.find(e => e.type === 'text')?.paragraphs?.[0]?.text || `Slide ${slideNumber}`).trim() || `Slide ${slideNumber}`;

      const slideWidth = Number(presentation?.['p:sldSz']?.['@_cx'] ?? 12192000);
      const slideHeight = Number(presentation?.['p:sldSz']?.['@_cy'] ?? 6858000);

      // ── Slide master background (inherits through layout → master) ──────────
      // When a slide has no explicit p:bg, the background comes from the master.
      let masterBackground: any = undefined;
      let masterTheme: any = undefined;
      if (layoutPart && Object.keys(layoutRels).length > 0) {
        const masterRelation = Object.values(layoutRels).find(r => r.type.endsWith('/slideMaster'));
        if (masterRelation && !masterRelation.external) {
          try {
            const masterXml = await read(masterRelation.target);
            if (masterXml) {
              const masterParsed = xml.parse(masterXml);
              const masterDoc = masterParsed?.['p:sldMaster'];
              // Master background
              masterBackground = masterDoc?.['p:cSld']?.['p:bg'];
              // Master color scheme / theme
              const masterRelPath = `${masterRelation.target.slice(0, masterRelation.target.lastIndexOf('/'))}/_rels/${masterRelation.target.slice(masterRelation.target.lastIndexOf('/') + 1)}.rels`;
              const masterRels = relationshipsFromXml(masterRelation.target, await read(masterRelPath));
              const themeRelation = Object.values(masterRels).find(r => r.type.endsWith('/theme'));
              if (themeRelation && !themeRelation.external) {
                const themeXml = await read(themeRelation.target);
                if (themeXml) {
                  const themeParsed = xml.parse(themeXml);
                  const scheme = themeParsed?.['a:theme']?.['a:themeElements']?.['a:clrScheme'];
                  if (scheme) {
                    const extractHex = (node: any): string | undefined => {
                      if (!node) return undefined;
                      const srgb = node?.['a:srgbClr']?.['@_val'];
                      if (srgb) return `#${srgb}`;
                      const sys = node?.['a:sysClr']?.['@_lastClr'];
                      if (sys) return `#${sys}`;
                      return undefined;
                    };
                    masterTheme = {
                      dk1: extractHex(scheme['a:dk1']) ?? '#000000',
                      lt1: extractHex(scheme['a:lt1']) ?? '#ffffff',
                      dk2: extractHex(scheme['a:dk2']) ?? '#44546a',
                      lt2: extractHex(scheme['a:lt2']) ?? '#e7e6e6',
                      accent1: extractHex(scheme['a:accent1']) ?? '#4472c4',
                      accent2: extractHex(scheme['a:accent2']) ?? '#ed7d31',
                      accent3: extractHex(scheme['a:accent3']) ?? '#a9d18e',
                      accent4: extractHex(scheme['a:accent4']) ?? '#ffc000',
                      accent5: extractHex(scheme['a:accent5']) ?? '#5b9bd5',
                      accent6: extractHex(scheme['a:accent6']) ?? '#70ad47',
                      hlink: extractHex(scheme['a:hlink']) ?? '#0563c1',
                      folHlink: extractHex(scheme['a:folHlink']) ?? '#954f72',
                    };
                  }
                }
              }
            }
          } catch (e: any) {
            // Non-fatal: master background is a fallback, not essential
            console.warn('[Classroom import] Could not read master background:', e?.message);
          }
        }
      }

      slides.push({
        title: titleText,
        notes: notesText,
        content: {
          version: 2,
          format: 'ooxml',
          size: {
            width: slideWidth,
            height: slideHeight,
          },
          // Use slide background, fall back to layout background, then master background
          background: document?.['p:cSld']?.['p:bg']
            ?? layoutParsed?.['p:sldLayout']?.['p:cSld']?.['p:bg']
            ?? masterBackground,
          theme: masterTheme,
          elements,
          transition: document?.['p:transition'],
          timing: options.preserveAnimations ? document?.['p:timing'] : undefined,
          ooxml: {
            slidePart: part,
            layoutPart,
            layout: layoutParsed,
            layoutRelationships: layoutRels,
            relationships: rels,
          },
        },
      });

      console.info('[Classroom import] Slide parsed', { order: slideNumber, elements: elements.length });
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.error(`[Classroom import] Failed parsing slide ${slideNumber}: ${msg}`);
        slideErrors.push({ slide: slideNumber, error: msg });
        slides.push(createSlideErrorPlaceholder(slideNumber, presentation, msg));
      }
    }

    // ── Themes ────────────────────────────────────────────────────────────
    const themeRelations = Object.values(presentationRels).filter(r => r.type.endsWith('/slideMaster'));
    const themes = await Promise.all(
      themeRelations.map(async r => ({
        masterPart: r.target,
        master: await read(r.target),
        rels: relationshipsFromXml(
          r.target,
          await read(`${r.target.slice(0, r.target.lastIndexOf('/'))}/_rels/${r.target.slice(r.target.lastIndexOf('/') + 1)}.rels`),
        ),
      })),
    );

    const sourceSlideCount = slideIds.length;
    const extractedSlideCount = slides.length;
    const slideCountMismatch = sourceSlideCount !== extractedSlideCount
      ? { sourceSlideCount, extractedSlideCount }
      : undefined;

    if (slideCountMismatch) {
      console.error('[Classroom import] Slide count mismatch', slideCountMismatch);
    }

    console.info('[Classroom import] Parser finished', {
      sourceSlideCount,
      extractedSlideCount,
      assets: assets.length,
      errors: slideErrors.length,
    });

    return {
      success: true,
      slides,
      metadata: {
        sourceSlideCount,
        extractedSlideCount,
        slideCountMismatch,
        coreProperties: await read('docProps/core.xml'),
        customProperties: await read('docProps/custom.xml'),
        presentation: presentationXml,
        themes,
        slideErrors: slideErrors.length ? slideErrors : undefined,
      },
      assets,
    };
  } catch (error) {
    console.error('[Classroom import] Parser failed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse PowerPoint file',
    };
  }
}

// ─── Utility Exports ──────────────────────────────────────────────────────────

export async function extractImagesFromPowerPoint(fileBuffer: Buffer): Promise<Map<string, Buffer>> {
  const zip = await JSZip.loadAsync(fileBuffer);
  const result = new Map<string, Buffer>();
  for (const name of Object.keys(zip.files).filter(p => p.startsWith('ppt/media/'))) {
    const data = await zip.file(name)?.async('nodebuffer');
    if (data) result.set(name.split('/').pop()!, data);
  }
  return result;
}

export async function getPowerPointMetadata(fileBuffer: Buffer): Promise<{
  title?: string; author?: string; subject?: string; slideCount: number;
}> {
  const zip = await JSZip.loadAsync(fileBuffer);
  const core = zip.file('docProps/core.xml')
    ? xml.parse(await zip.file('docProps/core.xml')!.async('string'))
    : {};
  const pres = zip.file('ppt/presentation.xml')
    ? xml.parse(await zip.file('ppt/presentation.xml')!.async('string'))['p:presentation']
    : {};
  return {
    title:      text(core?.['cp:coreProperties']?.['dc:title']) || undefined,
    author:     text(core?.['cp:coreProperties']?.['dc:creator']) || undefined,
    subject:    text(core?.['cp:coreProperties']?.['dc:subject']) || undefined,
    slideCount: A(pres?.['p:sldIdLst']?.['p:sldId']).length,
  };
}
