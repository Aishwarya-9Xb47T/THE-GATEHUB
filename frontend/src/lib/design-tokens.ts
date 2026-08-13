/**
 * THE GATEHUB V6 — Design Token Reference
 * Single source of truth documentation for TypeScript consumers.
 * All values resolve to CSS custom properties — never hardcode in components.
 */

export const spacing = {
  0: "var(--space-0)",
  1: "var(--space-1)",
  2: "var(--space-2)",
  3: "var(--space-3)",
  4: "var(--space-4)",
  5: "var(--space-5)",
  6: "var(--space-6)",
  8: "var(--space-8)",
  10: "var(--space-10)",
  12: "var(--space-12)",
  16: "var(--space-16)",
  20: "var(--space-20)",
  24: "var(--space-24)",
  32: "var(--space-32)",
} as const;

export const radius = {
  xs: "var(--radius-xs)",
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
  xl: "var(--radius-xl)",
  "2xl": "var(--radius-2xl)",
  pill: "var(--radius-pill)",
} as const;

export const shadow = {
  0: "var(--shadow-0)",
  1: "var(--shadow-1)",
  2: "var(--shadow-2)",
  3: "var(--shadow-3)",
  4: "var(--shadow-4)",
  soft: "var(--soft-shadow)",
  premium: "var(--premium-shadow)",
} as const;

export const motion = {
  duration: {
    instant: "var(--duration-instant)",
    fast: "var(--duration-fast)",
    normal: "var(--duration-normal)",
    slow: "var(--duration-slow)",
    loading: "var(--duration-loading)",
  },
  ease: {
    standard: "var(--ease-standard)",
    emphasized: "var(--ease-emphasized)",
    decelerate: "var(--ease-decelerate)",
    spring: "var(--ease-spring)",
  },
} as const;

export const typography = {
  displayXxl: "type-display-xxl",
  displayXl: "type-display-xl",
  displayLg: "type-display-lg",
  h1: "type-h1",
  h2: "type-h2",
  h3: "type-h3",
  h4: "type-h4",
  h5: "type-h5",
  bodyXl: "type-body-xl",
  bodyLg: "type-body-lg",
  bodyMd: "type-body-md",
  bodySm: "type-body-sm",
  caption: "type-caption",
  label: "type-section-label",
  code: "type-code",
} as const;

export const layout = {
  container: "var(--width-container)",
  section: "var(--width-section)",
  dashboard: "var(--width-dashboard)",
  editor: "var(--width-editor)",
  landing: "var(--width-landing)",
  reading: "var(--reading-width)",
  readingWide: "var(--reading-width-wide)",
} as const;

/** Semantic colors — work in both light and dark via CSS variables */
export const color = {
  background: "hsl(var(--ds-background))",
  surface: "hsl(var(--ds-surface))",
  surfaceElevated: "hsl(var(--ds-surface-elevated))",
  surfaceSecondary: "hsl(var(--ds-surface-secondary))",
  card: "hsl(var(--ds-card))",
  cardHover: "hsl(var(--ds-card-hover))",
  border: "hsl(var(--ds-border))",
  divider: "hsl(var(--ds-divider))",
  textPrimary: "hsl(var(--ds-text-primary))",
  textSecondary: "hsl(var(--ds-text-secondary))",
  textMuted: "hsl(var(--ds-text-muted))",
  primary: "hsl(var(--ds-primary))",
  success: "hsl(var(--ds-success))",
  warning: "hsl(var(--ds-warning))",
  error: "hsl(var(--ds-error))",
  info: "hsl(var(--ds-info))",
  codeBg: "hsl(var(--ds-code-bg))",
  overlay: "hsl(var(--ds-overlay))",
  focusRing: "hsl(var(--ds-focus-ring))",
} as const;

export const contentCard = {
  tip: "callout callout--tip",
  warning: "callout callout--warning",
  important: "callout callout--important",
  definition: "callout callout--definition",
  example: "content-card content-card--example",
  caseStudy: "content-card content-card--case-study",
  assignment: "content-card content-card--assignment",
  project: "content-card content-card--project",
  quiz: "content-card content-card--quiz",
  research: "content-card content-card--research",
  reference: "content-card content-card--reference",
  glossary: "content-card content-card--glossary",
  interview: "content-card content-card--interview",
  revision: "content-card content-card--revision",
} as const;
