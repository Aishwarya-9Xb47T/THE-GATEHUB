import type { LuExplorerNode } from "./types";
import type { LessonSection } from "./lessonSections";
import { isLearningModeVisualEditor } from "./componentRegistry";

const KIND_TO_SECTION: Partial<Record<LuExplorerNode["kind"], LessonSection>> = {
  overview: "overview",
  objectives: "objectives",
  topics: "topics",
  examples: "examples",
  practice: "practice",
  "coding-lab": "coding-lab",
  notebook: "notebook",
  resources: "resource",
  quiz: "quiz",
  assignment: "assignment",
  discussion: "discussion",
  project: "project",
  "research-paper": "research-paper",
  checkpoint: "checkpoint",
  reflection: "reflection",
  references: "references",
  question: "quiz",
  "resource-item": "resource",
};

export function isComponentKind(kind: LuExplorerNode["kind"]): boolean {
  return kind in KIND_TO_SECTION || isLearningModeVisualEditor(kind);
}

export function kindToSection(kind: LuExplorerNode["kind"]): LessonSection | null {
  return KIND_TO_SECTION[kind] ?? null;
}

export interface LuFocusComponentDetail {
  componentId: string;
  filePath?: string;
}

export interface LuFocusSectionDetail {
  section: LessonSection;
  occurrence?: number;
  filePath?: string;
}

export function dispatchFocusComponent(componentId: string, filePath?: string, delayMs = 80) {
  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent<LuFocusComponentDetail>("lu-focus-component", {
        detail: { componentId, filePath },
      })
    );
  }, delayMs);
}

export function dispatchFocusSection(
  section: LessonSection,
  occurrence = 0,
  filePath?: string,
  delayMs = 80
) {
  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent<LuFocusSectionDetail>("lu-focus-section", {
        detail: { section, occurrence, filePath },
      })
    );
  }, delayMs);
}

export function findNthPatternMatch(content: string, pattern: RegExp, occurrence: number): RegExpMatchArray | null {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  let match: RegExpExecArray | null = null;
  let index = 0;
  while ((match = re.exec(content)) !== null) {
    if (index === occurrence) return match;
    index++;
    if (match[0].length === 0) re.lastIndex++;
  }
  return null;
}

export function findComponentMarkerLine(content: string, componentId: string): number | null {
  const marker = `% LU:component:${componentId}`;
  const idx = content.indexOf(marker);
  if (idx < 0) return null;
  return content.slice(0, idx).split("\n").length;
}
