/**
 * Universal DSL Content Sanitizer — guarantees raw authoring syntax never reaches student UI.
 */

export function extractBraceValueAt(text: string, startBraceIndex: number): { value: string; endIndex: number } | null {
  if (text[startBraceIndex] !== "{") return null;
  let depth = 0;
  for (let i = startBraceIndex; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        return { value: text.substring(startBraceIndex + 1, i), endIndex: i };
      }
    }
  }
  return { value: text.substring(startBraceIndex + 1), endIndex: text.length - 1 };
}

export function extractNamedKey(body: string, key: string): string | undefined {
  const match = body.match(new RegExp(`${key}\\s*=\\s*\\{`, "i"));
  if (!match || match.index === undefined) return undefined;
  const startIdx = match.index + match[0].length - 1;
  const res = extractBraceValueAt(body, startIdx);
  return res ? res.value : undefined;
}

export function sanitizeDslContent(raw: string): string {
  if (!raw || typeof raw !== "string") return "";

  let text = raw;

  // 1. Convert {{Title},{Body}} and {{Title}}
  text = text.replace(/\{\{\s*([^{},\n]+)\s*\}\s*,\s*\{([\s\S]*?)\}\}/g, (_m, title, body) => {
    return `## ${title.trim()}\n\n${body.trim()}`;
  });
  text = text.replace(/\{\{\s*([^{}\n]+)\s*\}\}/g, (_m, title) => {
    return `## ${title.trim()}`;
  });

  // 2. Loop & replace top-level and nested TeX macros
  let iterations = 0;
  let prev = "";
  while (text !== prev && iterations < 50) {
    iterations++;
    prev = text;

    // Macro match: \cmdName={ or \ cmdName{ or \cmdName = {
    const macroMatch = text.match(/\\\s*([a-zA-Z0-9_-]+)\s*(?:=\s*)?\{/);
    if (macroMatch && macroMatch.index !== undefined) {
      const cmd = macroMatch[1].toLowerCase();
      const braceIdx = text.indexOf("{", macroMatch.index + macroMatch[0].length - 1);
      const braceRes = extractBraceValueAt(text, braceIdx);
      if (braceRes) {
        const macroBody = braceRes.value;
        let replacement = "";

        const titleVal = extractNamedKey(macroBody, "title");
        const bodyVal =
          extractNamedKey(macroBody, "body") ??
          extractNamedKey(macroBody, "content") ??
          extractNamedKey(macroBody, "message") ??
          extractNamedKey(macroBody, "items");

        if (titleVal && bodyVal) {
          if (cmd === "checkpoint") {
            replacement = `\n\n> **Checkpoint — ${titleVal}:** ${sanitizeDslContent(bodyVal)}\n\n`;
          } else if (cmd === "callout") {
            replacement = `\n\n> **${titleVal}:** ${sanitizeDslContent(bodyVal)}\n\n`;
          } else {
            replacement = `## ${titleVal}\n\n${sanitizeDslContent(bodyVal)}`;
          }
        } else if (bodyVal) {
          replacement = sanitizeDslContent(bodyVal);
        } else if (titleVal) {
          replacement = `## ${titleVal}`;
        } else {
          replacement = sanitizeDslContent(macroBody);
        }

        text = text.substring(0, macroMatch.index) + replacement + text.substring(braceRes.endIndex + 1);
      }
    }

    // Match title={Title},body={Body} key-value syntax
    const kvPairMatch = text.match(/title\s*=\s*\{([^{}]*)\}\s*,\s*(?:body|content|message|items)\s*=\s*\{([\s\S]*?)\}/i);
    if (kvPairMatch && kvPairMatch.index !== undefined) {
      const title = kvPairMatch[1].trim();
      const body = kvPairMatch[2].trim();
      const replacement = `## ${title}\n\n${sanitizeDslContent(body)}`;
      text = text.substring(0, kvPairMatch.index) + replacement + text.substring(kvPairMatch.index + kvPairMatch[0].length);
    }

    // Match individual key-value definitions like title={...}, body={...}
    const kvMatch = text.match(/(?:title|body|content|items|message)\s*=\s*\{/i);
    if (kvMatch && kvMatch.index !== undefined) {
      const braceIdx = text.indexOf("{", kvMatch.index + kvMatch[0].length - 1);
      const braceRes = extractBraceValueAt(text, braceIdx);
      if (braceRes) {
        const innerVal = sanitizeDslContent(braceRes.value);
        text = text.substring(0, kvMatch.index) + innerVal + text.substring(braceRes.endIndex + 1);
      }
    }
  }

  // 3. Strip unparsed macro-title concatenations & section prefixes like Notes (Detailed), \theoryProcess Flowchart, etc.
  text = text
    .replace(/\\theory[A-Za-z0-9_\s-]*,\s*/gi, "")
    .replace(/^(?:Notes|Revision)\s*\((?:Detailed|Summary)\)\s*,?\s*/gi, "")
    .replace(/^([A-Za-z0-9_\s-]+)\s*\((?:Detailed|Summary)\)\s*,\s*/gi, "");

  // 4. Unescape TeX characters and strip leftover authoring keywords / stray escapes / braces
  text = text
    .replace(/\\#\\#/g, "##")
    .replace(/\\#\\#\\#/g, "###")
    .replace(/\\#/g, "#")
    .replace(/\\&/g, "&")
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_")
    .replace(/\\}/g, "")
    .replace(/\\{/g, "")
    .replace(/\\\\/g, "\\")
    .replace(/\\(theory|overviewmarkdown|overview|callout|checkpoint|objectives|examples|video|body|title|content)[A-Za-z0-9_-]*/gi, "")
    .replace(/(?:title|body|content|items|message)\s*=\s*\{?/gi, "")
    .replace(/\}\s*\\$/g, "")
    .replace(/\}\s*\\(?=\n|$)/g, "")
    .replace(/\\$/gm, "")
    .replace(/\\(?=\s|$)/g, "")
    .replace(/^\s*\}\s*$/gm, "")
    .replace(/^[ \t]*[{}][ \t]*$/gm, "")
    .replace(/\s*\}\s*$/g, "")
    .replace(/^\s*=\s*/g, "") // Strip stray leading =
    .trim();

  // 5. Structure raw diagram DSL (flowchart TD, graph LR, etc.) into ```mermaid blocks if not already fenced
  if (!text.includes("```mermaid") && /^(flowchart\s+(TD|LR|TB|RL)|graph\s+(TD|LR|TB|RL)|sequenceDiagram|stateDiagram|classDiagram)/i.test(text.trim())) {
    text = `\`\`\`mermaid\n${text.trim()}\n\`\`\``;
  }

  // 6. Structure raw code fragments (// Domain fundamentals const ..., console.log ...) into ```typescript blocks if not already fenced
  if (!text.includes("```") && /^\/\/\s*|\bconst\s+\w+\s*=|\bconsole\.log\(|\bdef\s+\w+\(/i.test(text.trim())) {
    text = `\`\`\`typescript\n${text.trim()}\n\`\`\``;
  }

  return text;
}
