/**
 * V6 Part 4 — Content density profiles.
 */
import type { AICourseArchitectInterview } from "../types.js";

export type ContentDensityProfile =
  | "micro"
  | "short"
  | "standard"
  | "deep-dive"
  | "masterclass";

export interface ContentDensityConfig {
  profile: ContentDensityProfile;
  label: string;
  durationMinutes: number;
  theoryWordTarget: number;
  sectionsCount: number;
}

const DENSITY_CONFIGS: Record<ContentDensityProfile, ContentDensityConfig> = {
  micro: { profile: "micro", label: "Micro Lesson (5–10 min)", durationMinutes: 8, theoryWordTarget: 180, sectionsCount: 6 },
  short: { profile: "short", label: "Short Lesson (15–20 min)", durationMinutes: 18, theoryWordTarget: 350, sectionsCount: 10 },
  standard: { profile: "standard", label: "Standard Lesson (30–45 min)", durationMinutes: 38, theoryWordTarget: 600, sectionsCount: 14 },
  "deep-dive": { profile: "deep-dive", label: "Deep Dive (60–90 min)", durationMinutes: 75, theoryWordTarget: 1200, sectionsCount: 18 },
  masterclass: { profile: "masterclass", label: "Masterclass (2–3 hours)", durationMinutes: 150, theoryWordTarget: 2500, sectionsCount: 22 },
};

export function resolveContentDensity(interview: AICourseArchitectInterview): ContentDensityConfig {
  const scale = interview.courseScale?.id ?? "standard";
  const text = `${interview.learningStyle.join(" ")} ${interview.courseInfo.learningGoals.join(" ")}`.toLowerCase();

  if (/crash|micro|quick|bite/i.test(text)) return DENSITY_CONFIGS.micro;
  if (/masterclass|deep|comprehensive|semester/i.test(text)) return DENSITY_CONFIGS["deep-dive"];
  if (/master|phd|research/i.test(text)) return DENSITY_CONFIGS.masterclass;
  if (scale === "mini") return DENSITY_CONFIGS.short;
  if (scale === "master" || scale === "university") return DENSITY_CONFIGS["deep-dive"];
  return DENSITY_CONFIGS.standard;
}

export function formatContentDensityForPrompt(cfg: ContentDensityConfig): string {
  return `Content density: ${cfg.label} (~${cfg.durationMinutes} min, ~${cfg.theoryWordTarget} words theory)`;
}
