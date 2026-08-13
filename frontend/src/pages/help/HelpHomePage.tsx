import { Link } from "react-router-dom";
import { HelpCircle, Search, Sparkles } from "lucide-react";
import { DOC_PAGES } from "@/content/docs/docsManifest";
import { openGateHubAssistant } from "@/assistant";
import { Button } from "@/components/ui/button";
import { DocsBreadcrumbs } from "@/components/help/DocsBreadcrumbs";
import { getDocIcon } from "@/components/help/docsNavIcons";
import { cn } from "@/lib/utils";

const FEATURED = [
  { slug: "getting-started", color: "text-primary", bg: "bg-primary/10" },
  { slug: "learning-universe", color: "text-blue-500", bg: "bg-blue-500/10" },
  { slug: "coding-lab", color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { slug: "research", color: "text-violet-500", bg: "bg-violet-500/10" },
  { slug: "integrations", color: "text-amber-500", bg: "bg-amber-500/10" },
  { slug: "ai-assistant", color: "text-rose-500", bg: "bg-rose-500/10" },
] as const;

export function HelpHomePage() {
  const pages = DOC_PAGES;

  return (
    <div className="help-home">
      <DocsBreadcrumbs />

      <header className="help-home__hero">
        <div className="help-home__hero-glow" aria-hidden />
        <h1 className="help-home__title">Documentation</h1>
        <p className="help-home__subtitle">
          Guides and manuals for students, instructors, and administrators. Search instantly or ask the AI assistant.
        </p>
        <div className="help-home__actions">
          <Button asChild>
            <Link to="/help/search">
              <Search className="w-4 h-4 mr-2" />
              Search documentation
            </Link>
          </Button>
          <Button variant="outline" onClick={() => openGateHubAssistant()}>
            <Sparkles className="w-4 h-4 mr-2" />
            Ask AI Assistant
          </Button>
        </div>
        <div className="help-home__stats">
          <div>
            <div className="help-home__stat-value">{pages.length}</div>
            <div className="help-home__stat-label">Guides & manuals</div>
          </div>
          <div>
            <div className="help-home__stat-value">⌘K</div>
            <div className="help-home__stat-label">Instant search</div>
          </div>
          <div>
            <div className="help-home__stat-value">AI</div>
            <div className="help-home__stat-label">Context-aware help</div>
          </div>
        </div>
      </header>

      <section className="mb-12">
        <h2 className="help-home__section-title">Start here</h2>
        <div className="help-home__grid">
          {FEATURED.map(({ slug, color, bg }) => {
            const page = pages.find((p) => p.slug === slug);
            if (!page) return null;
            const Icon = getDocIcon(slug);
            return (
              <Link key={slug} to={`/help/${slug}`} className="help-home__card">
                <div className={cn("help-home__card-icon", bg)}>
                  <Icon className={cn("w-5 h-5", color)} />
                </div>
                <h3 className="help-home__card-title">{page.title}</h3>
                <p className="help-home__card-desc">{page.description}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="help-home__section-title">All documentation</h2>
        <div className="help-home__list">
          {pages.map((p) => {
            const Icon = getDocIcon(p.slug);
            return (
              <Link key={p.id} to={`/help/${p.slug}`} className="help-home__list-item">
                <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-sm block">{p.title}</span>
                  <span className="text-xs text-muted-foreground truncate block">{p.description}</span>
                </div>
                <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
