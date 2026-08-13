/**
 * Crossref API — academic publication metadata.
 */
import type { RetrievalSource } from "../types.js";

export async function searchCrossref(query: string, limit = 3): Promise<RetrievalSource[]> {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query.slice(0, 120))}&rows=${limit}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      message?: { items?: Array<{
        DOI?: string;
        title?: string[];
        author?: Array<{ given?: string; family?: string }>;
        published?: { "date-parts"?: number[][] };
        URL?: string;
        abstract?: string;
      }> };
    };
    const items = data.message?.items ?? [];
    const now = new Date().toISOString();
    return items
      .filter((item) => item.title?.[0])
      .map((item, i) => {
        const title = item.title![0];
        const authors = (item.author ?? [])
          .map((a) => [a.given, a.family].filter(Boolean).join(" "))
          .filter(Boolean)
          .join(", ");
        const year = item.published?.["date-parts"]?.[0]?.[0];
        return {
          id: `crossref-${i}-${item.DOI ?? title.slice(0, 20)}`,
          title,
          url: item.URL ?? (item.DOI ? `https://doi.org/${item.DOI}` : ""),
          snippet: (item.abstract ?? `Academic publication: ${title}`).slice(0, 400),
          kind: "crossref" as const,
          authority: "academic" as const,
          authors: authors || undefined,
          year,
          doi: item.DOI,
          relevanceScore: 0.75,
          authorityScore: 0.85,
          freshnessScore: year ? Math.min(1, (year - 1990) / 35) : 0.5,
          retrievedAt: now,
        };
      });
  } catch {
    return [];
  }
}
