/** Stable tex anchors tying explorer components to lesson file regions. */
export const LU_COMPONENT_MARKER_RE = /^%\s*LU:component:([a-zA-Z0-9_-]+)\s*$/m;

export function componentMarker(componentId: string): string {
  return `% LU:component:${componentId}`;
}

export function wrapWithMarker(componentId: string, texBlock: string): string {
  return `\n\n${componentMarker(componentId)}\n${texBlock.trim()}\n`;
}

export function findMarkerIndex(content: string, componentId: string): number | null {
  const marker = componentMarker(componentId);
  const idx = content.indexOf(marker);
  return idx >= 0 ? idx : null;
}

export function blockRange(content: string, componentId: string): { start: number; end: number } | null {
  const marker = componentMarker(componentId);
  const start = content.indexOf(marker);
  if (start < 0) return null;
  const afterMarker = content.indexOf("\n", start);
  if (afterMarker < 0) return { start, end: content.length };
  const rest = content.slice(afterMarker + 1);
  const nextMarker = rest.search(/\n%\s*LU:component:/);
  const end = nextMarker >= 0 ? afterMarker + 1 + nextMarker : content.length;
  return { start, end };
}

export function replaceMarkedBlock(content: string, componentId: string, texBlock: string): string {
  const range = blockRange(content, componentId);
  if (!range) return content;
  const marked = `\n\n${componentMarker(componentId)}\n${texBlock.trim()}\n`;
  const before = content.slice(0, range.start).trimEnd();
  const tail = content.slice(range.end).trimStart();
  return (before + marked + (tail ? "\n\n" + tail : "")).trim() + "\n";
}

export function removeMarkedBlock(content: string, componentId: string): string {
  const marker = componentMarker(componentId);
  const start = content.indexOf(marker);
  if (start < 0) return content;

  let end = content.length;
  const afterMarker = content.indexOf("\n", start);
  if (afterMarker < 0) return content.replace(marker, "").trim() + "\n";

  const rest = content.slice(afterMarker + 1);
  const nextMarker = rest.search(/\n%\s*LU:component:/);
  if (nextMarker >= 0) {
    end = afterMarker + 1 + nextMarker;
  }

  const before = content.slice(0, start).trimEnd();
  const tail = content.slice(end).trimStart();
  return (before + (tail ? "\n\n" + tail : "")).trim() + "\n";
}

export function dedupeLessonHeaders(content: string): string {
  const lines = content.split("\n");
  const kept: string[] = [];
  let seenLesson = false;
  for (const line of lines) {
    if (/^\\lesson\s*\{/.test(line.trim())) {
      if (!seenLesson) {
        kept.push(line);
        seenLesson = true;
      }
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n").trim() + (kept.length ? "\n" : "");
}

export function reorderMarkedBlocks(content: string, orderedIds: string[]): string {
  const headerMatch = content.match(/^[\s\S]*?\\lesson\s*\{[^}]*\}/);
  const header = headerMatch ? headerMatch[0].trim() : "\\lesson{title={Lesson}}";
  const blocks: string[] = [];
  const seen = new Set<string>();

  for (const id of orderedIds) {
    const range = blockRange(content, id);
    if (!range) continue;
    blocks.push(content.slice(range.start, range.end).trim());
    seen.add(id);
  }

  for (const id of listMarkersInContent(content)) {
    if (seen.has(id)) continue;
    const range = blockRange(content, id);
    if (range) blocks.push(content.slice(range.start, range.end).trim());
  }

  return [header, ...blocks].filter(Boolean).join("\n\n").trim() + "\n";
}

export function dedupeComponentMarkers(content: string): string {
  const ids = listMarkersInContent(content);
  const seen = new Set<string>();
  let result = content;
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      continue;
    }
    result = removeMarkedBlock(result, id);
  }
  return result;
}

export function listMarkersInContent(content: string): string[] {
  const ids: string[] = [];
  const re = /^%\s*LU:component:([a-zA-Z0-9_-]+)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    ids.push(m[1]);
  }
  return ids;
}

/** Remove authoring-only LU markers from merged DSL before publish / student parse. */
export function stripAuthoringMarkers(content: string): string {
  return content
    .split("\n")
    .filter((line) => !/^%\s*LU:component:/.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}
