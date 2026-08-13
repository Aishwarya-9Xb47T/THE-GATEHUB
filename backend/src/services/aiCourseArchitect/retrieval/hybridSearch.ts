/**
 * V6 Part 3 — Hybrid search engine (multi-provider, deduped, ranked).
 */
import type { RetrievalSource } from "./types.js";
import { searchSemanticScholar } from "./providers/semanticScholar.js";
import { searchCrossref } from "./providers/crossref.js";
import { searchOpenAlex } from "./providers/openAlex.js";
import { searchArxiv } from "./providers/arxiv.js";
import { searchWeb } from "./providers/webSearch.js";
import { searchGitHub } from "./providers/githubSearch.js";
import { scoreAndFilterSources } from "./sourceScoring.js";
import { hybridSimilarity } from "./embeddings.js";
import type { TopicAnalysis } from "./topicDetection.js";

async function searchBing(query: string, limit: number): Promise<RetrievalSource[]> {
  const key = process.env.BING_SEARCH_API_KEY;
  if (!key) return [];
  try {
    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${limit}`;
    const res = await fetch(url, {
      headers: { "Ocp-Apim-Subscription-Key": key },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      webPages?: { value?: Array<{ name?: string; url?: string; snippet?: string }> };
    };
    const now = new Date().toISOString();
    return (data.webPages?.value ?? []).map((r, i) => ({
      id: `bing-${i}`,
      title: r.name ?? query,
      url: r.url ?? "",
      snippet: (r.snippet ?? "").slice(0, 400),
      kind: "web-search" as const,
      authority: "industry" as const,
      relevanceScore: 0.58,
      authorityScore: 0.55,
      freshnessScore: 0.6,
      retrievedAt: now,
    }));
  } catch {
    return [];
  }
}

function dedupeSources(sources: RetrievalSource[]): RetrievalSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = (s.doi ?? s.url ?? s.title).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return Boolean(s.url && s.title);
  });
}

/** Priority: Semantic Scholar → academic APIs → Brave/Tavily/Google/Bing → GitHub */
export async function runHybridSearch(
  primaryQuery: string,
  analysis: TopicAnalysis,
  officialSources: RetrievalSource[]
): Promise<RetrievalSource[]> {
  const queries = [primaryQuery, ...analysis.academicQueries.slice(0, 1)];
  const q = queries[0];

  const [semantic, crossref, openAlex, arxiv, web, bing, github] = await Promise.all([
    searchSemanticScholar(q, 4),
    searchCrossref(q, 3),
    searchOpenAlex(q, 3),
    searchArxiv(q, 2),
    searchWeb(q, 4),
    searchBing(q, 3),
    analysis.programmingQueries.length ? searchGitHub(analysis.programmingQueries[0], 2) : Promise.resolve([]),
  ]);

  let merged = dedupeSources([...officialSources, ...semantic, ...crossref, ...openAlex, ...arxiv, ...web, ...bing, ...github]);

  // Re-rank with hybrid similarity
  const scored = await Promise.all(
    merged.map(async (s) => {
      const sim = await hybridSimilarity(primaryQuery, `${s.title} ${s.snippet}`);
      return { ...s, relevanceScore: Math.max(s.relevanceScore, sim) };
    })
  );

  return scoreAndFilterSources(scored);
}
