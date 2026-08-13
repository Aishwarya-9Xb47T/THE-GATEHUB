import { detectVideoSourceType, extractYouTubeId } from "@/lib/videoSourceUtils";

function extractBraceValue(text: string, openBraceIndex: number): { value: string; end: number } | null {
  if (text[openBraceIndex] !== "{") return null;
  let depth = 0;
  for (let i = openBraceIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return { value: text.slice(openBraceIndex + 1, i), end: i + 1 };
    }
  }
  return null;
}

function parseVideoParams(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  const keyPattern = /(\w+)\s*=/g;
  let match: RegExpExecArray | null;
  while ((match = keyPattern.exec(content)) !== null) {
    const key = match[1].toLowerCase();
    let pos = match.index + match[0].length;
    while (pos < content.length && /\s/.test(content[pos])) pos++;
    if (content[pos] === "{") {
      const extracted = extractBraceValue(content, pos);
      if (extracted) {
        parsed[key] = extracted.value.trim();
        keyPattern.lastIndex = extracted.end;
      }
    }
  }
  return parsed;
}

export interface TexVideoRef {
  type: "video";
  file: string;
  path: string;
  url?: string;
  title?: string;
  youtubeId?: string;
  sourceType?: string;
}

export function extractVideoCommandsFromTex(tex: string): TexVideoRef[] {
  const videos: TexVideoRef[] = [];
  const re = /\\video\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tex)) !== null) {
    const braceIdx = match.index + match[0].length - 1;
    const extracted = extractBraceValue(tex, braceIdx);
    if (!extracted) continue;

    const params = parseVideoParams(extracted.value);
    let url = params.url || params.file || "";
    let type = detectVideoSourceType(url, params.type);
    if (type === "external") type = "upload";
    if (params.file && !params.url) {
      url = params.file;
      if (!params.type) type = "upload";
    }
    const ref = params.file || url;
    if (!ref) continue;
    const youtubeId =
      params.youtubeid || params.videoid || (type === "youtube" ? extractYouTubeId(url) ?? undefined : undefined);

    videos.push({
      type: "video",
      file: ref.split("/").pop() || ref,
      path: ref,
      url,
      title: params.title,
      youtubeId,
      sourceType: type,
    });
    re.lastIndex = extracted.end;
  }
  return videos;
}

export function stripVideoCommandsFromTex(tex: string): string {
  let result = tex;
  const re = /\\video\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(result)) !== null) {
    const braceIdx = match.index + match[0].length - 1;
    const extracted = extractBraceValue(result, braceIdx);
    if (!extracted) continue;
    result = result.slice(0, match.index) + result.slice(extracted.end);
    re.lastIndex = match.index;
  }
  return result.replace(/\n{3,}/g, "\n\n").trim();
}
