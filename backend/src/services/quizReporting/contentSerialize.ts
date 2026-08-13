/**
 * Safe serialization of quiz question content for CSV / Excel / plain-text exports.
 * Never emits "[object Object]" for known content shapes.
 */

export function stringifyExportValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item == null) return "";
        if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
          return String(item);
        }
        if (typeof item === "object") {
          const o = item as Record<string, unknown>;
          if (o.text != null) return String(o.text);
          if (o.label != null) return String(o.label);
          if (o.url != null) return String(o.url);
          if (o.latex != null) return String(o.latex);
          if (o.code != null || o.content != null) return String(o.code ?? o.content);
        }
        return stringifyExportValue(item);
      })
      .filter(Boolean)
      .join(" | ");
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (o.text != null) return String(o.text);
    if (o.label != null) return String(o.label);
    if (o.latex != null) return `Formula: ${String(o.latex)}`;
    if (o.code != null || o.content != null) {
      const lang = o.language ? ` (${o.language})` : "";
      return `Code${lang}:\n${String(o.code ?? o.content)}`;
    }
    if (Array.isArray(o.headers) || Array.isArray(o.rows)) {
      return serializeTableForExport(o);
    }
    if (o.url != null) {
      const kind = o.type ? String(o.type) : "Media";
      return `${kind}: ${String(o.url)}`;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

export function serializeTableForExport(table: Record<string, unknown>): string {
  const headers = Array.isArray(table.headers) ? table.headers.map(String) : [];
  const rows = Array.isArray(table.rows)
    ? table.rows.map((r) => (Array.isArray(r) ? r.map(String) : [String(r)]))
    : [];
  const lines = [];
  if (headers.length) lines.push(headers.join(" | "));
  for (const row of rows) lines.push(row.join(" | "));
  return lines.join("\n") || "[Table]";
}

/** Describe rich media found in question text + metadata for CSV/Excel cells. */
export function describeQuestionContentForExport(args: {
  text?: string | null;
  metadata?: unknown;
}): string {
  const text = String(args.text || "");
  const meta = (args.metadata && typeof args.metadata === "object" ? args.metadata : {}) as Record<
    string,
    unknown
  >;
  const parts: string[] = [];

  const plain = text
    .replace(/```[\s\S]*?```/g, "[Code block]")
    .replace(/\$\$[\s\S]*?\$\$/g, "[Formula]")
    .replace(/\$[^$\n]+\$/g, "[Formula]")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
      const u = String(url);
      if (/\.(mp4|webm|mov)(\?|$)/i.test(u) || /video/i.test(String(alt))) {
        return `[Video attached] ${u}`;
      }
      if (/\.(mp3|wav|ogg)(\?|$)/i.test(u) || /audio/i.test(String(alt))) {
        return `[Audio attached] ${u}`;
      }
      return `[Image attached] ${u}`;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .trim();
  if (plain) parts.push(plain);

  const code = meta.code || (Array.isArray(meta.codeBlocks) ? meta.codeBlocks[0] : null);
  if (code) {
    const c = code as any;
    const body = String(c.code || c.content || "").trim();
    if (body) parts.push(`Code (${c.language || "plain"}):\n${body}`);
  }
  if (typeof meta.starterCode === "string" && meta.starterCode.trim()) {
    parts.push(`Code:\n${meta.starterCode}`);
  }

  const formulas = meta.formulas || meta.equations;
  if (Array.isArray(formulas) && formulas.length) {
    for (const f of formulas) {
      const latex = typeof f === "string" ? f : (f as any)?.latex || (f as any)?.content;
      if (latex) parts.push(`Formula: ${latex}`);
    }
  }

  const table = meta.table || (Array.isArray(meta.tables) ? meta.tables[0] : null);
  if (table && typeof table === "object") {
    parts.push(`Table:\n${serializeTableForExport(table as Record<string, unknown>)}`);
  }

  const mediaUrl = String((meta as any).mediaUrl || (meta as any).media?.url || "").trim();
  if (mediaUrl) parts.push(`[Media attached] ${mediaUrl}`);

  return parts.filter(Boolean).join("\n\n") || text || "";
}

export function csvEscape(value: unknown): string {
  const s = stringifyExportValue(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function academicMarksForAnswer(args: {
  isCorrect: boolean;
  questionMarks: number;
  marksEarned?: number | null;
}): number {
  if (typeof args.marksEarned === "number" && Number.isFinite(args.marksEarned)) {
    // Prefer stored academic marks when they look like base marks (not gamified balloons)
    if (args.isCorrect && args.marksEarned > args.questionMarks * 3) {
      return args.questionMarks;
    }
    if (!args.isCorrect && args.marksEarned > 0) return 0;
    return args.marksEarned;
  }
  return args.isCorrect ? args.questionMarks : 0;
}
