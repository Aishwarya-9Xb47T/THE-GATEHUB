import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, ChevronDown, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openGateHubAssistant } from "@/assistant";
import { getAdjacentPages, parseToc, type DocPage } from "@/content/docs/docsManifest";
import { renderDocMarkdown } from "@/lib/docsRenderer";
import { cn } from "@/lib/utils";
import { DocsArticleHeader } from "./DocsArticleHeader";

interface DocsReaderProps {
  page: DocPage;
  basePath?: string;
}

export function DocsReader({ page, basePath = "/help" }: DocsReaderProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const toc = parseToc(page.content);
  const { prev, next } = getAdjacentPages(page.slug);
  const html = renderDocMarkdown(page.content);

  useEffect(() => {
    if (!contentRef.current) return;
    contentRef.current.querySelectorAll("pre").forEach((pre) => {
      if (pre.querySelector(".docs-copy-btn")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "docs-copy-btn";
      btn.textContent = "Copy";
      btn.onclick = () => {
        const code = pre.querySelector("code")?.textContent || "";
        navigator.clipboard.writeText(code);
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Copy"; }, 1500);
      };
      pre.appendChild(btn);
    });
  }, [html]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileTocOpen(false);
  };

  return (
    <article className="docs-article">
      <DocsArticleHeader page={page} />

      {/* Mobile TOC */}
      {toc.length > 0 && (
        <div className="docs-mobile-toc xl:hidden">
          <button
            type="button"
            className="docs-mobile-toc__trigger"
            onClick={() => setMobileTocOpen((v) => !v)}
          >
            <span>Jump to section</span>
            <ChevronDown className={cn("w-4 h-4 transition-transform", mobileTocOpen && "rotate-180")} />
          </button>
          {mobileTocOpen && (
            <ul className="docs-mobile-toc__list">
              {toc.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => scrollTo(item.id)} className={item.level === 3 ? "pl-4" : ""}>
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div
        ref={contentRef}
        className="docs-article__body"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* Prev / Next */}
      <nav className="docs-pager" aria-label="Article navigation">
        {prev ? (
          <Link to={`${basePath}/${prev.slug}`} className="docs-pager__card docs-pager__card--prev">
            <span className="docs-pager__label">
              <ChevronLeft className="w-4 h-4" /> Previous
            </span>
            <span className="docs-pager__title">{prev.title}</span>
          </Link>
        ) : (
          <div />
        )}
        {next ? (
          <Link to={`${basePath}/${next.slug}`} className="docs-pager__card docs-pager__card--next">
            <span className="docs-pager__label">
              Next <ChevronRight className="w-4 h-4" />
            </span>
            <span className="docs-pager__title">{next.title}</span>
          </Link>
        ) : null}
      </nav>

      {/* Feedback */}
      <footer className="docs-feedback-card">
        <div className="docs-feedback-card__content">
          <h2 className="docs-feedback-card__title">Was this article helpful?</h2>
          <p className="docs-feedback-card__desc">Your feedback helps us improve THE GATEHUB documentation.</p>
        </div>
        <div className="docs-feedback-card__actions">
          <Button
            variant={feedback === "up" ? "default" : "outline"}
            size="sm"
            onClick={() => setFeedback("up")}
          >
            <ThumbsUp className="w-4 h-4 mr-1.5" />
            Yes
          </Button>
          <Button
            variant={feedback === "down" ? "default" : "outline"}
            size="sm"
            onClick={() => setFeedback("down")}
          >
            <ThumbsDown className="w-4 h-4 mr-1.5" />
            No
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-primary"
            onClick={() => openGateHubAssistant(`Help me understand ${page.title}`)}
          >
            <Sparkles className="w-4 h-4 mr-1.5" />
            Ask AI
          </Button>
        </div>
        {feedback && (
          <p className="docs-feedback-card__thanks">Thank you for your feedback!</p>
        )}
      </footer>
    </article>
  );
}
