import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Lightbulb,
  MessageCircleQuestion,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { openGateHubAssistant } from "@/assistant";
import {
  estimateReadingMinutes,
  getDocMeta,
  getRelatedPages,
  parseToc,
  type DocPage,
} from "@/content/docs/docsManifest";
import { cn } from "@/lib/utils";
import { useDocsReadingProgress } from "./useDocsReadingProgress";

interface DocsRightPanelProps {
  page: DocPage;
  pdfSlug?: string;
  basePath?: string;
  onDownloadPdf?: () => void;
}

const AI_PROMPTS = [
  { label: "Summarize this article", icon: Wand2 },
  { label: "Explain simply", icon: Lightbulb },
  { label: "Give examples", icon: MessageCircleQuestion },
  { label: "Troubleshoot this topic", icon: Sparkles },
] as const;

export function DocsRightPanel({ page, pdfSlug, basePath = "/help", onDownloadPdf }: DocsRightPanelProps) {
  const toc = parseToc(page.content);
  const related = getRelatedPages(page.slug, 4);
  const meta = getDocMeta(page);
  const readMin = estimateReadingMinutes(page.content);
  const progress = useDocsReadingProgress(true);
  const [activeId, setActiveId] = useState<string | null>(toc[0]?.id ?? null);

  useEffect(() => {
    const headings = toc.map((t) => document.getElementById(t.id)).filter(Boolean) as HTMLElement[];
    if (!headings.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: [0, 0.25, 0.5, 1] },
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [toc, page.slug]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  };

  const askAi = (prompt: string) => {
    openGateHubAssistant(`${prompt} — regarding "${page.title}"`);
  };

  return (
    <aside data-floating-obstacle="docs-toc" className="docs-right-panel hidden xl:block">
      <div className="docs-right-panel__inner">
        {/* Reading progress */}
        <div className="docs-right-card">
          <div className="docs-right-card__header">
            <span className="docs-right-card__title">Reading progress</span>
            <span className="docs-right-card__value">{Math.round(progress)}%</span>
          </div>
          <div className="docs-progress-track">
            <div className="docs-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="docs-right-card__footer">
            <Clock className="w-3.5 h-3.5" />
            <span>{readMin} min · Updated {meta.lastUpdated}</span>
          </div>
        </div>

        {/* TOC with scroll spy */}
        {toc.length > 0 && (
          <nav className="docs-right-card" aria-label="On this page">
            <p className="docs-right-card__title mb-3">On this page</p>
            <ul className="docs-toc-list">
              {toc.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => scrollTo(item.id)}
                    className={cn(
                      "docs-toc-link",
                      item.level === 3 && "docs-toc-link--nested",
                      activeId === item.id && "docs-toc-link--active",
                    )}
                  >
                    {activeId === item.id && <span className="docs-toc-link__dot" />}
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* AI */}
        <div className="docs-right-card docs-right-card--ai">
          <div className="docs-right-card__ai-header">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="docs-right-card__title">Ask AI about this</span>
          </div>
          <Button
            className="w-full mb-3"
            size="sm"
            onClick={() => askAi("Explain this article")}
          >
            Ask AI Assistant
          </Button>
          <div className="docs-ai-prompts">
            {AI_PROMPTS.map(({ label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                className="docs-ai-prompt"
                onClick={() => askAi(label)}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Downloads */}
        {(pdfSlug || onDownloadPdf) && (
          <div className="docs-right-card">
            <p className="docs-right-card__title mb-3">Downloads</p>
            <div className="space-y-2">
              {pdfSlug && (
                <Link to={`${basePath}/pdf/${pdfSlug}`} className="docs-right-link">
                  <FileText className="w-4 h-4" />
                  View PDF
                  <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                </Link>
              )}
              {onDownloadPdf && (
                <button type="button" onClick={onDownloadPdf} className="docs-right-link w-full">
                  <Download className="w-4 h-4" />
                  Download PDF
                  <ExternalLink className="w-3.5 h-3.5 ml-auto" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Related */}
        {related.length > 0 && (
          <div className="docs-right-card">
            <p className="docs-right-card__title mb-3">Related guides</p>
            <ul className="space-y-2">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link to={`${basePath}/${r.slug}`} className="docs-related-link">
                    <span className="docs-related-link__title">{r.title}</span>
                    <span className="docs-related-link__desc">{r.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Rate */}
        <div className="docs-right-card docs-right-card--muted">
          <p className="docs-right-card__title mb-2">Rate this article</p>
          <p className="text-xs text-muted-foreground mb-3">Help us improve this guide.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 h-8 text-xs">
              Helpful
            </Button>
            <Button variant="ghost" size="sm" className="flex-1 h-8 text-xs" onClick={() => askAi("This article didn't answer my question")}>
              Not really
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** @deprecated Use DocsRightPanel */
export const DocsTOC = DocsRightPanel;
