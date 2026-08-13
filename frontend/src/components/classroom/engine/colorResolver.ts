/**
 * Slide Layout Engine — Color Resolver
 *
 * Resolves OOXML color references to CSS color strings.
 * Handles: #RRGGBB literals, scheme: references, 'none' (transparent).
 */

import type { ThemeColors, ColorRef } from './types';

// ─── Scheme color key mapping ─────────────────────────────────────────────────

const SCHEME_KEY_MAP: Record<string, keyof ThemeColors> = {
  dk1: 'dk1', lt1: 'lt1', dk2: 'dk2', lt2: 'lt2',
  accent1: 'accent1', accent2: 'accent2', accent3: 'accent3',
  accent4: 'accent4', accent5: 'accent5', accent6: 'accent6',
  hlink: 'hlink', folHlink: 'folHlink',
  // Common OOXML aliases
  tx1: 'dk1', tx2: 'dk2',
  bg1: 'lt1', bg2: 'lt2',
};

/**
 * Fallback palette used when theme colors are unavailable.
 * These approximate the Office default theme (Office 2013+).
 */
const FALLBACK_PALETTE: Record<string, string> = {
  dk1: '#000000',
  lt1: '#ffffff',
  dk2: '#44546a',
  lt2: '#e7e6e6',
  accent1: '#4472c4',
  accent2: '#ed7d31',
  accent3: '#a9d18e',
  accent4: '#ffc000',
  accent5: '#5b9bd5',
  accent6: '#70ad47',
  hlink: '#0563c1',
  folHlink: '#954f72',
  // aliases
  tx1: '#000000',
  tx2: '#44546a',
  bg1: '#ffffff',
  bg2: '#e7e6e6',
};

// ─── Main resolver ────────────────────────────────────────────────────────────

/**
 * Resolve a color reference to a CSS color string.
 *
 * @param ref   - ColorRef: '#RRGGBB', 'scheme:accentN', 'none', or undefined
 * @param theme - Optional theme color map extracted from the slide master
 * @returns     - A CSS color string, 'transparent' for none, or '#808080' unknown
 */
export function resolveColor(ref: ColorRef | undefined, theme?: ThemeColors): string {
  if (!ref || ref === 'none') return 'transparent';

  // Literal hex color
  if (ref.startsWith('#')) return ref;

  // Scheme color reference
  if (ref.startsWith('scheme:')) {
    const key = ref.slice(7).trim();
    const themeKey = SCHEME_KEY_MAP[key];
    if (themeKey && theme?.[themeKey]) {
      const val = theme[themeKey]!;
      // Theme values may already have # prefix or not
      return val.startsWith('#') ? val : `#${val}`;
    }
    // Fallback palette
    if (FALLBACK_PALETTE[key]) return FALLBACK_PALETTE[key];
    return '#808080';
  }

  return ref;
}

/**
 * Apply alpha transparency to a CSS hex color.
 * @param hex   - '#RRGGBB'
 * @param alpha - 0 (transparent) to 100000 (opaque)
 */
export function applyAlpha(hex: string, alpha: number | undefined): string {
  if (alpha === undefined || alpha >= 100000) return hex;
  const a = Math.round((alpha / 100000) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

/**
 * Build a CSS linear-gradient string from OOXML gradient fill data.
 * @param stops - Array of { pos, color, alpha } where pos is 0–100000
 * @param angle - Gradient angle in degrees (OOXML convention: 0° = top-down)
 * @param theme - Theme colors for scheme: resolution
 */
export function buildGradient(
  stops: Array<{ pos: number; color: ColorRef; alpha?: number }>,
  angle: number,
  theme?: ThemeColors,
): string {
  if (!stops.length) return 'transparent';

  // OOXML angle 0° = top (top-to-bottom), so CSS angle = ooxml angle + 90°
  const cssAngle = (angle + 90) % 360;

  const cssStops = [...stops]
    .sort((a, b) => a.pos - b.pos)
    .map((s) => {
      const color = resolveColor(s.color, theme);
      const withAlpha = applyAlpha(color, s.alpha);
      const pct = ((s.pos / 100000) * 100).toFixed(1);
      return `${withAlpha} ${pct}%`;
    })
    .join(', ');

  return `linear-gradient(${cssAngle}deg, ${cssStops})`;
}
