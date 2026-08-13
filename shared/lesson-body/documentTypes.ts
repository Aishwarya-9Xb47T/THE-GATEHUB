/**
 * Universal lesson document model — lesson-type agnostic.
 * Every lesson body becomes Document → ordered Nodes.
 */

export type DocumentNode = {
  kind?: string;
  type?: string;
  content?: string;
  tex?: string;
  title?: string;
  typeVariant?: "info" | "warning" | "tip" | "note";
  code?: string;
  language?: string;
  headers?: string[];
  rows?: string[][];
  diagramType?: string;
  url?: string;
  caption?: string;
  options?: string;
  quizId?: string;
  starterCode?: string;
  instructions?: string;
  kernel?: string;
  cells?: Array<{ type: string; source: string }>;
  paperId?: string;
  statement?: string;
  proof?: string;
  scenario?: string;
  solution?: string;
  cards?: Array<{ front: string; back: string }>;
  prompt?: string;
  items?: string[];
  points?: string[];
  ref?: string;
  file?: string;
  centered?: boolean;
  widthOption?: string;
  widthCss?: string;
  latex?: string;
  display?: boolean;
  ordered?: boolean;
  variant?: "info" | "warning" | "tip" | "note";
  sourceType?: string;
  label?: string;
};

/** @deprecated Use DocumentNode */
export type LessonBodyNode = DocumentNode;

export interface LessonDocument {
  title?: string;
  nodes: DocumentNode[];
}

/** LU component .tex wrappers — parser strips these; renderer never sees them. */
export const RICH_TEX_COMMANDS = [
  "overviewmarkdown",
  "overview",
  "theory",
  "summary",
  "note",
  "tip",
  "warning",
  "keypoints",
  "reflection",
  "discussion",
  "checkpoint",
  "certificatecriteria",
  "finalexam",
] as const;

/** Legacy block types that carry document bodies (renderer ignores type). */
export const RICH_BODY_BLOCK_TYPES = [
  "overview",
  "theory",
  "summary",
  "note",
  "tip",
  "warning",
  "keypoints",
  "checkpoint",
  "discussion",
  "certificatecriteria",
  "finalexam",
  "document",
] as const;

export const BODY_FIELD_KEYS = [
  "body",
  "markdown",
  "content",
  "text",
  "prompt",
  "instructions",
  "description",
  "message",
] as const;
