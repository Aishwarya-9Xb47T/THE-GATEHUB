import { parseCommandBlock } from "../../controllers/learning-universe-parser.js";
import { detectVideoSourceType, extractYouTubeId } from "../../utils/videoSourceUtils.js";

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

export interface ParsedTexVideo {
  type: string;
  url: string;
  file?: string;
  title?: string;
  youtubeId?: string;
}

export function extractVideoCommandsFromTex(tex: string): ParsedTexVideo[] {
  const videos: ParsedTexVideo[] = [];
  const re = /\\video\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tex)) !== null) {
    const braceIdx = match.index + match[0].length - 1;
    const extracted = extractBraceValue(tex, braceIdx);
    if (!extracted) continue;

    const params = parseCommandBlock(extracted.value);
    let url = params.url || params.file || "";
    let type = detectVideoSourceType(url, params.type);
    if (type === "external") type = "upload";
    if (params.file && !params.url) {
      url = params.file;
      if (!params.type) type = "upload";
    }
    const youtubeId =
      params.youtubeid || params.videoid || (type === "youtube" ? extractYouTubeId(url) ?? undefined : undefined);

    videos.push({
      type,
      url,
      file: params.file || (type === "upload" ? url : undefined),
      title: params.title,
      youtubeId,
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
