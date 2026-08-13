/**
 * Explicit dependency graph for LU v2 projects — every \\input / \\include edge.
 */
import { listInputRefs } from "./luTexAst.js";
import { normalizeProjectPath, resolveInputPath, type ProjectFileRecord } from "./luProjectFiles.js";
import { resolveProjectAssetRef } from "./luProjectAssetResolver.js";
import type { LuValidationIssue } from "./luProjectValidator.js";

export type DependencyNodeKind =
  | "main"
  | "metadata"
  | "track"
  | "module"
  | "lesson"
  | "component"
  | "asset"
  | "unknown";

export interface DependencyNode {
  id: string;
  path: string;
  kind: DependencyNodeKind;
  exists: boolean;
}

export interface DependencyEdge {
  from: string;
  to: string;
  ref: string;
  line?: number;
  kind?: "input" | "graphics";
}

export interface LuDependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  missingTargets: string[];
  cycles: string[][];
}

function classifyPath(path: string): DependencyNodeKind {
  if (/\/main\.tex$/i.test(path)) return "main";
  if (/\/metadata\.tex$/i.test(path)) return "metadata";
  if (/\/track\.tex$/i.test(path)) return "track";
  if (/\/module\.tex$/i.test(path)) return "module";
  if (/\/lesson-\d+\.tex$/i.test(path)) return "lesson";
  if (/\/lesson-\d+\//i.test(path)) return "component";
  if (/\.(png|jpe?g|gif|pdf|bib)$/i.test(path)) return "asset";
  return "unknown";
}

function resolveInputFromSource(
  ref: string,
  sourcePath: string,
  contentMap: Map<string, string>
): string | null {
  const normalizedSource = normalizeProjectPath(sourcePath);
  const dir = normalizedSource.includes("/")
    ? normalizedSource.slice(0, normalizedSource.lastIndexOf("/"))
    : "";

  const candidates = new Set<string>();
  const base = ref.replace(/\\/g, "/").trim();
  candidates.add(resolveInputPath(base));
  if (!base.startsWith("/")) {
    candidates.add(resolveInputPath(`${dir}/${base}`));
  }
  const lessonMatch = normalizedSource.match(/^(.*\/lesson-\d+)\//i);
  if (lessonMatch && !base.includes("/")) {
    candidates.add(resolveInputPath(`${lessonMatch[1]}/${base}`));
  }

  for (const candidate of candidates) {
    if (contentMap.has(candidate)) return candidate;
  }
  return null;
}

function lineNumberAt(text: string, needle: string): number | undefined {
  const idx = text.indexOf(needle);
  if (idx < 0) return undefined;
  return text.slice(0, idx).split(/\r?\n/).length;
}

export function buildDependencyGraph(files: ProjectFileRecord[]): LuDependencyGraph {
  const contentMap = new Map<string, string>();
  for (const f of files) {
    if (!f.isFolder && f.content != null) {
      contentMap.set(normalizeProjectPath(f.path), f.content);
    }
  }

  const assetExists = (ref: string): boolean => resolveProjectAssetRef(ref, files) != null;

  const nodeMap = new Map<string, DependencyNode>();
  const edges: DependencyEdge[] = [];
  const missingTargets = new Set<string>();
  const visiting = new Map<string, string[]>();
  const cycles: string[][] = [];

  function ensureNode(path: string, exists: boolean): DependencyNode {
    const normalized = normalizeProjectPath(path);
    let node = nodeMap.get(normalized);
    if (!node) {
      node = { id: normalized, path: normalized, kind: classifyPath(normalized), exists };
      nodeMap.set(normalized, node);
    } else if (exists) {
      node.exists = true;
    }
    return node;
  }

  function walk(path: string, stack: string[]): void {
    const normalized = normalizeProjectPath(path);
    if (visiting.has(normalized)) {
      const cycleStart = visiting.get(normalized)!;
      const cyclePath = [...cycleStart, normalized];
      if (cyclePath.length > 1) cycles.push(cyclePath);
      return;
    }

    const content = contentMap.get(normalized);
    ensureNode(normalized, Boolean(content));
    if (!content) return;

    visiting.set(normalized, [...stack, normalized]);

    const inputRefs = listInputRefs(content);
    for (const ref of inputRefs) {
      const resolved = resolveInputFromSource(ref, normalized, contentMap);
      const inputLine = lineNumberAt(content, `\\input{${ref}}`);
      if (resolved) {
        edges.push({ from: normalized, to: resolved, ref, line: inputLine });
        walk(resolved, [...stack, normalized]);
      } else {
        const guessed = resolveInputPath(ref);
        missingTargets.add(guessed);
        ensureNode(guessed, false);
        edges.push({ from: normalized, to: guessed, ref, line: inputLine });
      }
    }

    const includeGraphics = [...content.matchAll(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g)];
    for (const m of includeGraphics) {
      const assetRef = m[1].trim();
      const resolved = resolveProjectAssetRef(assetRef, files);
      const assetPath = resolved
        ? normalizeProjectPath(resolved.path)
        : assetRef.startsWith("/")
          ? normalizeProjectPath(assetRef)
          : normalizeProjectPath(`/${assetRef}`);
      const exists = assetExists(assetRef);
      ensureNode(assetPath, exists);
      edges.push({
        from: normalized,
        to: assetPath,
        ref: assetRef,
        kind: "graphics",
        line: lineNumberAt(content, m[0]),
      });
      if (!exists) missingTargets.add(assetPath);
    }

    visiting.delete(normalized);
  }

  const mainPath = contentMap.has("/main.tex") ? "/main.tex" : [...contentMap.keys()].find((p) => /main\.tex$/i.test(p));
  if (mainPath) walk(mainPath, []);
  for (const path of contentMap.keys()) {
    if (!nodeMap.has(path)) ensureNode(path, true);
  }

  return {
    nodes: [...nodeMap.values()],
    edges,
    missingTargets: [...missingTargets],
    cycles,
  };
}

export function dependencyIssuesToValidation(graph: LuDependencyGraph): LuValidationIssue[] {
  const issues: LuValidationIssue[] = [];

  for (const target of graph.missingTargets) {
    const edge = graph.edges.find((e) => e.to === target);
    const cmd = edge?.kind === "graphics" ? "\\includegraphics" : "\\input";
    issues.push({
      severity: "error",
      code: edge?.kind === "graphics" ? "MISSING_IMAGE_FILE" : "MISSING_INPUT_FILE",
      message: `Missing file referenced by ${cmd}{${edge?.ref ?? target}}: ${target}`,
      file: edge?.from,
      line: edge?.line,
      suggestedFix:
        edge?.kind === "graphics"
          ? "Upload the image under assets/images/ and reference it by filename (e.g. img.png) or full path (assets/images/img.png)"
          : "Run auto-repair or create the missing component file",
    });
  }

  for (const cycle of graph.cycles) {
    issues.push({
      severity: "error",
      code: "CIRCULAR_INCLUDE",
      message: `Circular include detected: ${cycle.join(" → ")}`,
      suggestedFix: "Remove duplicate or circular \\input statements",
    });
  }

  return issues;
}
