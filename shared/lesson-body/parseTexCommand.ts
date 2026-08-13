import {
  BODY_FIELD_KEYS,
  RICH_BODY_BLOCK_TYPES,
  RICH_TEX_COMMANDS,
  type LessonDocument,
} from "./documentTypes";
import { sanitizeDslContent } from "./sanitizeDslContent.js";

export interface ParsedLessonTexCommand {
  command: string;
  title?: string;
  body: string;
}

export function extractBraceValue(text: string, openBraceIndex: number): string {
  if (text[openBraceIndex] !== "{") return "";
  let depth = 0;
  const start = openBraceIndex + 1;
  for (let i = openBraceIndex; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        return text.substring(start, i);
      }
    }
  }
  return text.substring(start);
}

export function extractNamedParam(body: string, paramName: string): string | undefined {
  const regex = new RegExp(`${paramName}\\s*=\\s*\\{`, "i");
  const match = body.match(regex);
  if (!match || match.index === undefined) return undefined;
  const openBraceIdx = match.index + match[0].length - 1;
  return extractBraceValue(body, openBraceIdx);
}

export function parseLessonTexCommand(
  raw: string
): { node: import("./documentTypes").DocumentNode; remainder: string } | null {
  const match = raw.match(/^\s*\\([a-zA-Z0-9_-]+)\s*(?:=\s*)?\{/);
  if (!match) return null;

  const cmd = match[1].toLowerCase();
  const braceStart = raw.indexOf("{", (match.index ?? 0) + match[0].length - 1);
  const body = extractBraceValue(raw, braceStart);
  let remainder = raw.substring(braceStart + body.length + 2);
  remainder = remainder.replace(/^\s*\}\s*\\?/, "").trim();

  if (cmd === "text") {
    return { node: { kind: "text", type: "markdown", content: sanitizeDslContent(body) }, remainder };
  }
  if (cmd === "formula") {
    return { node: { kind: "formula", type: "equation", tex: body.trim() }, remainder };
  }
  if (cmd === "code") {
    const lang = extractNamedParam(body, "language");
    const codeVal = extractNamedParam(body, "code");
    return {
      node: {
        kind: "code",
        type: "code",
        language: lang ?? "text",
        code: codeVal ?? body,
      },
      remainder,
    };
  }
  if (cmd === "callout") {
    const titleVal = extractNamedParam(body, "title");
    const typeVal = extractNamedParam(body, "type");
    const contentVal = extractNamedParam(body, "content");
    return {
      node: {
        kind: "callout",
        type: "callout",
        title: titleVal,
        typeVariant: (typeVal ?? "info") as any,
        content: sanitizeDslContent(contentVal ?? body),
      },
      remainder,
    };
  }
  if (cmd === "video") {
    const urlVal = extractNamedParam(body, "url");
    const fileVal = extractNamedParam(body, "file");
    const typeVal = extractNamedParam(body, "type");
    const titleVal = extractNamedParam(body, "title");
    
    // Determine the actual URL based on video type
    let finalUrl = urlVal ?? body;
    if (typeVal === "upload" && fileVal) {
      finalUrl = fileVal;
    } else if (fileVal && !urlVal) {
      finalUrl = fileVal;
    }
    
    return {
      node: {
        kind: "video",
        type: "video",
        url: finalUrl,
        file: fileVal,
        title: titleVal,
        sourceType: typeVal,
      },
      remainder,
    };
  }
  if (cmd === "codinglab" || cmd === "coding-lab") {
    const titleVal = extractNamedParam(body, "title");
    const langVal = extractNamedParam(body, "language");
    const starterVal = extractNamedParam(body, "startercode");
    const instructionsVal = extractNamedParam(body, "instructions");
    return {
      node: {
        kind: "codinglab",
        type: "codinglab",
        title: titleVal ?? "Coding Lab",
        language: langVal ?? "python",
        starterCode: starterVal ?? "# Starter code\n",
        instructions: sanitizeDslContent(instructionsVal ?? ""),
      },
      remainder,
    };
  }

  if (cmd === "overviewmarkdown" || cmd === "overview") {
    const cleanContent = sanitizeDslContent(body);
    return { node: { kind: "text", type: "markdown", content: cleanContent }, remainder };
  }

  // Handle theory, objectives, examples, furtherreading, keytakeaways, summary & all standard learning section macros
  const titleVal = extractNamedParam(body, "title");
  const bodyVal = extractNamedParam(body, "body") ?? extractNamedParam(body, "content") ?? extractNamedParam(body, "items") ?? body;
  const cleanContent = sanitizeDslContent(bodyVal);

  const standardTitles = /^(Learning Objectives|Core Content|Examples|Further Reading|Summary|Common Mistakes|Best Practices|Real-World Analogy|Concept Explanation|Visual Diagram|Process Flowchart|Code Example|Execution Steps|Industry Notes|Key Takeaways|Learning Outcome|Case Study|References|Cheat Sheet)$/i;

  if (titleVal && !standardTitles.test(titleVal.trim())) {
    return {
      node: {
        kind: "callout",
        type: "callout",
        title: titleVal,
        typeVariant: "info" as any,
        content: cleanContent,
      },
      remainder,
    };
  }

  if (!cleanContent) {
    return { node: { kind: "text", type: "markdown", content: "" }, remainder };
  }

  return { node: { kind: "text", type: "markdown", content: cleanContent }, remainder };
}

export function isRichTextBlockType(type: string): boolean {
  return RICH_BODY_BLOCK_TYPES.includes(type as any);
}

export function extractRichTextFromContent(content: string): string {
  return content || "";
}

export function extractLessonBodyFromTex(tex: string): LessonDocument {
  const node = parseLessonTexCommand(tex);
  return node ? { nodes: [node.node] } : { nodes: [] };
}
