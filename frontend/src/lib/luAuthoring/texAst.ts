/**
 * Parse and patch LU component .tex — LaTeX is the source of truth.
 * Visual panel and Monaco share one file via AST round-trips (never full regeneration).
 */

import type { LuLessonComponentKind } from "./componentRegistry";
import { KIND_TO_TEX_CMD } from "./componentRegistry";

export function escLatex(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/#/g, "\\#")
    .replace(/%/g, "\\%")
    .replace(/&/g, "\\&")
    .replace(/_/g, "\\_")
    .replace(/}/g, "\\}");
}

export function unescLatex(s: string): string {
  return s
    .replace(/\\%/g, "%")
    .replace(/\\#/g, "#")
    .replace(/\\&/g, "&")
    .replace(/\\_/g, "_")
    .replace(/\\\\/g, "\\");
}

/** Extract the first `\command{...}` block with balanced braces. */
export function extractFirstBraceBlock(content: string, command: string): string | null {
  const re = new RegExp(`\\\\${command}\\s*\\{`);
  const idx = content.search(re);
  if (idx < 0) return null;
  let depth = 0;
  for (let i = idx; i < content.length; i++) {
    if (content[i] === "{") depth++;
    else if (content[i] === "}") {
      depth--;
      if (depth === 0) return content.slice(idx, i + 1);
    }
  }
  return null;
}

/** Inner text of `\command{inner}` (one brace level). */
export function extractCommandInner(content: string, command: string): string | null {
  const block = extractFirstBraceBlock(content, command);
  if (!block) return null;
  const open = block.indexOf("{");
  if (open < 0) return null;
  return block.slice(open + 1, -1);
}

/** Parse `key={value}` pairs inside a command block (values may contain nested `{`). */
export function parseKeyValueBlock(inner: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < inner.length) {
    const keyMatch = inner.slice(i).match(/^\s*([a-zA-Z]+)\s*=\s*\{/);
    if (!keyMatch) break;
    const key = keyMatch[1];
    i += keyMatch.index! + keyMatch[0].length;
    let depth = 1;
    const start = i;
    while (i < inner.length && depth > 0) {
      if (inner[i] === "{") depth++;
      else if (inner[i] === "}") depth--;
      i++;
    }
    const raw = inner.slice(start, i - 1);
    out[key] = unescLatex(raw);
  }
  return out;
}

function replaceCommandBlock(content: string, command: string, newBlock: string): string {
  const existing = extractFirstBraceBlock(content, command);
  if (!existing) {
    const trimmed = content.trim();
    return trimmed ? `${trimmed}\n\n${newBlock}\n` : `${newBlock}\n`;
  }
  return content.replace(existing, newBlock);
}

export function parseConfigFromTex(kind: LuLessonComponentKind, tex: string): Record<string, unknown> {
  const cmd = KIND_TO_TEX_CMD[kind];
  switch (kind) {
    case "overview": {
      const inner = extractCommandInner(tex, cmd);
      return { body: inner != null ? unescLatex(inner.trim()) : "" };
    }
    case "objectives": {
      const inner = extractCommandInner(tex, cmd);
      if (!inner) return { items: [] };
      const kv = parseKeyValueBlock(inner);
      const body = kv.body ?? "";
      const items = body
        .split("\n")
        .map((l) => l.replace(/^\d+\.\s*/, "").trim())
        .filter(Boolean);
      return { items };
    }
    case "topics":
    case "examples": {
      const inner = extractCommandInner(tex, cmd);
      if (!inner) return { title: "", body: "" };
      const kv = parseKeyValueBlock(inner);
      return { title: kv.title ?? "", body: kv.body ?? "" };
    }
    case "practice": {
      const inner = extractCommandInner(tex, cmd);
      if (!inner) return {};
      const kv = parseKeyValueBlock(inner);
      return {
        language: kv.language ?? "python",
        starterCode: kv.startercode ?? "",
        expectedOutput: kv.expectedoutput ?? "",
      };
    }
    case "coding-lab": {
      const inner = extractCommandInner(tex, cmd);
      if (!inner) return {};
      const kv = parseKeyValueBlock(inner);
      return {
        language: kv.language ?? "python",
        starterCode: kv.startercode ?? "",
        timeLimitMs: Number(kv.timeLimitMs ?? kv.timelimitms ?? 5000),
      };
    }
    case "video": {
      const inner = extractCommandInner(tex, cmd);
      if (!inner) return {};
      const kv = parseKeyValueBlock(inner);
      const type = kv.type ?? kv.sourcetype ?? "upload";
      return {
        title: kv.title ?? "",
        type,
        sourceType: type,
        url: kv.url ?? "",
        file: kv.file ?? "",
      };
    }
    case "discussion":
    case "reflection": {
      const inner = extractCommandInner(tex, cmd);
      if (!inner) return { prompt: "" };
      const kv = parseKeyValueBlock(inner);
      return { prompt: kv.prompt ?? "" };
    }
    case "assignment": {
      const inner = extractCommandInner(tex, cmd);
      if (!inner) return {};
      const kv = parseKeyValueBlock(inner);
      return {
        dueDate: kv.duedate ?? "",
        points: Number(kv.points ?? 100),
        instructions: kv.instructions ?? "",
      };
    }
    case "checkpoint": {
      const inner = extractCommandInner(tex, cmd);
      if (!inner) return {};
      const kv = parseKeyValueBlock(inner);
      return { title: kv.title ?? "", message: kv.message ?? "" };
    }
    case "project": {
      const inner = extractCommandInner(tex, cmd);
      if (!inner) return {};
      const kv = parseKeyValueBlock(inner);
      return {
        introduction: kv.description ?? "",
        difficulty: kv.difficulty ?? "intermediate",
        estimatedHours: Number(kv.estimatedHours ?? kv.estimatedhours ?? 4),
        instructions: kv.instructions ?? "",
      };
    }
    case "research-paper": {
      const inner = extractCommandInner(tex, cmd);
      if (!inner) return {};
      const kv = parseKeyValueBlock(inner);
      return {
        title: kv.title ?? "",
        paperType: kv.paperType ?? kv.papertype ?? "research",
        abstract: kv.abstract ?? "",
      };
    }
    default:
      return {};
  }
}

export function patchTexFromConfig(
  kind: LuLessonComponentKind,
  tex: string,
  config: Record<string, unknown>,
  title = ""
): string {
  const cmd = KIND_TO_TEX_CMD[kind];
  switch (kind) {
    case "overview": {
      const body = String(config.body ?? "");
      const block = `\\overviewmarkdown{\n${escLatex(body)}\n}`;
      return replaceCommandBlock(tex, cmd, block);
    }
    case "objectives": {
      const items = (config.items as string[]) ?? [];
      const body =
        items.length > 0
          ? `By the end of this lesson you will be able to:\n${items.map((item, idx) => `${idx + 1}. ${item}`).join("\n")}`
          : "Add learning objectives here.";
      const block = `\\theory{title={Learning Objectives},body={${escLatex(body)}\n}}`;
      return replaceCommandBlock(tex, cmd, block);
    }
    case "topics":
    case "examples": {
      const t = String(config.title ?? title);
      const body = String(config.body ?? "");
      const block = `\\theory{title={${escLatex(t)}},body={\n${escLatex(body)}\n}}`;
      return replaceCommandBlock(tex, cmd, block);
    }
    case "practice": {
      const block = `\\practice{
language={${escLatex(String(config.language ?? "python"))}},
startercode={
${String(config.starterCode ?? "")}
},
expectedoutput={${escLatex(String(config.expectedOutput ?? ""))}}
}`;
      return replaceCommandBlock(tex, cmd, block);
    }
    case "coding-lab": {
      const block = `\\codinglab{
title={${escLatex(title)}},
language={${escLatex(String(config.language ?? "python"))}},
startercode={
${String(config.starterCode ?? "")}
},
timeLimitMs={${Number(config.timeLimitMs ?? 5000)}}
}`;
      return replaceCommandBlock(tex, cmd, block);
    }
    case "video": {
      const type = String(config.type ?? config.sourceType ?? "upload");
      const url = String(config.url ?? "");
      const file = String(config.file ?? "");
      const videoTitle = String(config.title ?? title);
      const block =
        type === "youtube" || type === "embed"
          ? `\\video{
type={youtube},
url={${escLatex(url)}},
title={${escLatex(videoTitle)}}
}`
          : `\\video{
type={upload},
file={${escLatex(file)}},
title={${escLatex(videoTitle)}}
}`;
      return replaceCommandBlock(tex, cmd, block);
    }
    case "discussion": {
      const block = `\\discussion{prompt={${escLatex(String(config.prompt ?? ""))}}}`;
      return replaceCommandBlock(tex, cmd, block);
    }
    case "reflection": {
      const block = `\\reflection{prompt={${escLatex(String(config.prompt ?? ""))}}}`;
      return replaceCommandBlock(tex, cmd, block);
    }
    case "assignment": {
      const block = `\\assignment{
title={${escLatex(title)}},
duedate={${escLatex(String(config.dueDate ?? ""))}},
points={${Number(config.points ?? 100)}},
instructions={${escLatex(String(config.instructions ?? ""))}}
}`;
      return replaceCommandBlock(tex, cmd, block);
    }
    case "checkpoint": {
      const block = `\\checkpoint{title={${escLatex(String(config.title ?? "Lesson complete"))}},message={${escLatex(String(config.message ?? ""))}}}`;
      return replaceCommandBlock(tex, cmd, block);
    }
    case "project": {
      const block = `\\project{
title={${escLatex(title)}},
description={${escLatex(String(config.introduction ?? ""))}},
difficulty={${escLatex(String(config.difficulty ?? "intermediate"))}},
estimatedHours={${Number(config.estimatedHours ?? 4)}},
instructions={${escLatex(String(config.instructions ?? ""))}}
}`;
      return replaceCommandBlock(tex, cmd, block);
    }
    case "research-paper": {
      const block = `\\researchpaper{
title={${escLatex(String(config.title ?? title))}},
paperType={${escLatex(String(config.paperType ?? "research"))}},
abstract={${escLatex(String(config.abstract ?? ""))}}
}`;
      return replaceCommandBlock(tex, cmd, block);
    }
    default:
      return tex;
  }
}
