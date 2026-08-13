export interface TableData {
  headers: string[];
  rows: string[][];
}

/** Turn single-line pasted tables (`| a | b || --- |`) into multi-line GFM. */
export function normalizeInlineGfmTable(markdown: string): string {
  const trimmed = markdown.trim();
  if (!trimmed.startsWith("|") || trimmed.includes("\n")) return markdown;
  let normalized = trimmed;
  while (normalized.includes("||")) {
    normalized = normalized.replace(/\|\|+/g, "|\n|");
  }
  return normalized.replace(/\|\s+\|/g, "|\n|");
}

export function parseGfmTable(markdown: string): TableData | null {
  const lines = normalizeInlineGfmTable(markdown).trim().split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  if (!lines[0]!.startsWith("|") || !lines[1]!.match(/^\|?[\s:-|]+\|?$/)) return null;

  const splitRow = (line: string) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

  const headers = splitRow(lines[0]!);
  const rows = lines.slice(2).map(splitRow).filter((r) => r.some((c) => c.length > 0));
  if (!headers.length) return null;
  return { headers, rows };
}

export function buildGfmTable(data: TableData): string {
  const cols = Math.max(data.headers.length, ...data.rows.map((r) => r.length), 1);
  const pad = (cells: string[]) => {
    const next = [...cells];
    while (next.length < cols) next.push("");
    return next;
  };
  const header = `| ${pad(data.headers).join(" | ")} |`;
  const divider = `| ${Array(cols).fill("---").join(" | ")} |`;
  const body = data.rows.map((row) => `| ${pad(row).join(" | ")} |`).join("\n");
  return [header, divider, body].filter(Boolean).join("\n");
}

export function emptyTable(rows = 3, cols = 3, headerRow = true): TableData {
  const headers = headerRow ? Array.from({ length: cols }, (_, i) => `Column ${i + 1}`) : [];
  const bodyRows = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
  return { headers, rows: bodyRows };
}
