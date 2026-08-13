import { useState } from "react";
import {
  Bookmark,
  Check,
  Clock,
  Copy,
  Link2,
  Printer,
  Share2,
  Tag,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { estimateReadingMinutes, getDocMeta, type DocPage } from "@/content/docs/docsManifest";
import { cn } from "@/lib/utils";

interface DocsArticleHeaderProps {
  page: DocPage;
  className?: string;
}

export function DocsArticleHeader({ page, className }: DocsArticleHeaderProps) {
  const meta = getDocMeta(page);
  const readMin = estimateReadingMinutes(page.content);
  const [copied, setCopied] = useState(false);
  const [bookmarked, setBookmarked] = useState(() => {
    try {
      return localStorage.getItem(`docs-bookmark-${page.slug}`) === "1";
    } catch {
      return false;
    }
  });

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const toggleBookmark = () => {
    const next = !bookmarked;
    setBookmarked(next);
    try {
      if (next) localStorage.setItem(`docs-bookmark-${page.slug}`, "1");
      else localStorage.removeItem(`docs-bookmark-${page.slug}`);
    } catch {
      /* ignore */
    }
  };

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: page.title, text: page.description, url });
    } else {
      await copyLink();
    }
  };

  const print = () => window.print();

  const difficultyClass =
    meta.difficulty === "Advanced"
      ? "docs-badge--advanced"
      : meta.difficulty === "Intermediate"
        ? "docs-badge--intermediate"
        : "docs-badge--beginner";

  return (
    <header className={cn("docs-article-header", className)}>
      <div className="docs-article-header__glow" aria-hidden />

      <div className="docs-article-header__badges">
        <span className="docs-badge docs-badge--category">
          <Tag className="w-3 h-3" />
          {meta.category}
        </span>
        <span className={cn("docs-badge", difficultyClass)}>{meta.difficulty}</span>
        <span className="docs-badge docs-badge--muted">v{meta.version}</span>
      </div>

      <h1 className="docs-article-header__title">{page.title}</h1>
      <p className="docs-article-header__description">{page.description}</p>

      <div className="docs-article-header__meta">
        <span className="docs-article-header__meta-item">
          <User className="w-3.5 h-3.5" />
          {meta.author}
        </span>
        <span className="docs-article-header__meta-item">
          <Clock className="w-3.5 h-3.5" />
          {readMin} min read
        </span>
        <span className="docs-article-header__meta-item docs-article-header__meta-item--muted">
          Updated {meta.lastUpdated}
        </span>
      </div>

      <div className="docs-article-header__actions">
        <Button variant="outline" size="sm" className="docs-action-btn" onClick={share}>
          <Share2 className="w-3.5 h-3.5" />
          Share
        </Button>
        <Button variant="outline" size="sm" className="docs-action-btn" onClick={print}>
          <Printer className="w-3.5 h-3.5" />
          Print
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={cn("docs-action-btn", bookmarked && "docs-action-btn--active")}
          onClick={toggleBookmark}
        >
          <Bookmark className={cn("w-3.5 h-3.5", bookmarked && "fill-current")} />
          {bookmarked ? "Saved" : "Save"}
        </Button>
        <Button variant="outline" size="sm" className="docs-action-btn" onClick={copyLink}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </header>
  );
}
