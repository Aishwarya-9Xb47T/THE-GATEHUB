/**
 * Universal content pipeline contract — single source of truth for all editors and consumers.
 *
 * Editor → Save → Compiler → Document AST → course.compiled.json → Publish → Experience → Student/Instructor/PDF
 *
 * No stage after compile may re-parse TeX, rebuild bodies, inject images, or repair markdown.
 */

export const UNIVERSAL_PIPELINE_VERSION = "2.0.0";

/** Bump when compiled package shape changes. */
export const COMPILED_PACKAGE_CONTRACT_VERSION = "1.1.0";

/** Bump when experience payloads change shape. */
export const EXPERIENCE_PAYLOAD_CONTRACT_VERSION = "1.5.0";

export const PIPELINE_STAGES = [
  "editor",
  "save",
  "compiler",
  "compiled_package",
  "publish",
  "experience",
  "student",
  "instructor",
  "pdf",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** Rich lesson prose is ALWAYS type=document with content.nodes[]. */
export const COMPILED_DOCUMENT_BLOCK_TYPE = "document" as const;

/** Interactive blocks (quiz, practice, lab, …) are separate — not document AST. */
export const INTERACTIVE_BLOCK_TYPES = new Set([
  "quiz",
  "practice",
  "project",
  "coding-lab",
  "codinglab",
  "notebook",
  "research-paper",
  "research",
  "assignment",
  "video",
  "image",
  "resource",
  "download",
]);

export function isCompiledDocumentBlock(block: { type: string }): boolean {
  return block.type === COMPILED_DOCUMENT_BLOCK_TYPE;
}

export function hasDocumentNodes(payload: {
  nodes?: unknown;
}): payload is { nodes: unknown[] } {
  return Array.isArray(payload.nodes) && payload.nodes.length > 0;
}
