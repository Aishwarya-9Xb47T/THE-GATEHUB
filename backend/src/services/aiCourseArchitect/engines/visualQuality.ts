/**
 * V6 Part 3 — Visual quality metadata for generated visuals.
 */
import type { ArchitectLessonBlueprint } from "../types.js";

export interface VisualQualityMeta {
  cameraAngle?: string;
  composition?: string;
  colorPalette?: string;
  accessibilityNotes?: string;
  educationalPurpose: string;
  caption: string;
  learningObjective: string;
  placement: string;
  contrastSafe: boolean;
}

export function enrichVisualContent(
  lesson: ArchitectLessonBlueprint,
  visuals: ArchitectLessonBlueprint["visualContent"]
): NonNullable<ArchitectLessonBlueprint["visualContent"]> {
  const objectives = lesson.objectives?.[0] ?? lesson.title;
  return (visuals ?? []).map((v, i) => ({
    ...v,
    title: v.title || `Visual ${i + 1}: ${lesson.title}`,
    description:
      v.description ||
      `Educational ${v.type} illustrating ${objectives}. Use clear labels, high contrast, and alt-text-friendly composition.`,
    placement: v.placement || (i === 0 ? "after-theory" : "inline"),
    suggestedContent:
      v.suggestedContent ||
      `Camera: eye-level instructional view. Composition: centered subject with labels. Palette: accessible (WCAG AA). Purpose: ${objectives}. Caption: ${v.title}.`,
  }));
}
