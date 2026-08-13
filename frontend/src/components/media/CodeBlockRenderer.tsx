import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import hljs from "highlight.js/lib/core";
import java from "highlight.js/lib/languages/java";
import python from "highlight.js/lib/languages/python";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import sql from "highlight.js/lib/languages/sql";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { codeLanguageLabel } from "./codeBlockLanguages";
import "highlight.js/styles/github.css";

hljs.registerLanguage("java", java);
hljs.registerLanguage("python", python);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);

export interface CodeBlockRendererProps {
  content: string;
  language?: string;
  readOnly?: boolean;
  editable?: boolean;
  onChange?: (content: string) => void;
  showLineNumbers?: boolean;
  collapsible?: boolean;
  className?: string;
}

function highlightCode(source: string, language?: string): string {
  const trimmed = source.replace(/\n$/, "");
  if (!trimmed) return "";
  try {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(trimmed, { language }).value;
    }
    return hljs.highlightAuto(trimmed).value;
  } catch {
    return hljs.highlightAuto(trimmed).value;
  }
}

export function CodeBlockRenderer({
  content,
  language,
  readOnly = true,
  editable = false,
  onChange,
  showLineNumbers = true,
  collapsible = true,
  className,
}: CodeBlockRendererProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lines = useMemo(() => content.split("\n"), [content]);
  const highlighted = useMemo(() => highlightCode(content, language), [content, language]);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = `${content.slice(0, start)}  ${content.slice(end)}`;
    onChange?.(next);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 2;
    });
  };

  return (
    <div
      className={cn(
        "code-block-renderer w-full rounded-xl border border-border/60 bg-zinc-950 text-zinc-100 shadow-sm dark:border-white/10",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-zinc-900/80 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
          <span className="rounded-md bg-white/10 px-2 py-0.5">{codeLanguageLabel(language)}</span>
          {collapsible && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-200"
              onClick={() => setCollapsed((v) => !v)}
            >
              {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              {collapsed ? "Expand" : "Collapse"}
            </button>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-zinc-300 hover:bg-white/10 hover:text-white"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      {!collapsed && (
        <div className="w-full overflow-x-auto">
          {editable && !readOnly ? (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => onChange?.(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              className="min-h-[8rem] w-full resize-y bg-transparent p-3 font-mono text-sm leading-6 text-zinc-100 outline-none"
            />
          ) : (
            <div className="flex w-max min-w-full">
              {showLineNumbers && (
                <pre className="shrink-0 select-none border-r border-white/10 bg-zinc-900/50 px-3 py-3 text-right font-mono text-xs leading-6 text-zinc-500">
                  {lines.map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </pre>
              )}
              <pre className="hljs min-w-0 flex-1 whitespace-pre p-3 font-mono text-sm leading-6">
                <code
                  className={cn(language && `language-${language}`, "whitespace-pre")}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(highlighted) }}
                />
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Extract language + source from react-markdown fenced code children. */
export function parseMarkdownCodeChildren(children: ReactNode): { language?: string; content: string } {
  if (!children || typeof children !== "object") {
    return { content: String(children ?? "") };
  }
  const child = children as ReactElement<{ className?: string; children?: ReactNode }>;
  const className = child.props?.className || "";
  const language = className.replace("language-", "").trim() || undefined;
  const content = String(child.props?.children ?? "").replace(/\n$/, "");
  return { language, content };
}
