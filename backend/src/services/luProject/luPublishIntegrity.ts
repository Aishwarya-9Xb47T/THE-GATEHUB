/**
 * Publish integrity: compiled package files vs persisted document blocks.
 */
import type { ParsedLearningUniverse } from "../../controllers/learning-universe-parser.js";
import type { LuCompiledPackage } from "./luCompiledPackageSchema.js";

export function countCompiledDocuments(compiled: LuCompiledPackage): number {
  return listPublishableCompiledPaths(compiled).length;
}

const NON_PUBLISHABLE_COMPILED_PATHS = new Set(["/metadata.tex"]);

/**
 * Publishable compiled documents = every compiled package file except explicit
 * non-lesson helpers. Do not require `/lesson-\d+/` — lesson folders may be
 * capstone, intro, exam, or any instructor-chosen id.
 */
export function isLessonCompiledDocumentPath(path: string): boolean {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (NON_PUBLISHABLE_COMPILED_PATHS.has(normalized)) return false;
  if (/\/main\.tex$/i.test(normalized)) return false;
  return true;
}

export function listPublishableCompiledPaths(compiled: LuCompiledPackage): string[] {
  return Object.keys(compiled.files)
    .map((path) => (path.startsWith("/") ? path : `/${path}`))
    .filter(isLessonCompiledDocumentPath)
    .sort();
}

export function getCompiledSourcePath(block: {
  type: string;
  content?: unknown;
  compiledSourcePath?: unknown;
}): string | null {
  if (block.type !== "document") return null;
  if (typeof block.compiledSourcePath === "string" && block.compiledSourcePath.trim()) {
    return block.compiledSourcePath.startsWith("/") ? block.compiledSourcePath : `/${block.compiledSourcePath}`;
  }
  const content = block.content as { compiledSourcePath?: unknown } | undefined;
  if (content && typeof content.compiledSourcePath === "string" && content.compiledSourcePath.trim()) {
    const path = content.compiledSourcePath;
    return path.startsWith("/") ? path : `/${path}`;
  }
  return null;
}

export interface ParsedDocumentRef {
  lessonTitle: string;
  title: string;
  compiledSourcePath: string | null;
  classification: "compiled" | "dsl-orphan";
}

function documentBlockTitle(block: { title?: unknown; content?: unknown }): string {
  if (typeof block.title === "string" && block.title.trim()) return block.title;
  const content = block.content as { title?: unknown } | undefined;
  if (content && typeof content.title === "string" && content.title.trim()) return content.title;
  return "(untitled)";
}

export function listParsedDocumentRefs(parsed: ParsedLearningUniverse): ParsedDocumentRef[] {
  const refs: ParsedDocumentRef[] = [];
  for (const track of parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const block of lesson.contentBlocks) {
          if (block.type !== "document") continue;
          const compiledSourcePath = getCompiledSourcePath(block);
          refs.push({
            lessonTitle: lesson.title,
            title: documentBlockTitle(block),
            compiledSourcePath,
            classification: compiledSourcePath ? "compiled" : "dsl-orphan",
          });
        }
      }
    }
  }
  return refs;
}

/**
 * DSL-parsed document blocks without a compiled source are not publishable.
 * The compiled package is the sole source of truth for document persistence.
 */
export function dropNonPublishableDocumentBlocks(
  parsed: ParsedLearningUniverse,
  compiled: LuCompiledPackage
): ParsedDocumentRef[] {
  const publishable = new Set(listPublishableCompiledPaths(compiled));
  const dropped: ParsedDocumentRef[] = [];
  for (const track of parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        lesson.contentBlocks = lesson.contentBlocks.filter((block) => {
          if (block.type !== "document") return true;
          const src = getCompiledSourcePath(block);
          if (src && publishable.has(src)) return true;
          dropped.push({
            lessonTitle: lesson.title,
            title: documentBlockTitle(block),
            compiledSourcePath: src,
            classification: "dsl-orphan",
          });
          return false;
        });
      }
    }
  }
  return dropped;
}

export function countDocumentBlocks(parsed: ParsedLearningUniverse): number {
  return listParsedDocumentRefs(parsed).length;
}

export function countDocumentImages(parsed: ParsedLearningUniverse): number {
  let n = 0;
  for (const track of parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        for (const block of lesson.contentBlocks) {
          if (block.type !== "document") continue;
          const content = block.content as { nodes?: Array<{ type: string }> };
          if (Array.isArray(content?.nodes)) {
            n += content.nodes.filter((node) => node.type === "image").length;
          }
        }
      }
    }
  }
  return n;
}

export function countCompiledImages(compiled: LuCompiledPackage): number {
  let n = 0;
  for (const file of Object.values(compiled.files)) {
    n += file.nodes.filter((node) => node.type === "image").length;
  }
  return n;
}

export function assertPublishCompiledIntegrity(
  parsed: ParsedLearningUniverse,
  compiled: LuCompiledPackage
): void {
  const compiledPaths = listPublishableCompiledPaths(compiled);
  const parsedRefs = listParsedDocumentRefs(parsed);
  const attributed = parsedRefs.filter((ref) => ref.classification === "compiled");
  const orphans = parsedRefs.filter((ref) => ref.classification === "dsl-orphan");
  const attributedPaths = attributed
    .map((ref) => ref.compiledSourcePath)
    .filter((path): path is string => Boolean(path))
    .sort();
  const attributedSet = new Set(attributedPaths);
  const compiledSet = new Set(compiledPaths);
  const missing = compiledPaths.filter((path) => !attributedSet.has(path));
  const extra = attributedPaths.filter((path) => !compiledSet.has(path));
  const extraTitles = parsedRefs
    .filter((ref) => ref.compiledSourcePath && extra.includes(ref.compiledSourcePath))
    .map((ref) => `${ref.lessonTitle} / ${ref.title} (${ref.compiledSourcePath})`);

  console.log("[PublishIntegrity] parsed count:", parsedRefs.length);
  console.log("[PublishIntegrity] compiled count:", compiledPaths.length);
  console.log("[PublishIntegrity] missing document IDs:", missing.length ? missing : "(none)");
  console.log("[PublishIntegrity] missing document paths:", missing.length ? missing : "(none)");
  console.log("[PublishIntegrity] extra compiled documents:", extra.length ? extra : "(none)");
  if (orphans.length) {
    console.warn(
      "[PublishIntegrity] dsl-orphan titles:",
      orphans.map((ref) => `${ref.lessonTitle} / ${ref.title}`)
    );
  }

  if (missing.length || extra.length || orphans.length || compiledPaths.length !== attributed.length) {
    throw new Error(
      `Publish integrity failed: compiled ${compiledPaths.length} document(s) but parsed has ${parsedRefs.length} document block(s). Publish must persist every compiled document.` +
        (missing.length ? ` Missing: ${missing.join(", ")}.` : "") +
        (extraTitles.length ? ` Extra: ${extraTitles.join(", ")}.` : "") +
        (orphans.length
          ? ` Non-publishable dsl-orphan(s): ${orphans.map((ref) => `${ref.lessonTitle}/${ref.title}`).join(", ")}.`
          : "")
    );
  }
}
