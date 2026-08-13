import type { ParsedLearningUniverse } from "../../controllers/learning-universe-parser.js";
import type { LuProjectJson } from "./luProjectSchema.js";
import type { ProjectFileRecord } from "./luProjectFiles.js";
import { normalizeProjectPath } from "./luProjectFiles.js";
import {
  appendGraphicsToDocumentBlock,
  type DocumentContentBlock,
  legacyBlockToDocument,
} from "../../../../shared/lesson-body/dist/documentPipeline.js";
import {
  canonicalAssetFilename,
  extractIncludeGraphicsRefs,
  extractInlineGraphicsFromTex,
  resolveProjectAssetRef,
  resolveProjectMediaAssetRef,
  stripIncludeGraphicsFromTex,
} from "./luProjectAssetResolver.js";
import { extractVideoCommandsFromTex, stripVideoCommandsFromTex } from "./luTexVideoUtils.js";

interface LessonLocation {
  trackIdx: number;
  modIdx: number;
  lessonIdx: number;
}

interface ProjectComponentRef {
  id: string;
  kind: string;
  title: string;
}

/** Match component .tex path to a lesson using project.json folder layout (case-insensitive). */
function resolveLessonLocation(filePath: string, project: LuProjectJson): LessonLocation | null {
  const normalized = normalizeProjectPath(filePath).toLowerCase();

  for (let trackIdx = 0; trackIdx < project.tracks.length; trackIdx++) {
    const track = project.tracks[trackIdx];
    for (let modIdx = 0; modIdx < track.modules.length; modIdx++) {
      const mod = track.modules[modIdx];
      for (let lessonIdx = 0; lessonIdx < mod.lessons.length; lessonIdx++) {
        const lesson = mod.lessons[lessonIdx];
        const prefix = normalizeProjectPath(`/${track.folder}/${mod.folder}/${lesson.id}/`).toLowerCase();
        if (normalized.startsWith(prefix)) {
          return { trackIdx, modIdx, lessonIdx };
        }
      }
    }
  }
  return null;
}

function findParsedLesson(
  parsed: ParsedLearningUniverse,
  loc: LessonLocation
): ParsedLearningUniverse["tracks"][number]["modules"][number]["lessons"][number] | null {
  return parsed.tracks[loc.trackIdx]?.modules[loc.modIdx]?.lessons[loc.lessonIdx] ?? null;
}

function resolveComponentForFile(
  filePath: string,
  project: LuProjectJson,
  loc: LessonLocation
): ProjectComponentRef | null {
  const lesson = project.tracks[loc.trackIdx]?.modules[loc.modIdx]?.lessons[loc.lessonIdx];
  if (!lesson?.components?.length) return null;
  const normalized = normalizeProjectPath(filePath).toLowerCase();
  for (const comp of lesson.components) {
    if (comp.file && normalizeProjectPath(comp.file).toLowerCase() === normalized) {
      return { id: comp.id, kind: comp.kind, title: comp.title };
    }
    for (const child of comp.children ?? []) {
      if (child.file && normalizeProjectPath(child.file).toLowerCase() === normalized) {
        return { id: child.id, kind: child.kind, title: child.title };
      }
    }
  }
  return null;
}

function lessonAlreadyHasImage(
  lesson: { contentBlocks: Array<{ type: string; content: unknown }> },
  ref: string
): boolean {
  const base = ref.split("/").pop()?.toLowerCase();
  return lesson.contentBlocks.some((b) => {
    if (b.type !== "image") return false;
    const c = b.content as Record<string, string>;
    const file = (c.file || c.path || c.url || "").trim();
    return file === ref || file.split("/").pop()?.toLowerCase() === base;
  });
}

function lessonAlreadyHasVideo(
  lesson: { contentBlocks: Array<{ type: string; content: unknown }> },
  fileRef: string
): boolean {
  const base = fileRef.split("/").pop()?.toLowerCase();
  return lesson.contentBlocks.some((b) => {
    if (b.type !== "video") return false;
    const c = b.content as Record<string, string>;
    const file = (c.file || c.url || "").trim();
    return file === fileRef || file.split("/").pop()?.toLowerCase() === base;
  });
}

function stripTexMedia(text: string): string {
  return stripVideoCommandsFromTex(stripIncludeGraphicsFromTex(text));
}

function stripMediaFromBlockContent(block: { type: string; content: unknown }): void {
  if (typeof block.content === "string") {
    block.content = stripTexMedia(block.content);
    return;
  }
  if (!block.content || typeof block.content !== "object") return;
  const record = block.content as Record<string, unknown>;
  for (const key of ["body", "text", "content", "markdown", "overviewmarkdown"] as const) {
    if (typeof record[key] === "string") {
      record[key] = stripTexMedia(record[key]);
    }
  }
}

function stripInlineMediaFromLessonText(lesson: {
  overviewMarkdown?: string;
  contentBlocks: Array<{ type: string; content: unknown }>;
}): void {
  if (lesson.overviewMarkdown) {
    lesson.overviewMarkdown = stripTexMedia(lesson.overviewMarkdown);
  }
  for (const block of lesson.contentBlocks) {
    if (
      block.type === "overview" ||
      block.type === "theory" ||
      block.type === "note" ||
      block.type === "tip" ||
      block.type === "warning" ||
      block.type === "summary" ||
      block.type === "keypoints" ||
      block.type === "topics" ||
      block.type === "examples"
    ) {
      stripMediaFromBlockContent(block);
    }
  }
}

function insertAtLessonEnd(lesson: { contentBlocks: Array<{ type: string; content: unknown }> }): number {
  return lesson.contentBlocks.length;
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function blockTitle(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const record = content as Record<string, unknown>;
  return String(record.title ?? record.name ?? "").trim();
}

function componentFileStem(component: ProjectComponentRef, filePath?: string): string {
  const fromPath = filePath?.split("/").pop()?.replace(/\.tex$/i, "") ?? "";
  if (fromPath && fromPath !== "overview" && fromPath !== "objectives") return fromPath;
  return component.id;
}

function titleMatchesComponent(blockContent: unknown, component: ProjectComponentRef, filePath?: string): boolean {
  const title = normalizeToken(blockTitle(blockContent));
  if (!title) return false;
  const candidates = [component.title, component.id, componentFileStem(component, filePath)]
    .map(normalizeToken)
    .filter(Boolean);
  return candidates.some((candidate) => title === candidate || title.includes(candidate) || candidate.includes(title));
}

function resolveInsertIndexForComponent(
  lesson: { contentBlocks: Array<{ type: string; content: unknown }> },
  component: ProjectComponentRef | null,
  filePath?: string
): number {
  if (!component) return insertAtLessonEnd(lesson);

  const kind = component.kind.toLowerCase();
  const id = component.id.toLowerCase();

  if (kind === "overview" || id === "overview") {
    const docIdx = lesson.contentBlocks.findIndex(
      (b) =>
        b.type === "document" &&
        /^overview$/i.test(blockTitle(b.content))
    );
    if (docIdx >= 0) return docIdx + 1;
    const idx = lesson.contentBlocks.findIndex((b) => b.type === "overview");
    return idx >= 0 ? idx + 1 : insertAtLessonEnd(lesson);
  }

  if (kind === "objectives" || id === "objectives") {
    for (let i = 0; i < lesson.contentBlocks.length; i++) {
      const block = lesson.contentBlocks[i];
      if (block.type === "keypoints") return i + 1;
      if (block.type === "theory" && normalizeToken(blockTitle(block.content)).includes("objective")) {
        return i + 1;
      }
    }
  }

  if (kind === "quiz" || id.startsWith("quiz")) {
    const idx = lesson.contentBlocks.findIndex((b) => b.type === "quiz");
    return idx >= 0 ? idx + 1 : insertAtLessonEnd(lesson);
  }

  if (kind === "practice" || id === "practice") {
    const idx = lesson.contentBlocks.findIndex((b) => b.type === "practice");
    return idx >= 0 ? idx + 1 : insertAtLessonEnd(lesson);
  }

  for (let i = 0; i < lesson.contentBlocks.length; i++) {
    const block = lesson.contentBlocks[i];
    if (block.type !== "theory" && block.type !== "summary" && block.type !== "topics" && block.type !== "examples") {
      continue;
    }
    if (titleMatchesComponent(block.content, component, filePath)) {
      return i + 1;
    }
  }

  const stem = normalizeToken(componentFileStem(component, filePath));
  if (stem) {
    for (let i = 0; i < lesson.contentBlocks.length; i++) {
      const block = lesson.contentBlocks[i];
      if (block.type !== "theory" && block.type !== "summary") continue;
      const title = normalizeToken(blockTitle(block.content));
      if (title && (title === stem || title.includes(stem) || stem.includes(title))) {
        return i + 1;
      }
    }
  }

  return insertAtLessonEnd(lesson);
}

/** @deprecated use stripInlineMediaFromLessonText */
function stripGraphicsFromLessonText(lesson: {
  overviewMarkdown?: string;
  contentBlocks: Array<{ type: string; content: unknown }>;
}): void {
  stripInlineMediaFromLessonText(lesson);
}

/**
 * Scan component .tex files and merge \\includegraphics into the matching lesson body
 * (inline document order — never separate image content blocks).
 */
export function injectIncludeGraphicsFromProjectTex(
  parsed: ParsedLearningUniverse,
  project: LuProjectJson,
  files: ProjectFileRecord[]
): number {
  let injected = 0;

  for (const file of files) {
    if (file.isFolder || !file.content?.trim() || !file.path.endsWith(".tex")) continue;

    const snippets = extractInlineGraphicsFromTex(file.content);
    if (!snippets) continue;

    const loc = resolveLessonLocation(file.path, project);
    if (!loc) {
      console.warn(`[LU-IMAGES] Could not map tex file to lesson: ${file.path}`);
      continue;
    }

    const lesson = findParsedLesson(parsed, loc);
    if (!lesson) continue;

    const component = resolveComponentForFile(file.path, project, loc);
    const isOverview =
      component?.kind === "overview" ||
      component?.id === "overview" ||
      file.path.toLowerCase().endsWith("/overview.tex");

    if (isOverview) {
      const docIdx = lesson.contentBlocks.findIndex(
        (b) =>
          b.type === "document" &&
          /^overview$/i.test(blockTitle(b.content))
      );
      if (docIdx >= 0) {
        if (appendInlineGraphicsToBlock(lesson.contentBlocks[docIdx], snippets)) {
          injected++;
        }
        continue;
      }
      const current = lesson.overviewMarkdown ?? "";
      if (!current.includes("\\includegraphics")) {
        lesson.overviewMarkdown = current.trimEnd() + (current ? "\n\n" : "") + snippets;
        injected++;
      }
      continue;
    }

    const hostIdx = findHostBlockIndex(lesson, component, file.path);
    if (hostIdx < 0) continue;

    if (appendInlineGraphicsToBlock(lesson.contentBlocks[hostIdx], snippets)) {
      injected++;
    }
  }

  return injected;
}

function findHostBlockIndex(
  lesson: { contentBlocks: Array<{ type: string; content: unknown }> },
  component: ProjectComponentRef | null,
  filePath: string
): number {
  if (!component) return -1;

  const kind = component.kind.toLowerCase();
  const id = component.id.toLowerCase();
  if (kind === "overview" || id === "overview") {
    const idx = lesson.contentBlocks.findIndex(
      (b) =>
        b.type === "document" &&
        /^overview$/i.test(blockTitle(b.content))
    );
    if (idx >= 0) return idx;
    return lesson.contentBlocks.findIndex((b) => b.type === "overview");
  }

  for (let i = 0; i < lesson.contentBlocks.length; i++) {
    const block = lesson.contentBlocks[i];
    if (
      block.type !== "theory" &&
      block.type !== "summary" &&
      block.type !== "document" &&
      block.type !== "topics" &&
      block.type !== "examples"
    ) {
      continue;
    }
    if (titleMatchesComponent(block.content, component, filePath)) return i;
  }

  const stem = normalizeToken(componentFileStem(component, filePath));
  if (!stem) return -1;
  for (let i = 0; i < lesson.contentBlocks.length; i++) {
    const block = lesson.contentBlocks[i];
    if (block.type !== "theory" && block.type !== "summary") continue;
    const title = normalizeToken(blockTitle(block.content));
    if (title && (title === stem || title.includes(stem) || stem.includes(title))) {
      return i;
    }
  }
  return -1;
}

function appendInlineGraphicsToBlock(
  block: { type: string; content: unknown },
  snippets: string
): boolean {
  if (!snippets.trim()) return false;

  if (block.type === "document") {
    return appendGraphicsToDocumentBlock(block as DocumentContentBlock, snippets);
  }

  const legacy = legacyBlockToDocument(block);
  if (legacy) {
    const ok = appendGraphicsToDocumentBlock(legacy, snippets);
    if (ok) {
      block.type = "document";
      block.content = legacy.content;
    }
    return ok;
  }

  const bodyKeys = ["body", "text", "markdown"] as const;

  if (typeof block.content === "string") {
    if (block.content.includes("\\includegraphics")) return false;
    block.content = block.content.trimEnd() + "\n\n" + snippets;
    return true;
  }
  if (!block.content || typeof block.content !== "object") return false;

  const record = block.content as Record<string, unknown>;
  const key = bodyKeys.find((k) => typeof record[k] === "string") ?? "body";
  const current = String(record[key] ?? "");
  if (current.includes("\\includegraphics")) return false;
  record[key] = current.trimEnd() + "\n\n" + snippets;
  return true;
}

/** @deprecated inline graphics stay in lesson bodies for HTML renderer */
export function injectIncludeGraphicsFromParsedBlocks(
  _parsed: ParsedLearningUniverse,
  _files: ProjectFileRecord[]
): number {
  return 0;
}

/** Extract inline \\video commands from overview/theory text and attach video content blocks. */
export function injectInlineVideosFromParsedBlocks(
  parsed: ParsedLearningUniverse,
  files: ProjectFileRecord[]
): number {
  let injected = 0;

  for (const track of parsed.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        const texts: Array<{ blockIndex: number; get: () => string; set: (v: string) => void }> = [];

        if (lesson.overviewMarkdown?.includes("\\video")) {
          texts.push({
            blockIndex: -1,
            get: () => lesson.overviewMarkdown ?? "",
            set: (v) => {
              lesson.overviewMarkdown = v;
            },
          });
        }

        for (const block of lesson.contentBlocks) {
          if (typeof block.content !== "string") continue;
          if (!block.content.includes("\\video")) continue;
          if (
            block.type === "overview" ||
            block.type === "theory" ||
            block.type === "summary" ||
            block.type === "topics" ||
            block.type === "examples"
          ) {
            texts.push({
              blockIndex: lesson.contentBlocks.indexOf(block),
              get: () => block.content as string,
              set: (v) => {
                block.content = v;
              },
            });
          }
        }

        for (const entry of texts) {
          const cmds = extractVideoCommandsFromTex(entry.get());
          if (!cmds.length) continue;
          entry.set(stripVideoCommandsFromTex(entry.get()));

          let insertAt =
            entry.blockIndex >= 0 ? Math.min(entry.blockIndex + 1, lesson.contentBlocks.length) : lesson.contentBlocks.length;

          for (const video of cmds) {
            const ref = video.file || video.url;
            if (!ref || lessonAlreadyHasVideo(lesson, ref)) continue;
            const resolved = resolveProjectMediaAssetRef(ref, files, "video");
            const filename = canonicalAssetFilename(ref, resolved);
            lesson.contentBlocks.splice(insertAt, 0, {
              type: "video",
              content: {
                type: video.type,
                file: filename,
                url: ref,
                title: video.title,
                youtubeId: video.youtubeId,
              },
            });
            lesson.videos.push({
              type: video.type,
              url: ref,
              file: filename,
              title: video.title,
              youtubeId: video.youtubeId,
            });
            insertAt++;
            injected++;
          }
        }
      }
    }
  }

  return injected;
}

/** Build lesson preview blocks exactly as publish/compile see them. */
export function buildLessonPreviewForFile(
  parsed: ParsedLearningUniverse,
  project: LuProjectJson,
  activeFilePath?: string
): {
  lessonTitle: string;
  blocks: ParsedLearningUniverse["tracks"][number]["modules"][number]["lessons"][number]["contentBlocks"];
  focusComponentId: string | null;
} | null {
  if (!activeFilePath?.trim()) {
    for (const track of parsed.tracks) {
      for (const mod of track.modules) {
        for (const lesson of mod.lessons) {
          if (lesson.contentBlocks.length) {
            return { lessonTitle: lesson.title, blocks: lesson.contentBlocks, focusComponentId: null };
          }
        }
      }
    }
    return null;
  }

  const loc = resolveLessonLocation(activeFilePath, project);
  if (!loc) return null;
  const lesson = findParsedLesson(parsed, loc);
  if (!lesson) return null;

  const component = resolveComponentForFile(activeFilePath, project, loc);
  return {
    lessonTitle: lesson.title,
    blocks: lesson.contentBlocks,
    focusComponentId: component?.id ?? null,
  };
}

/** Run all inline media injection passes for publish / student experience. */
export function injectAllIncludeGraphicsForPublish(
  parsed: ParsedLearningUniverse,
  project: LuProjectJson | null,
  files: ProjectFileRecord[]
): number {
  let n = 0;
  if (project) {
    n += injectIncludeGraphicsFromProjectTex(parsed, project, files);
  }
  n += injectIncludeGraphicsFromParsedBlocks(parsed, files);
  n += injectInlineVideosFromParsedBlocks(parsed, files);
  return n;
}
