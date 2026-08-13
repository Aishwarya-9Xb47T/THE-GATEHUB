import { ImportError } from "./importErrors.js";

export function extractTextFromCsv(buffer: Buffer): string {
  const raw = buffer.toString("utf8").replace(/^\uFEFF/, "").trim();
  if (!raw) throw new ImportError(422, "FILE_EMPTY", "CSV file is empty.", "Upload a file with question rows.");

  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const rows = lines.map((line) => parseCsvLine(line));
  if (!rows.length) throw new ImportError(422, "FILE_EMPTY", "No rows found in CSV.", "Include a header row and question data.");

  const header = rows[0]!.map((h) => h.toLowerCase().trim());
  const stemIdx = header.findIndex((h) => /question|stem|prompt|text/.test(h));
  const typeIdx = header.findIndex((h) => /type/.test(h));
  const answerIdx = header.findIndex((h) => /answer|correct/.test(h));
  const optionCols = header
    .map((h, i) => (/option|choice/.test(h) ? i : -1))
    .filter((i) => i >= 0);

  const out: string[] = [`CSV Import (${rows.length - 1} rows)`];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const stem = stemIdx >= 0 ? row[stemIdx]?.trim() : row[0]?.trim();
    if (!stem) continue;
    out.push(`\nQuestion: ${stem}`);
    if (typeIdx >= 0 && row[typeIdx]) out.push(`Type: ${row[typeIdx]}`);
    if (answerIdx >= 0 && row[answerIdx]) out.push(`Correct: ${row[answerIdx]}`);
    for (const ci of optionCols) {
      const val = row[ci]?.trim();
      if (val) out.push(`Option: ${val}`);
    }
    if (!optionCols.length) {
      for (let c = 1; c < row.length; c++) {
        if (c === stemIdx || c === typeIdx || c === answerIdx) continue;
        const val = row[c]?.trim();
        if (val) out.push(`Option: ${val}`);
      }
    }
  }

  const text = out.join("\n").trim();
  if (text.length < 20) throw new ImportError(422, "NO_QUESTIONS_FOUND", "No questions found in CSV.", "Use columns: Question, Option A, Option B, Correct Answer.");
  return text;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else cur += ch;
  }
  result.push(cur);
  return result;
}

export function extractTextFromHtmlFile(buffer: Buffer): string {
  const html = buffer.toString("utf8");
  return stripHtmlToText(html, "HTML Document");
}

export function stripHtmlToText(html: string, title = "Web Page"): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped.length < 80) {
    throw new ImportError(422, "WEBSITE_NO_CONTENT", "Could not extract readable content.", "Try a different file or paste questions as plain text.");
  }
  return `Page: ${title}\n\nContent:\n${stripped.slice(0, 14000)}`;
}

export function extractTextFromMoodleXml(buffer: Buffer): string {
  const xml = buffer.toString("utf8");
  if (!/<quiz|<question/i.test(xml)) {
    throw new ImportError(422, "UNSUPPORTED_FORMAT", "Not a valid Moodle XML quiz file.", "Export quiz as Moodle XML from your LMS.");
  }

  const blocks = [...xml.matchAll(/<question[^>]*type="([^"]*)"[^>]*>([\s\S]*?)<\/question>/gi)];
  if (!blocks.length) throw new ImportError(422, "NO_QUESTIONS_FOUND", "No questions found in Moodle XML.", "Verify the export contains quiz questions.");

  const lines: string[] = ["Moodle XML Import"];
  for (const block of blocks) {
    const type = block[1] || "unknown";
    const body = block[2] || "";
    const stem = extractXmlTag(body, "questiontext") || extractXmlTag(body, "name") || "";
    if (!stem.trim()) continue;
    lines.push(`\nQuestion: ${decodeXml(stem)}`);
    lines.push(`Type: ${type}`);
    const answers = [...body.matchAll(/<answer[^>]*fraction="([^"]*)"[^>]*>([\s\S]*?)<\/answer>/gi)];
    for (const a of answers) {
      const text = extractXmlTag(a[2] || "", "text") || a[2]?.replace(/<[^>]+>/g, "").trim();
      if (!text) continue;
      const fraction = Number(a[1] || 0);
      lines.push(`Option: ${decodeXml(text)}${fraction > 0 ? " [CORRECT]" : ""}`);
    }
  }

  const text = lines.join("\n").trim();
  if (lines.length < 2) throw new ImportError(422, "NO_QUESTIONS_FOUND", "Moodle XML had no parseable questions.", "Try re-exporting from Moodle.");
  return text;
}

function extractXmlTag(fragment: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = fragment.match(re);
  if (!m?.[1]) return "";
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, "$1").replace(/<[^>]+>/g, " ").trim();
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export async function extractGoogleDocContent(url: string, userId?: string): Promise<string> {
  const docId = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (!docId) throw new ImportError(400, "URL_INVALID", "Invalid Google Docs URL.", "Use a link like https://docs.google.com/document/d/ΓÇª/edit");

  if (userId) {
    const { getGoogleAccessToken } = await import("../../integrations/googleOAuthService.js");
    const token = await getGoogleAccessToken(userId);
    if (token) {
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=text/plain`;
      const res = await fetch(exportUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const text = (await res.text()).trim();
        if (text.length > 50) return `Google Doc\n\n${text}`;
      }
    }
  }

  const pubUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
  const res = await fetch(pubUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; GateHubImport/1.0)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new ImportError(
      403,
      "GOOGLE_FORM_AUTH_REQUIRED",
      "This Google Doc is private or requires sign-in.",
      "Connect your Google account in the import screen, or publish the doc to anyone with the link.",
      true
    );
  }
  const text = (await res.text()).trim();
  if (text.length < 50) throw new ImportError(422, "FILE_EMPTY", "Google Doc appears empty.", "Add content to the document and try again.");
  return `Google Doc\n\n${text}`;
}
