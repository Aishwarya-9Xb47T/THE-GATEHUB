/**
 * Semantic Scholar API provider.
 */
import type { RetrievalSource } from "../types.js";

export async function searchSemanticScholar(query: string, limit = 3): Promise<RetrievalSource[]> {
  const q = encodeURIComponent(query.slice(0, 200));
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${q}&limit=${limit}&fields=title,authors,year,externalIds,abstract,url`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: Array<{
        title?: string;
        year?: number;
        abstract?: string;
        url?: string;
        authors?: Array<{ name?: string }>;
        externalIds?: { DOI?: string };
      }>;
    };
    const now = new Date().toISOString();
    return (data.data ?? [])
      .filter((hit) => hit.title)
      .map((hit, i) => ({
        id: `s2-${i}-${hit.title!.slice(0, 24)}`,
        title: hit.title!,
        url: hit.url ?? (hit.externalIds?.DOI ? `https://doi.org/${hit.externalIds.DOI}` : ""),
        snippet: (hit.abstract ?? hit.title!).slice(0, 400),
        kind: "semantic-scholar" as const,
        authority: "academic" as const,
        authors: (hit.authors ?? []).map((a) => a.name).filter(Boolean).join(", ") || undefined,
        year: hit.year,
        doi: hit.externalIds?.DOI,
        relevanceScore: 0.78,
        authorityScore: 0.8,
        freshnessScore: hit.year ? Math.min(1, (hit.year - 1990) / 35) : 0.5,
        retrievedAt: now,
      }));
  } catch {
    return [];
  }
}
