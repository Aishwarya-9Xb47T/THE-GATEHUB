/**
 * OpenAlex API — scholarly works metadata.
 */
import type { RetrievalSource } from "../types.js";

export async function searchOpenAlex(query: string, limit = 3): Promise<RetrievalSource[]> {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query.slice(0, 120))}&per_page=${limit}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{
        id?: string;
        display_name?: string;
        publication_year?: number;
        doi?: string;
        authorships?: Array<{ author?: { display_name?: string } }>;
        abstract_inverted_index?: Record<string, number[]>;
        primary_location?: { landing_page_url?: string };
      }>;
    };
    const now = new Date().toISOString();
    return (data.results ?? [])
      .filter((r) => r.display_name)
      .map((r, i) => {
        const authors = (r.authorships ?? [])
          .map((a) => a.author?.display_name)
          .filter(Boolean)
          .join(", ");
        const abstract = r.abstract_inverted_index
          ? Object.entries(r.abstract_inverted_index)
              .sort((a, b) => (a[1][0] ?? 0) - (b[1][0] ?? 0))
              .map(([word]) => word)
              .join(" ")
              .slice(0, 400)
          : `Scholarly work: ${r.display_name}`;
        return {
          id: `openalex-${i}-${r.id ?? i}`,
          title: r.display_name!,
          url: r.primary_location?.landing_page_url ?? (r.doi ? `https://doi.org/${r.doi.replace("https://doi.org/", "")}` : ""),
          snippet: abstract,
          kind: "openalex" as const,
          authority: "academic" as const,
          authors: authors || undefined,
          year: r.publication_year,
          doi: r.doi?.replace("https://doi.org/", ""),
          relevanceScore: 0.72,
          authorityScore: 0.82,
          freshnessScore: r.publication_year ? Math.min(1, (r.publication_year - 1990) / 35) : 0.5,
          retrievedAt: now,
        };
      });
  } catch {
    return [];
  }
}
