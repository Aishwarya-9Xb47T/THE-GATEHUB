import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, FileText, Search, Sparkles } from "lucide-react";
import { DOC_PAGES, searchDocs } from "@/content/docs/docsManifest";
import { searchDocsApi } from "@/lib/api";
import { openGateHubAssistant } from "@/assistant";
import { cn } from "@/lib/utils";

interface DocsCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocsCommandPalette({ open, onOpenChange }: DocsCommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [apiResults, setApiResults] = useState<
    Array<{ manual: string; section: string; snippet: string; href: string }>
  >([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const localResults = useMemo(() => searchDocs(query).slice(0, 6), [query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setApiResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await searchDocsApi(query);
      if (res.data) {
        setApiResults(
          res.data.slice(0, 8).map((r) => ({
            manual: r.manual,
            section: r.section,
            snippet: r.snippet,
            href: `/help/${r.slug}#${r.sectionId || ""}`,
          }))
        );
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const items = useMemo(() => {
    if (!query.trim()) {
      return DOC_PAGES.slice(0, 8).map((p) => ({
        type: "page" as const,
        label: p.title,
        sub: p.description,
        href: `/help/${p.slug}`,
      }));
    }
    const fromApi = apiResults.map((r) => ({
      type: "section" as const,
      label: `${r.manual} › ${r.section}`,
      sub: r.snippet,
      href: r.href,
    }));
    const fromLocal = localResults.map((r) => ({
      type: "section" as const,
      label: r.page.title,
      sub: r.snippet,
      href: `/help/${r.page.slug}`,
    }));
    const merged = [...fromApi];
    for (const l of fromLocal) {
      if (!merged.some((m) => m.href === l.href)) merged.push(l);
    }
    return merged.slice(0, 10);
  }, [query, apiResults, localResults]);

  const go = useCallback(
    (href: string) => {
      onOpenChange(false);
      navigate(href);
    },
    [navigate, onOpenChange]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, items.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && items[active]) {
        e.preventDefault();
        go(items[active].href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items, active, go, onOpenChange]);

  useEffect(() => {
    const onGlobal = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onGlobal);
    return () => window.removeEventListener("keydown", onGlobal);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="docs-command-palette" role="dialog" aria-modal="true" aria-label="Search documentation">
      <button type="button" className="docs-command-palette__backdrop" onClick={() => onOpenChange(false)} aria-label="Close" />
      <div className="docs-command-palette__panel">
        <div className="flex items-center gap-2 px-4 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 h-12 bg-transparent outline-none text-sm"
            placeholder="Search docs or ask a question…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          <kbd className="hidden sm:inline text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <ul className="max-h-[min(360px,50vh)] overflow-y-auto py-2">
          {items.map((item, i) => (
            <li key={`${item.href}-${i}`}>
              <button
                type="button"
                className={cn(
                  "w-full text-left px-4 py-2.5 flex gap-3 items-start",
                  i === active && "bg-muted/60"
                )}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item.href)}
              >
                {item.type === "section" ? (
                  <FileText className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                ) : (
                  <BookOpen className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">{item.label}</span>
                  <span className="block text-xs text-muted-foreground line-clamp-1">{item.sub}</span>
                </span>
              </button>
            </li>
          ))}
          {query.trim() && (
            <li>
              <button
                type="button"
                className="w-full text-left px-4 py-2.5 flex gap-3 items-center text-primary hover:bg-muted/60"
                onClick={() => {
                  onOpenChange(false);
                  openGateHubAssistant(query);
                }}
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span className="text-sm">Ask AI: &quot;{query}&quot;</span>
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
