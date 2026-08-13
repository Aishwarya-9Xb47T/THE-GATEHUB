/**
 * AI Course Architect → LU project bridge.
 * AI produces JSON only (via blueprintToCourseDocument).
 * LaTeX is generated exclusively by luCourseRenderer.
 */
import type { ArchitectBlueprint, AICourseArchitectInterview } from "./types.js";
import type { LuProjectJson } from "../luProject/luProjectSchema.js";
import type { LuProjectFileEntry } from "../luProject/luProjectFileEmitter.js";
import { blueprintToCourseDocument } from "../luProject/luBlueprintNormalizer.js";
import { assertValidCourseDocument } from "../luProject/luCourseContentSchema.js";
import { renderCourseDocument } from "../luProject/luCourseRenderer.js";

/**
 * Convert AI blueprint to LU v2 project files.
 * @deprecated Direct LaTeX emission removed — use renderCourseDocument(blueprintToCourseDocument(...)) instead.
 */
export function buildProjectFromBlueprint(
  blueprint: ArchitectBlueprint,
  interview: AICourseArchitectInterview
): { project: LuProjectJson; files: LuProjectFileEntry[] } {
  const courseJson = blueprintToCourseDocument(blueprint, interview);
  assertValidCourseDocument(courseJson);
  const rendered = renderCourseDocument(courseJson);
  return { project: rendered.project, files: rendered.files };
}

export { assignVideosToLessons } from "./videoAssignmentEngine.js";
