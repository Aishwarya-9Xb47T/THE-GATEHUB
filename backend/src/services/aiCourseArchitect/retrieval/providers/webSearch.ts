/**
 * External web search providers (Tavily, Brave, Google CSE).
 */
import type { RetrievalSource } from "../types.js";

async function searchTavily(query: string, limit: number): Promise<RetrievalSource[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, query, max_results: limit, include_answer: false }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
    };
    const now = new Date().toISOString();
    return (data.results ?? []).map((r, i) => ({
      id: `tavily-${i}`,
      title: r.title ?? query,
      url: r.url ?? "",
      snippet: (r.content ?? "").slice(0, 400),
      kind: "web-search" as const,
      authority: /learn\.microsoft|docs\.aws|cloud\.google|developer\.mozilla|docs\.python|pytorch\.org|tensorflow\.org|react\.dev|nodejs\.org/i.test(
        r.url ?? ""
      )
        ? ("official" as const)
        : ("industry" as const),
      relevanceScore: r.score ?? 0.65,
      authorityScore: 0.6,
      freshnessScore: 0.7,
      retrievedAt: now,
    }));
  } catch {
    return [];
  }
}

async function searchBrave(query: string, limit: number): Promise<RetrievalSource[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return [];
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": key },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };
    const now = new Date().toISOString();
    return (data.web?.results ?? []).map((r, i) => ({
      id: `brave-${i}`,
      title: r.title ?? query,
      url: r.url ?? "",
      snippet: (r.description ?? "").slice(0, 400),
      kind: "web-search" as const,
      authority: /learn\.microsoft|docs\.aws|developer\.mozilla/i.test(r.url ?? "") ? ("official" as const) : ("industry" as const),
      relevanceScore: 0.62,
      authorityScore: 0.58,
      freshnessScore: 0.65,
      retrievedAt: now,
    }));
  } catch {
    return [];
  }
}

async function searchGoogleCse(query: string, limit: number): Promise<RetrievalSource[]> {
  const key = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY ?? process.env.GOOGLE_CSE_ID;
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX ?? process.env.GOOGLE_CSE_ID;
  if (!key || !cx) return [];
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(query)}&num=${Math.min(limit, 10)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: Array<{ title?: string; link?: string; snippet?: string }>;
    };
    const now = new Date().toISOString();
    return (data.items ?? []).map((r, i) => ({
      id: `google-cse-${i}`,
      title: r.title ?? query,
      url: r.link ?? "",
      snippet: (r.snippet ?? "").slice(0, 400),
      kind: "web-search" as const,
      authority: "industry" as const,
      relevanceScore: 0.6,
      authorityScore: 0.55,
      freshnessScore: 0.6,
      retrievedAt: now,
    }));
  } catch {
    return [];
  }
}

export async function searchWeb(query: string, limit = 5): Promise<RetrievalSource[]> {
  const providers = await Promise.all([
    searchTavily(query, limit),
    searchBrave(query, limit),
    searchGoogleCse(query, limit),
  ]);
  const merged = providers.flat().filter((s) => s.url && !/example\.com/i.test(s.url));
  const seen = new Set<string>();
  return merged.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}
