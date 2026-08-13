/** V3 — Forbidden placeholder patterns. Every agent output is scanned before acceptance. */

export const FORBIDDEN_PATTERNS: Array<{ id: string; pattern: RegExp; label: string }> = [
  { id: "question-n", pattern: /^Question\s*\d+$/i, label: 'Generic "Question N" text' },
  { id: "todo", pattern: /\b(TODO|TBD|FIXME|\[insert|\[TODO)/i, label: "TODO / placeholder marker" },
  { id: "lorem", pattern: /lorem\s+ipsum/i, label: "Lorem ipsum filler" },
  { id: "your-solution", pattern: /#\s*Your solution here/i, label: "Empty coding lab stub" },
  { id: "your-implementation", pattern: /Your implementation here/i, label: "Empty implementation stub" },
  { id: "placeholder", pattern: /\bplaceholder\b/i, label: "Placeholder keyword" },
  { id: "option-a-only", pattern: /^Option [A-D]$/i, label: "Generic option label only" },
  { id: "generic-quiz", pattern: /^Question\s*\d+:\s*Question\s*\d+$/i, label: "Duplicate question label" },
];

/** Scan lab/quiz content for empty stubs — allows guided # Step comments in starter code. */
export function scanForLabPlaceholders(text: string): string[] {
  const hits: string[] = [];
  const patterns: Array<{ label: string; pattern: RegExp }> = [
    { label: 'Generic "Question N" text', pattern: /^Question\s*\d+$/i },
    { label: "Lorem ipsum filler", pattern: /lorem\s+ipsum/i },
    { label: "Empty coding lab stub", pattern: /#\s*Your solution here/i },
    { label: "Empty implementation stub", pattern: /Your implementation here/i },
    { label: "Placeholder keyword", pattern: /\bplaceholder\b/i },
    { label: "Empty add-content stub", pattern: /add your content here/i },
  ];
  for (const { pattern, label } of patterns) {
    if (pattern.test(text)) hits.push(label);
  }
  return hits;
}

export function scanForPlaceholders(text: string): string[] {
  const hits: string[] = [];
  if (typeof text !== "string") return hits;
  const str = text.trim();
  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    if (pattern.test(str)) hits.push(label);
  }
  return hits;
}

export function scanObjectForPlaceholders(
  obj: unknown,
  path = "",
  visited: WeakSet<object> = new WeakSet(),
  depth = 0
): string[] {
  const hits: string[] = [];
  if (obj == null || depth > 12) return hits;
  if (typeof obj === "string") {
    const found = scanForPlaceholders(obj);
    if (found.length) hits.push(...found.map((f) => `${path}: ${f}`));
    return hits;
  }
  if (typeof obj !== "object") return hits;

  if (visited.has(obj as object)) return hits;
  visited.add(obj as object);

  if (Array.isArray(obj)) {
    const limit = Math.min(obj.length, 50);
    for (let i = 0; i < limit; i++) {
      hits.push(...scanObjectForPlaceholders(obj[i], `${path}[${i}]`, visited, depth + 1));
    }
    return hits;
  }

  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    hits.push(...scanObjectForPlaceholders(v, path ? `${path}.${k}` : k, visited, depth + 1));
  }
  return hits;
}

export function sanitizeCodingLabCode(code: string): string {
  return code
    .replace(/#\s*TODO:/gi, "# Step:")
    .replace(/Your implementation here/gi, "Complete the implementation below")
    .replace(/#\s*Your solution here/gi, "# Step: implement the solution");
}

export function sanitizeCodingLab<T extends { starterCode: string; solutionCode?: string; problemStatement?: string }>(
  lab: T
): T {
  return {
    ...lab,
    starterCode: sanitizeCodingLabCode(lab.starterCode),
    solutionCode: lab.solutionCode ? sanitizeCodingLabCode(lab.solutionCode) : lab.solutionCode,
    problemStatement: lab.problemStatement?.replace(/\bplaceholder\b/gi, "exercise"),
  };
}

export function isSubstantiveText(text: string, minWords = 8): boolean {
  if (typeof text !== "string") return false;
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length >= minWords && scanForPlaceholders(text).length === 0;
}

export function shuffleOptions<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
