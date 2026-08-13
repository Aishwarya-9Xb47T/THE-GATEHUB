import { useSearchParams, Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { searchDocs } from "@/content/docs/docsManifest";
import { searchDocsApi } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Search, Sparkles } from "lucide-react";
import { openGateHubAssistant } from "@/assistant";
import { Button } from "@/components/ui/button";
import { DocsBreadcrumbs } from "@/components/help/DocsBreadcrumbs";
import { useUserStore } from "@/store/userStore";

interface SearchHit {
  key: string;
  title: string;
  sub: string;
  href: string;
}

export function HelpSearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const [input, setInput] = useState(q);
  const { user } = useUserStore();
  const [apiHits, setApiHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInput(q);
  }, [q]);

  useEffect(() => {
    const trimmed = input.trim();
    const timer = setTimeout(() => {
      if (q !== trimmed) {
        setParams(trimmed ? { q: trimmed } : {}, { replace: true });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [input, q, setParams]);

  const localResults = useMemo(() => searchDocs(q, user?.role as "student" | "instructor" | "admin" | undefined), [q, user?.role]);

  useEffect(() => {
    if (!q.trim()) {
      setApiHits([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await searchDocsApi(q);
      setApiHits(
        (res.data || []).map((r) => ({
          key: `${r.slug}-${r.section}`,
          title: `${r.manual} › ${r.section}`,
          sub: r.snippet,
          href: r.href || `/help/${r.slug}`,
        }))
      );
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const results: SearchHit[] = useMemo(() => {
    const merged: SearchHit[] = [...apiHits];
    for (const r of localResults) {
      const href = `/help/${r.page.slug}`;
      if (!merged.some((m) => m.href === href)) {
        merged.push({
          key: r.page.id,
          title: r.page.title,
          sub: r.snippet,
          href,
        });
      }
    }
    return merged;
  }, [apiHits, localResults]);

  return (
    <div className="help-home w-full max-w-2xl">
      <DocsBreadcrumbs />
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-2">Search Documentation</h1>
        <p className="text-muted-foreground text-sm">Instant hybrid search across manuals, guides, and FAQs.</p>
      </header>
      <div className="relative mb-8">
        <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9 h-11 rounded-xl border-border/80 bg-card/40"
          placeholder="How do I create a Learning Universe?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
        />
      </div>
      {loading && q && <p className="text-sm text-muted-foreground mb-4 animate-pulse">Searching…</p>}
      {q && !loading && results.length === 0 && (
        <div className="docs-feedback-card">
          <p className="text-muted-foreground">No results for &quot;{q}&quot;.</p>
          <Button variant="default" size="sm" onClick={() => openGateHubAssistant(q)}>
            <Sparkles className="w-4 h-4 mr-2" />
            Ask AI Assistant
          </Button>
        </div>
      )}
      <ul className="space-y-3">
        {results.map((hit) => (
          <li key={hit.key}>
            <Link to={hit.href} className="help-home__card block !p-4">
              <span className="help-home__card-title text-primary">{hit.title}</span>
              <p className="help-home__card-desc mt-1">{hit.sub}…</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
