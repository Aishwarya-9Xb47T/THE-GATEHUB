/**
 * Surgical LaTeX edits — replace blocks and inputs, never append duplicates.
 */
import { componentMarker } from "./luTexMarkers.js";
import { wrapComponentInput, siblingInputRef, componentInputRef } from "./luComponentFilePaths.js";
import { normalizeProjectPath } from "./luProjectFiles.js";
import type { LuProjectJson } from "./luProjectSchema.js";

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/}/g, "\\}");
}

function isInsideLatexComment(text: string, index: number): boolean {
  let lineStart = text.lastIndexOf("\n", index - 1);
  lineStart = lineStart === -1 ? 0 : lineStart + 1;
  const beforeMatch = text.slice(lineStart, index);
  for (let i = beforeMatch.length - 1; i >= 0; i--) {
    if (beforeMatch[i] === "%" && (i === 0 || beforeMatch[i - 1] !== "\\")) {
      return true;
    }
  }
  return false;
}

export function extractFirstBraceBlock(content: string, command: string): string | null {
  const re = new RegExp(`\\\\${command}\\s*\\{`, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (isInsideLatexComment(content, match.index)) continue;
    const idx = match.index;
    let depth = 0;
    for (let i = idx; i < content.length; i++) {
      if (content[i] === "\\") {
        i++;
        continue;
      }
      if (content[i] === "{") depth++;
      else if (content[i] === "}") {
        depth--;
        if (depth === 0) return content.slice(idx, i + 1);
      }
    }
  }
  return null;
}

/** Metadata-only block — strips embedded \\input lines and fixes stray `}},` from bad emitters. */
export function extractOrchestrationMeta(content: string, command: string): string | null {
  const re = new RegExp(`\\\\${command}\\s*\\{`, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (isInsideLatexComment(content, match.index)) continue;
    const idx = match.index;

    const metaLines: string[] = [];
    const rest = content.slice(idx).split("\n");
    metaLines.push(rest[0] ?? `\\${command}{`);

    for (let i = 1; i < rest.length; i++) {
      const line = rest[i];
      const trimmed = line.trim();
      if (trimmed.startsWith("\\input{")) break;
      if (/^%\s*LU:component:/.test(trimmed)) break;
      if (trimmed === "}" || trimmed === "},") continue;
      metaLines.push(line.replace(/\}\},/g, "},"));
    }

    const joined = metaLines.join("\n").trimEnd().replace(/,\s*$/, "");
    if (!joined.startsWith(`\\${command}`)) continue;
    return `${joined}\n}`;
  }
  return null;
}

function findClosingBrace(text: string, openIndex: number): number {
  if (text[openIndex] !== "{") return -1;
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** True for LU DSL bodies like `type={youtube},url={...}` — not legacy `\\video{clip.mp4}`. */
export function isDslVideoBody(inner: string): boolean {
  return /type\s*=\s*\{/.test(inner);
}

/** Walk `\\command{...}` blocks with balanced braces; replacer returns null to keep original. */
export function replaceBraceCommands(
  content: string,
  command: string,
  replacer: (inner: string, full: string) => string | null
): string {
  const needle = `\\${command}{`;
  let result = "";
  let i = 0;
  while (i < content.length) {
    const idx = content.indexOf(needle, i);
    if (idx < 0) {
      result += content.slice(i);
      break;
    }
    result += content.slice(i, idx);
    const openBrace = idx + needle.length - 1;
    const closeBrace = findClosingBrace(content, openBrace);
    if (closeBrace < 0) {
      result += content.slice(idx);
      break;
    }
    const full = content.slice(idx, closeBrace + 1);
    const inner = content.slice(openBrace + 1, closeBrace);
    result += replacer(inner, full) ?? full;
    i = closeBrace + 1;
  }
  return result;
}

/** Repair track/module/lesson orchestration .tex from project.json (returns true if any file changed). */
export function repairOrchestrationFromProject(
  contentMap: Map<string, string>,
  project: LuProjectJson
): boolean {
  let changed = false;
  for (const track of project.tracks) {
    const trackPath = normalizeProjectPath(`/${track.folder}/${track.file}`);
    const repairedTrack = rebuildTrackInputs(track, contentMap.get(trackPath) ?? "");
    if (repairedTrack !== contentMap.get(trackPath)) {
      contentMap.set(trackPath, repairedTrack);
      changed = true;
    }

    for (const mod of track.modules) {
      const modPath = normalizeProjectPath(`/${track.folder}/${mod.folder}/${mod.file}`);
      const repairedMod = rebuildModuleInputs(mod, track.folder, mod.folder, contentMap.get(modPath) ?? "");
      if (repairedMod !== contentMap.get(modPath)) {
        contentMap.set(modPath, repairedMod);
        changed = true;
      }

      for (const lesson of mod.lessons) {
        const lessonPath = normalizeProjectPath(`/${track.folder}/${mod.folder}/${lesson.file}`);
        const repairedLesson = rebuildLessonInputs(
          lesson.title,
          lesson.components ?? [],
          lesson.id,
          contentMap.get(lessonPath) ?? ""
        );
        if (repairedLesson !== contentMap.get(lessonPath)) {
          contentMap.set(lessonPath, repairedLesson);
          changed = true;
        }

        for (const comp of lesson.components ?? []) {
          if (comp.kind !== "quiz" || !comp.file) continue;
          const quizPath = normalizeProjectPath(comp.file);
          const repairedQuiz = rebuildQuizContainerInputs(
            comp,
            contentMap.get(quizPath) ?? ""
          );
          if (repairedQuiz !== contentMap.get(quizPath)) {
            contentMap.set(quizPath, repairedQuiz);
            changed = true;
          }
        }
      }
    }
  }
  return changed;
}

/** Keep exactly one command block; preserve non-matching lines (e.g. \\input). */
export function dedupeCommandBlock(content: string, command: string): string {
  const re = new RegExp(`\\\\${command}\\s*\\{`, "g");
  const blocks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = re.exec(content)) !== null) {
    if (isInsideLatexComment(content, match.index)) continue;
    const idx = match.index;
    let depth = 0;
    let end = -1;
    for (let i = idx; i < content.length; i++) {
      if (content[i] === "\\") {
        i++;
        continue;
      }
      if (content[i] === "{") depth++;
      else if (content[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end >= 0) blocks.push(content.slice(idx, end + 1));
  }

  if (blocks.length === 0) return content.trim() + (content.trim() ? "\n" : "");

  const first = blocks[0];
  let cleaned = content;
  for (const block of blocks) {
    cleaned = cleaned.replace(block, "");
  }

  const inputsAndMarkers = cleaned
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return t.startsWith("\\input{") || /^%\s*LU:component:/.test(t) || t === "";
    })
    .join("\n")
    .trim();

  const parts = [first.trim()];
  if (inputsAndMarkers) parts.push(inputsAndMarkers);
  return parts.join("\n\n").trim() + "\n";
}

export function patchMetadataTitle(content: string, command: string, title: string): string {
  const deduped = dedupeCommandBlock(content, command);
  const block = extractFirstBraceBlock(deduped, command);
  if (!block) return deduped;
  const patched = block.replace(/title\s*=\s*\{[^}]*\}/, `title={${esc(title)}}`);
  return deduped.replace(block, patched);
}

export function normalizeQuestionInputRefs(content: string): string {
  return content
    .replace(/\\input\{question\s+(\d+)\}/gi, (_, n) => {
      const num = String(n).padStart(2, "0");
      return `\\input{question-${num}}`;
    })
    .replace(/\\input\{question-(\d)(?!\d)\}/g, (_, n) => `\\input{question-${String(n).padStart(2, "0")}}`);
}

export function listInputRefs(content: string): string[] {
  return [...content.matchAll(/\\input\{([^}]+)\}/g)].map((m) => m[1].trim());
}

export function hasComponentMarker(content: string, componentId: string): boolean {
  return content.includes(componentMarker(componentId));
}

/** Append one component input block if not already present. */
export function addComponentInput(
  content: string,
  componentId: string,
  lessonId: string,
  kind: string,
  relativeTo: "lesson" | "sibling" = "lesson"
): string {
  const deduped = relativeTo === "lesson" ? dedupeCommandBlock(content, "lesson") : content;
  if (hasComponentMarker(deduped, componentId)) return deduped.trim() + "\n";
  return (deduped.trim() + wrapComponentInput(componentId, lessonId, kind, relativeTo)).trim() + "\n";
}

/** Append one child input inside quiz/resources container. */
export function addSiblingInput(
  content: string,
  componentId: string,
  parentKind: "quiz" | "resources",
  childKind?: string
): string {
  const cmd = parentKind === "quiz" ? "quiz" : "resource";
  const deduped = dedupeCommandBlock(content, cmd);
  if (hasComponentMarker(deduped, componentId)) return deduped.trim() + "\n";
  const resolvedChildKind =
    childKind ?? (parentKind === "quiz" ? "question" : "resources");
  const block = `\n\n${componentMarker(componentId)}\n\\input{${siblingInputRef(componentId, resolvedChildKind)}}\n`;
  return normalizeQuestionInputRefs(deduped.trim() + block).trim() + "\n";
}

export function removeComponentInput(content: string, componentId: string): string {
  const marker = componentMarker(componentId);
  const idx = content.indexOf(marker);
  if (idx < 0) return content;
  const after = content.indexOf("\n", idx);
  const rest = after >= 0 ? content.slice(after + 1) : "";
  const nextMarker = rest.search(/\n%\s*LU:component:/);
  const end = nextMarker >= 0 ? after! + 1 + nextMarker : content.length;
  const before = content.slice(0, idx).trimEnd();
  const tail = content.slice(end).trimStart();
  return (before + (tail ? "\n\n" + tail : "")).trim() + "\n";
}

export function rebuildLessonInputs(
  lessonTitle: string,
  components: Array<{ id: string; kind: string; file?: string }>,
  lessonId: string,
  existingContent: string
): string {
  const meta = extractLessonMetaOnly(existingContent, lessonTitle);
  const seen = new Set<string>();
  const lines = [meta.trim()];
  for (const comp of components) {
    if (seen.has(comp.id)) continue;
    seen.add(comp.id);
    lines.push("");
    lines.push(componentMarker(comp.id));
    lines.push(`\\input{${componentInputRef(lessonId, comp.id, comp.kind, comp.file)}}`);
  }
  return lines.join("\n").trim() + "\n";
}

/** Lesson header only — never absorb component markers or \\input lines into \\lesson{...}. */
function extractLessonMetaOnly(content: string, lessonTitle: string): string {
  const block =
    extractFirstBraceBlock(content, "lesson") ||
    `\\lesson{title={${esc(lessonTitle)}},duration={45},order={1}}`;

  const lines = block.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith("\\input{")) return false;
    if (/^%\s*LU:component:/.test(trimmed)) return false;
    return true;
  });

  let joined = lines.join("\n").trimEnd().replace(/,\s*$/, "");
  if (!joined.endsWith("}")) joined += "\n}";
  return joined;
}

/** Quiz container: metadata block + \\input per child using actual child .tex basenames. */
export function rebuildQuizContainerInputs(
  container: {
    title?: string;
    id: string;
    children?: Array<{ id: string; kind: string; file?: string }>;
  },
  existingContent: string
): string {
  const meta =
    extractFirstBraceBlock(existingContent, "quiz") ||
    `\\quiz{title={${esc(container.title || "Quiz")}}}`;
  const lines = [meta.trim()];
  for (const child of container.children ?? []) {
    lines.push("");
    lines.push(componentMarker(child.id));
    lines.push(`\\input{${siblingInputRef(child.id, child.kind, child.file)}}`);
  }
  return normalizeQuestionInputRefs(lines.join("\n").trim() + "\n");
}

export function rebuildModuleInputs(
  mod: { title: string; description?: string; lessons: Array<{ file: string }> },
  trackFolder: string,
  modFolder: string,
  existingContent: string
): string {
  const meta =
    extractOrchestrationMeta(existingContent, "module") ||
    `\\module{title={${esc(mod.title)}},description={${esc(mod.description || "")}},prerequisites={},learningOutcomes={},estimatedHours={2}}`;
  const lessonRefs = new Set(
    mod.lessons.map((l) => `${trackFolder}/${modFolder}/${l.file.replace(/\.tex$/i, "")}`)
  );
  const preservedInputs = listInputRefs(existingContent).filter((ref) => !lessonRefs.has(ref));

  const lines = [meta.trim()];
  for (const lesson of mod.lessons) {
    const base = lesson.file.replace(/\.tex$/i, "");
    lines.push("");
    lines.push(`\\input{${trackFolder}/${modFolder}/${base}}`);
  }
  for (const ref of preservedInputs) {
    lines.push("");
    lines.push(`\\input{${ref}}`);
  }
  return lines.join("\n").trim() + "\n";
}

export function rebuildTrackInputs(
  track: { title: string; description?: string; folder: string; modules: Array<{ folder: string }> },
  existingContent: string
): string {
  const meta =
    extractOrchestrationMeta(existingContent, "track") ||
    `\\track{title={${esc(track.title)}},description={${esc(track.description || "")}},learningOutcomes={},careerOutcomes={},difficulty={Beginner}}`;
  const lines = [meta.trim()];
  for (const mod of track.modules) {
    lines.push("");
    lines.push(`\\input{${track.folder}/${mod.folder}/module}`);
  }
  return dedupeCommandBlock(lines.join("\n").trim() + "\n", "track");
}

export function addMainInputLine(mainContent: string, inputRef: string): string {
  const line = `\\input{${inputRef}}`;
  if (mainContent.includes(line)) return mainContent;
  const docMatch = mainContent.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  if (!docMatch) return mainContent;
  const body = docMatch[1].trim();
  const nextBody = body ? `${body}\n${line}` : line;
  return mainContent.replace(docMatch[0], `\\begin{document}\n${nextBody}\n\\end{document}`);
}

export function removeMainInputLine(mainContent: string, inputRef: string): string {
  const line = `\\input{${inputRef}}`;
  return mainContent
    .split("\n")
    .filter((l) => l.trim() !== line)
    .join("\n");
}
