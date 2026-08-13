/**
 * Render diff — only write .tex files that changed after deterministic rendering.
 */
export interface RenderDiffEntry {
  path: string;
  previous: string | null;
  next: string;
  changed: boolean;
}

export function diffRenderOutputs(
  previous: Map<string, string>,
  next: Map<string, string>
): RenderDiffEntry[] {
  const entries: RenderDiffEntry[] = [];
  const allPaths = new Set([...previous.keys(), ...next.keys()]);

  for (const path of allPaths) {
    const prev = previous.get(path) ?? null;
    const nxt = next.get(path);
    if (nxt === undefined) continue;
    entries.push({
      path,
      previous: prev,
      next: nxt,
      changed: prev !== nxt,
    });
  }

  return entries;
}

export function changedPathsFromDiff(diff: RenderDiffEntry[]): string[] {
  return diff.filter((d) => d.changed).map((d) => d.path);
}

export function summarizeRenderDiff(diff: RenderDiffEntry[]): {
  total: number;
  changed: number;
  unchanged: number;
} {
  const changed = diff.filter((d) => d.changed).length;
  return { total: diff.length, changed, unchanged: diff.length - changed };
}
