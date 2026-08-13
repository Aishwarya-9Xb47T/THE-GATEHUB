/**
 * Theme engine — renderers use tokens, never hardcode colors.
 */

export type PlayerThemeId = "light" | "dark" | "high_contrast" | "org_brand";

export interface ThemeTokens {
  id: PlayerThemeId;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  correct: string;
  incorrect: string;
  focus: string;
  fontScale: number;
}

const THEMES: Record<PlayerThemeId, Omit<ThemeTokens, "fontScale">> = {
  light: {
    id: "light",
    background: "hsl(var(--background))",
    foreground: "hsl(var(--foreground))",
    card: "hsl(var(--card))",
    cardForeground: "hsl(var(--card-foreground))",
    primary: "hsl(var(--primary))",
    primaryForeground: "hsl(var(--primary-foreground))",
    muted: "hsl(var(--muted))",
    mutedForeground: "hsl(var(--muted-foreground))",
    border: "hsl(var(--border))",
    correct: "hsl(142 76% 36%)",
    incorrect: "hsl(0 84% 60%)",
    focus: "hsl(var(--ring))",
  },
  dark: {
    id: "dark",
    background: "hsl(var(--background))",
    foreground: "hsl(var(--foreground))",
    card: "hsl(var(--card))",
    cardForeground: "hsl(var(--card-foreground))",
    primary: "hsl(var(--primary))",
    primaryForeground: "hsl(var(--primary-foreground))",
    muted: "hsl(var(--muted))",
    mutedForeground: "hsl(var(--muted-foreground))",
    border: "hsl(var(--border))",
    correct: "hsl(142 70% 45%)",
    incorrect: "hsl(0 72% 51%)",
    focus: "hsl(var(--ring))",
  },
  high_contrast: {
    id: "high_contrast",
    background: "#000000",
    foreground: "#ffffff",
    card: "#0a0a0a",
    cardForeground: "#ffffff",
    primary: "#ffff00",
    primaryForeground: "#000000",
    muted: "#1a1a1a",
    mutedForeground: "#e5e5e5",
    border: "#ffffff",
    correct: "#00ff00",
    incorrect: "#ff4444",
    focus: "#ffff00",
  },
  org_brand: {
    id: "org_brand",
    background: "var(--org-bg, hsl(var(--background)))",
    foreground: "var(--org-fg, hsl(var(--foreground)))",
    card: "var(--org-card, hsl(var(--card)))",
    cardForeground: "var(--org-card-fg, hsl(var(--card-foreground)))",
    primary: "var(--org-primary, hsl(var(--primary)))",
    primaryForeground: "var(--org-primary-fg, hsl(var(--primary-foreground)))",
    muted: "hsl(var(--muted))",
    mutedForeground: "hsl(var(--muted-foreground))",
    border: "var(--org-border, hsl(var(--border)))",
    correct: "hsl(142 76% 36%)",
    incorrect: "hsl(0 84% 60%)",
    focus: "var(--org-primary, hsl(var(--ring)))",
  },
};

export class ThemeEngine {
  private themeId: PlayerThemeId = "light";
  private fontScale = 1;
  private orgVars: Record<string, string> = {};

  getThemeId(): PlayerThemeId {
    return this.themeId;
  }

  setTheme(id: PlayerThemeId): void {
    this.themeId = id;
  }

  setFontScale(scale: number): void {
    this.fontScale = Math.min(2, Math.max(0.875, scale));
  }

  setOrgBranding(vars: Record<string, string>): void {
    this.orgVars = vars;
  }

  getTokens(): ThemeTokens {
    const base = THEMES[this.themeId];
    return { ...base, fontScale: this.fontScale };
  }

  applyToElement(el: HTMLElement): void {
    const tokens = this.getTokens();
    el.style.setProperty("--player-bg", tokens.background);
    el.style.setProperty("--player-fg", tokens.foreground);
    el.style.setProperty("--player-primary", tokens.primary);
    el.style.setProperty("--player-correct", tokens.correct);
    el.style.setProperty("--player-incorrect", tokens.incorrect);
    el.style.setProperty("--player-font-scale", String(tokens.fontScale));
    for (const [k, v] of Object.entries(this.orgVars)) {
      el.style.setProperty(k, v);
    }
  }

  classNames(): string {
    const tokens = this.getTokens();
    return tokens.id === "high_contrast" ? "player-theme-high-contrast" : `player-theme-${tokens.id}`;
  }
}

export function createThemeEngine(initial?: PlayerThemeId): ThemeEngine {
  const engine = new ThemeEngine();
  if (initial) engine.setTheme(initial);
  return engine;
}
