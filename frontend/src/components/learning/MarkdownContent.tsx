import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { createLessonMarkdownComponents } from "./markdownComponents";

const lessonMarkdownComponents = createLessonMarkdownComponents();

import { sanitizeDslContent } from "@gatehub/lesson-body";

/** Reverse LaTeX escapes and strip raw authoring DSL commands from AI-generated course content before markdown render. */
export function prepareLessonMarkdown(text: string): string {
  let result = sanitizeDslContent(text || "")
    .replace(/\\&/g, "&")
    .replace(/\\#/g, "#")
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_")
    .replace(/\\\\/g, "\\")
    .replace(/^\s*=\s*/g, "")
    .replace(/^(?:Notes|Revision)\s*\((?:Detailed|Summary)\)\s*,?\s*/gi, "")
    .replace(/^([A-Za-z0-9_\s-]+)\s*\((?:Detailed|Summary)\)\s*,\s*/gi, "");

  // Turn bare URLs into markdown links (e.g. Further Reading lines).
  result = result.replace(/(^|[\s(])((https?:\/\/[^\s<>)\]]+))/gi, (full, prefix: string, url: string) => {
    if (full.includes("](")) return full;
    return `${prefix}[${url}](${url})`;
  });

  // Structure raw diagram DSL (flowchart TD, graph LR, etc.) into ```mermaid blocks if not already fenced
  if (!result.includes("```mermaid") && /^(flowchart\s+(TD|LR|TB|RL)|graph\s+(TD|LR|TB|RL)|sequenceDiagram|stateDiagram|classDiagram)/i.test(result.trim())) {
    result = `\`\`\`mermaid\n${result.trim()}\n\`\`\``;
  }

  // Structure raw code fragments (// Domain fundamentals const ..., console.log ...) into ```typescript blocks if not already fenced
  if (!result.includes("```") && /^\/\/\s*|\bconst\s+\w+\s*=|\bconsole\.log\(|\bdef\s+\w+\(/i.test(result.trim())) {
    result = `\`\`\`typescript\n${result.trim()}\n\`\`\``;
  }

  return result;
}

interface MarkdownContentProps {
  children: string;
  className?: string;
  /** Use on gold/primary backgrounds so text never inherits muted grey */
  variant?: "default" | "onPrimary";
}

export function MarkdownContent({ children, className, variant = "default" }: MarkdownContentProps) {
  const source = prepareLessonMarkdown(children);
  if (!source.trim()) return null;

  if (variant === "onPrimary") {
    return (
      <div className={cn("prose-on-primary", className)}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={lessonMarkdownComponents}>{source}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className={cn("prose-gatehub w-full max-w-none", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={lessonMarkdownComponents}>{source}</ReactMarkdown>
    </div>
  );
}
