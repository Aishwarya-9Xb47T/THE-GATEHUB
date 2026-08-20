/**
 * Slide Layout Engine — Canonical Type Definitions
 *
 * All numeric coordinates are in EMU (English Metric Units).
 * Convert to px at reference canvas via: px = emu / 12700
 * Reference canvas: 960 × 540 px  (12,192,000 × 6,858,000 EMU)
 */

// ─── Colors ─────────────────────────────────────────────────────────────────

/** CSS #RRGGBB string, "none" (explicit no fill), or "scheme:X" (theme color ref) */
export type ColorRef = string;

// ─── Fills ───────────────────────────────────────────────────────────────────

export interface Hyperlink {
  /** Target URL or action: URI */
  url?: string;
  /** Tooltip shown on hover */
  toolTip?: string;
  /** True if the target is an external web resource */
  external?: boolean;
}

export interface SolidFill {
  type: 'solid';
  color: ColorRef;
  alpha?: number; // 0–100000 (100000 = opaque)
}

export interface GradientStop {
  /** Position 0–100000 */
  pos: number;
  color: ColorRef;
  alpha?: number;
}

export interface GradientFill {
  type: 'gradient';
  stops: GradientStop[];
  /** Angle in degrees (0 = left-to-right) */
  angle: number;
}

export interface NoFill {
  type: 'none';
}

export type Fill = SolidFill | GradientFill | NoFill;

// ─── Lines / Borders ─────────────────────────────────────────────────────────

export interface BorderLine {
  color: ColorRef;
  /** Width in pt (1 pt = 12700 EMU) */
  width: number;
  dash?: string; // 'solid' | 'dash' | 'dot' | 'dashDot' | 'lgDash' | 'lgDashDot'
}

// ─── Effects ─────────────────────────────────────────────────────────────────

export interface Shadow {
  color: ColorRef;
  /** Blur radius in EMU */
  blurRadius: number;
  /** Distance in EMU */
  dist: number;
  /** Direction in degrees */
  dir: number;
}

// ─── Text Model ──────────────────────────────────────────────────────────────

export interface RunStyle {
  /** Half-points (2400 = 24pt) */
  sz?: number;
  b?: boolean;
  i?: boolean;
  /** OOXML underline type: none | sng | dbl | heavy | dotted | dash | … */
  u?: string;
  /** OOXML strike: noStrike | sngStrike | dblStrike */
  strike?: string;
  /** Font family name */
  latin?: string;
  color?: ColorRef;
  /**
   * Superscript/subscript offset in thousandths of a percent.
   * Positive = superscript (30000 = 30% rise), negative = subscript.
   */
  baseline?: number;
  /** Character spacing in hundredths of a point */
  spc?: number;
  /** Capitalization: 'none' | 'small' | 'all' */
  cap?: string;
}

export interface Run {
  text: string;
  style: RunStyle;
  /** Hyperlink associated with this text run (e.g. a hlinkClick in OOXML rPr) */
  hyperlink?: Hyperlink;
}

export interface ParagraphStyle {
  /** Text alignment: l | r | ctr | just | dist | thaiDist */
  algn?: string;
  /**
   * Line spacing.
   * Positive = percentage in thousandths (100000 = 100%, 150000 = 150%).
   * Negative = exact, stored as -(hundredths of a point) (e.g. -1200 = 12pt).
   * Undefined = PowerPoint default (Multiple 1.0).
   */
  lnSpc?: number;
  /**
   * Space before paragraph.
   * Positive = percentage thousandths. Negative = -(hundredths of pt).
   */
  spcBef?: number;
  /** Space after paragraph. Same encoding as spcBef. */
  spcAft?: number;
  /** Left indent/margin in EMU (includes bullet hanging) */
  marL?: number;
  /** First-line indent in EMU. Negative = hanging indent. */
  indent?: number;
  /** Bullet style */
  bullet?: 'none' | 'bullet' | 'numbered';
  /** Actual bullet character (for bullet type) */
  bulletChar?: string;
  /** Bullet font family */
  bulletFont?: string;
  /** Default tab size in EMU */
  defTabSz?: number;
}

export interface Paragraph {
  text: string;
  level: number;
  runs: Run[];
  style: ParagraphStyle;
}

// ─── Text Body Properties ────────────────────────────────────────────────────

export interface TextBodyProps {
  /** Vertical text anchor: t | ctr | b | dist | just */
  anchor?: string;
  /** Text wrap: square | none */
  wrap?: string;
  /** Auto-fit: none | normAutofit | spAutofit */
  autofit?: string;
  /** Left inset in EMU (default 91440) */
  lIns?: number;
  /** Right inset in EMU (default 91440) */
  rIns?: number;
  /** Top inset in EMU (default 45720) */
  tIns?: number;
  /** Bottom inset in EMU (default 45720) */
  bIns?: number;
  /** Text body rotation in degrees */
  rot?: number;
  /** Vertical text direction: horz | vert | vert270 | wordArtVert */
  vert?: string;
}

// ─── Transform ───────────────────────────────────────────────────────────────

export interface Transform {
  /** Left edge in EMU */
  x: number;
  /** Top edge in EMU */
  y: number;
  /** Width in EMU */
  width: number;
  /** Height in EMU */
  height: number;
  /** Rotation in degrees (clockwise) */
  rotation: number;
  flipH: boolean;
  flipV: boolean;
}

// ─── Table ───────────────────────────────────────────────────────────────────

export interface CellBorder {
  color: ColorRef;
  /** Width in pt */
  width: number;
  dash?: string;
}

export interface CellBorders {
  top?: CellBorder | null;    // null = explicitly noFill
  bottom?: CellBorder | null;
  left?: CellBorder | null;
  right?: CellBorder | null;
}

export interface TableCell {
  paragraphs: Paragraph[];
  fill?: Fill;
  borders?: CellBorders;
  rowSpan?: number;
  colSpan?: number;
  hMerge?: boolean;
  vMerge?: boolean;
  /** Vertical alignment: t | ctr | b */
  anchor?: string;
  /** Cell padding in EMU (defaults: marL/R=91440, marT/B=45720) */
  marL?: number;
  marR?: number;
  marT?: number;
  marB?: number;
}

export interface TableRow {
  /** Row height in EMU — must never be overridden by browser */
  height: number;
  cells: TableCell[];
}

// ─── Normalized Slide Element ─────────────────────────────────────────────────

export type ElementType =
  | 'text'
  | 'equation'
  | 'shape'
  | 'image'
  | 'table'
  | 'chart'
  | 'group'
  | 'video'
  | 'audio'
  | 'smartArt'
  | 'embedded'
  | 'connector';

export interface NormalizedElement {
  id: string;
  type: ElementType;
  name?: string;
  transform: Transform;
  zIndex: number;

  // ── Text ──────────────────────────────────────────────────────────────────
  paragraphs?: Paragraph[];
  textBody?: TextBodyProps;

  // ── Shape ─────────────────────────────────────────────────────────────────
  /** OOXML prstGeom prst value, e.g. 'rect', 'ellipse', 'roundRect' */
  geometry?: string;
  fill?: Fill;
  line?: BorderLine | null; // null = explicitly no line
  shadow?: Shadow;

  // ── Image ─────────────────────────────────────────────────────────────────
  src?: string;
  alt?: string;
  /**
   * Crop percentages in units of 1/100000 (100000 = 100%).
   * These values represent the amount cropped from each edge.
   */
  crop?: { l?: number; r?: number; t?: number; b?: number };

  // ── Table ─────────────────────────────────────────────────────────────────
  /** Column widths in EMU */
  columns?: number[];
  rows?: TableRow[];

  // ── Group ─────────────────────────────────────────────────────────────────
  children?: NormalizedElement[];
  /** Child coordinate space origin in EMU (OOXML chOff) */
  childOffset?: { x: number; y: number };
  /** Child coordinate space extent in EMU (OOXML chExt) */
  childExtent?: { width: number; height: number };

  // ── Chart ─────────────────────────────────────────────────────────────────
  chart?: unknown;

  // ── Hyperlink (clickable shape / image / graphic frame) ───────────────────
  hyperlink?: Hyperlink;
}

// ─── Normalized Slide ────────────────────────────────────────────────────────

export interface ThemeColors {
  dk1?: string;
  lt1?: string;
  dk2?: string;
  lt2?: string;
  accent1?: string;
  accent2?: string;
  accent3?: string;
  accent4?: string;
  accent5?: string;
  accent6?: string;
  hlink?: string;
  folHlink?: string;
}

export interface NormalizedBackground {
  type: 'solid' | 'gradient' | 'none';
  color?: string;
  gradient?: { stops: GradientStop[]; angle: number };
}

export interface NormalizedSlide {
  version: number;
  /** Slide dimensions in EMU */
  size: { width: number; height: number };
  background: NormalizedBackground;
  elements: NormalizedElement[];
  theme?: ThemeColors;
  footer?: string;
  pageNumber?: number | string;
}
