/**
 * V6 Part 4 — Accessibility Plus (extended accessibility).
 */
import type { ArchitectLessonBlueprint } from "../types.js";
import { generateLessonAccessibility } from "./accessibilityEngine.js";

export interface AccessibilityPlusMeta {
  audioFriendlySummary: string;
  highContrastDiagramNotes: string;
  screenReaderMetadata: string;
  keyboardNavigationHints: string[];
  captionReady: boolean;
  simplifiedLanguageAvailable: boolean;
}

export function buildAccessibilityPlus(lesson: ArchitectLessonBlueprint): AccessibilityPlusMeta {
  const base = generateLessonAccessibility(lesson);
  return {
    audioFriendlySummary: base.screenReaderSummary ?? `${lesson.title}. ${lesson.summary ?? ""}`,
    highContrastDiagramNotes: "Use high-contrast labels; avoid color-only encoding in diagrams.",
    screenReaderMetadata: base.screenReaderSummary ?? lesson.introduction?.slice(0, 300) ?? "",
    keyboardNavigationHints: [
      "Tab through quiz options",
      "Use arrow keys for interactive elements",
      "Skip to main content landmark",
    ],
    captionReady: Boolean(lesson.videos?.length),
    simplifiedLanguageAvailable: true,
  };
}
