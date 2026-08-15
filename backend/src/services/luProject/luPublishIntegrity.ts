/**
 * Publish integrity: compiled package files vs persisted document blocks.
 * Canonical identity is the normalized leaf component path (e.g. /track-01/module-01/lesson-01/overview.tex).
 */
import type { ParsedLearningUniverse } from "../../controllers/learning-universe-parser.js";
import type { CompiledTexFile, LuCompiledPackage } from "./luCompiledPackageSchema.js";

const ARTIFACT_BASENAMES = new Set([
  "main.tex",
  "main.pdf",
  "main.log",
  "main.aux",
  "main.out",
  "main.toc",
  "main.synctex.gz",
  "metadata.tex",
  "track.tex",
  "module.tex",
  "videos.tex",
]);

const ARTIFACT_EXT =
  /\.(pdf|aux|log|out|toc|lof|lot|bbl|blg|bib|idx|ind|ilg|fls|fdb_latexmk|synctex\.gz)$/i;

export function canonicalDocumentIdentity(path: string): string {
  return `/${path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/")}`.replace(/\/$/, "") || "/";
}

/** Lesson orchestration wrapper: /track/module/capstone.tex — not a publishable document. */
export function isLessonOrchestrationWrapperPath(path: string): boolean {
  const parts = canonicalDocumentIdentity(path).split("/").filter(Boolean);
  return parts.length === 3 && parts[2].toLowerCase().endsWith(".tex");
}

export function isNonPublishableCompileArtifact(path: string): boolean {
  const normalized = canonicalDocumentIdentity(path);
  const base = normalized.split("/").pop()?.toLowerCase() || "";
  if (ARTIFACT_BASENAMES.has(base)) return true;
  if (ARTIFACT_EXT.test(base)) return true;
  if (/\/main\.(tex|pdf|log|aux|out|toc|synctex\.gz)$/i.test(normalized)) return true;
  if (isLessonOrchestrationWrapperPath(normalized)) return true;
  return false;
}

/** Leaf lesson component: /track/module/lessonId/file.tex (4+ segments). Wrappers like /track/module/capstone.tex are not documents. */
export function isLessonLeafDocumentPath(path: string): boolean {
  const parts = canonicalDocumentIdentity(path).split("/").filter(Boolean);
  if (parts.length < 4) return false;
  return parts[parts.length - 1].toLowerCase().endsWith(".tex");
}

export function compiledFileHasDocumentNodes(file: CompiledTexFile): boolean {
  const nodes = file.nodes ?? [];
  if (nodes.length === 0) return Boolean(file.sourceTex?.trim() || file.title);
  return nodes.some((node) => node.type !== "video" && node.kind !== "video");
}

export function isPublishableCompiledDocumentPath(path: string): boolean {
  if (isNonPublishableCompileArtifact(path)) return false;
  return isLessonLeafDocumentPath(path);
}

export function isPublishableCompiledDocument(path: string, file?: CompiledTexFile): boolean {
  if (!isPublishableCompiledDocumentPath(path)) return false;
  if (file && !compiledFileHasDocumentNodes(file)) return false;
  return true;
}

/** @deprecated use isPublishableCompiledDocumentPath */
export function isLessonCompiledDocumentPath(path: string): boolean {
  return isPublishableCompiledDocumentPath(path);
}

export function countCompiledDocuments(compiled: LuCompiledPackage): number {
  return listPublishableCompiledPaths(compiled).length;
}

export function listPublishableCompiledPaths(compiled: LuCompiledPackage): string[] {
  return Object.entries(compiled.files)
    .filter(([path, file]) => isPublishableCompiledDocument(path, file))
    .map(([path]) => canonicalDocumentIdentity(path))
    .sort();
}

export function getCompiledSourcePath(block: {
  type: string;
  content?: unknown;
  compiledSourcePath?: unknown;
}): string | null {
  if (block.type !== "document") return null;
  const raw =
    typeof block.compiledSourcePath === "string" && block.compiledSourcePath.trim()
      ? block.compiledSourcePath
      : typeof (block.content as { compiledSourcePath?: unknown } | undefined)?.compiledSourcePath === "string"
        ? String((block.content as { compiledSourcePath?: string }).compiledSourcePath)
        : null;
  return raw ? canonicalDocumentIdentity(raw) : null;
}

export interface ParsedDocumentRef {
  lessonTitle: string;
  title: string;
  type: string;
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
            type: block.type,
            compiledSourcePath,
            classification: compiledSourcePath ? "compiled" : "dsl-orphan",
          });
        }
      }
    }
  }
  return refs;
}

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
            type: block.type,
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
  for (const [path, file] of Object.entries(compiled.files)) {
    if (!isPublishableCompiledDocument(path, file)) continue;
    n += file.nodes.filter((node) => node.type === "image").length;
  }
  return n;
}

export function diffPublishIntegrity(
  parsed: ParsedLearningUniverse,
  compiled: LuCompiledPackage
): {
  compiledPaths: string[];
  parsedPaths: string[];
  missingFromParsed: string[];
  extraInParsed: string[];
  compiledWithoutSource: string[];
  dslOrphans: ParsedDocumentRef[];
  duplicateParsedIdentities: string[];
  duplicateCompiledIdentities: string[];
} {
  const compiledPaths = listPublishableCompiledPaths(compiled);
  const parsedRefs = listParsedDocumentRefs(parsed);
  const attributed = parsedRefs.filter((ref) => ref.classification === "compiled");
  const dslOrphans = parsedRefs.filter((ref) => ref.classification === "dsl-orphan");
  const parsedPaths = attributed
    .map((ref) => ref.compiledSourcePath)
    .filter((path): path is string => Boolean(path));

  const compiledSet = new Set(compiledPaths);
  const parsedSet = new Set(parsedPaths);
  const compiledCounts = new Map<string, number>();
  const parsedCounts = new Map<string, number>();
  for (const path of compiledPaths) compiledCounts.set(path, (compiledCounts.get(path) ?? 0) + 1);
  for (const path of parsedPaths) parsedCounts.set(path, (parsedCounts.get(path) ?? 0) + 1);

  return {
    compiledPaths,
    parsedPaths: [...parsedSet].sort(),
    missingFromParsed: compiledPaths.filter((path) => !parsedSet.has(path)),
    extraInParsed: [...parsedSet].filter((path) => !compiledSet.has(path)).sort(),
    compiledWithoutSource: Object.keys(compiled.files)
      .map(canonicalDocumentIdentity)
      .filter((path) => !isPublishableCompiledDocumentPath(path))
      .sort(),
    dslOrphans,
    duplicateParsedIdentities: [...parsedCounts.entries()].filter(([, n]) => n > 1).map(([path]) => path),
    duplicateCompiledIdentities: [...compiledCounts.entries()].filter(([, n]) => n > 1).map(([path]) => path),
  };
}

export function logPublishIntegrityDiagnostics(
  parsed: ParsedLearningUniverse,
  compiled: LuCompiledPackage
): ReturnType<typeof diffPublishIntegrity> {
  const diff = diffPublishIntegrity(parsed, compiled);
  const parsedRefs = listParsedDocumentRefs(parsed);

  console.log("[PublishIntegrity] COMPILED DOCUMENT PATHS:");
  for (const path of Object.keys(compiled.files).sort()) {
    const identity = canonicalDocumentIdentity(path);
    const publishable = isPublishableCompiledDocument(path, compiled.files[path]);
    console.log(`[PublishIntegrity] ${identity}${publishable ? "" : " [non-publishable]"}`);
  }
  console.log("[PublishIntegrity] PARSED DOCUMENT IDS/SOURCES:");
  for (const ref of parsedRefs) {
    console.log(`[PublishIntegrity] ${ref.lessonTitle} / ${ref.title}`);
    console.log(`[PublishIntegrity] ${ref.compiledSourcePath ?? "(none)"}`);
    console.log(`[PublishIntegrity] ${ref.type}`);
  }
  console.log("[PublishIntegrity] MISSING FROM PARSED:");
  console.log("[PublishIntegrity]", diff.missingFromParsed.length ? diff.missingFromParsed.join("\n[PublishIntegrity] ") : "(none)");
  console.log("[PublishIntegrity] EXTRA IN PARSED:");
  console.log("[PublishIntegrity]", diff.extraInParsed.length ? diff.extraInParsed.join("\n[PublishIntegrity] ") : "(none)");
  console.log("[PublishIntegrity] COMPILED WITHOUT SOURCE:");
  console.log("[PublishIntegrity]", diff.compiledWithoutSource.length ? diff.compiledWithoutSource.join("\n[PublishIntegrity] ") : "(none)");
  console.log("[PublishIntegrity] DSL ORPHANS:");
  console.log(
    "[PublishIntegrity]",
    diff.dslOrphans.length
      ? diff.dslOrphans.map((ref) => `${ref.lessonTitle}/${ref.title}`).join("\n[PublishIntegrity] ")
      : "(none)"
  );
  console.log("[PublishIntegrity] parsed count:", parsedRefs.length);
  console.log("[PublishIntegrity] compiled count:", diff.compiledPaths.length);
  console.log("[PublishIntegrity] missing document IDs:", diff.missingFromParsed.length ? diff.missingFromParsed : "(none)");
  console.log("[PublishIntegrity] missing document paths:", diff.missingFromParsed.length ? diff.missingFromParsed : "(none)");
  console.log("[PublishIntegrity] extra compiled documents:", diff.extraInParsed.length ? diff.extraInParsed : "(none)");
  return diff;
}

export function assertPublishCompiledIntegrity(
  parsed: ParsedLearningUniverse,
  compiled: LuCompiledPackage
): void {
  const diff = logPublishIntegrityDiagnostics(parsed, compiled);
  const parsedRefs = listParsedDocumentRefs(parsed);

  if (diff.duplicateCompiledIdentities.length) {
    throw new Error(
      `Publish integrity failed: duplicate compiled identities: ${diff.duplicateCompiledIdentities.join(", ")}.`
    );
  }
  if (diff.duplicateParsedIdentities.length) {
    throw new Error(
      `Publish integrity failed: duplicate parsed identities: ${diff.duplicateParsedIdentities.join(", ")}.`
    );
  }
  if (diff.dslOrphans.length) {
    throw new Error(
      `Publish integrity failed: compiled ${diff.compiledPaths.length} document(s) but parsed has ${parsedRefs.length} document block(s). Publish must persist every compiled document.` +
        ` Non-publishable dsl-orphan(s): ${diff.dslOrphans.map((ref) => `${ref.lessonTitle}/${ref.title}`).join(", ")}.`
    );
  }
  if (diff.missingFromParsed.length || diff.extraInParsed.length) {
    throw new Error(
      `Publish integrity failed: compiled ${diff.compiledPaths.length} document(s) but parsed has ${diff.parsedPaths.length} document block(s). Publish must persist every compiled document.` +
        (diff.missingFromParsed.length ? ` Missing: ${diff.missingFromParsed.join(", ")}.` : "") +
        (diff.extraInParsed.length ? ` Extra: ${diff.extraInParsed.join(", ")}.` : "")
    );
  }
}
