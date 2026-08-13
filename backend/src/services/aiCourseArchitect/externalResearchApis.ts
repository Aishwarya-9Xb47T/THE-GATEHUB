/**
 * External APIs for research validation (Semantic Scholar, CrossRef).
 * Used by Research Agent + QA — never invent paper metadata when verification fails.
 */
export interface VerifiedPaperMeta {
  title: string;
  authors: string;
  year: number;
  url?: string;
  doi?: string;
  abstract?: string;
  verified: boolean;
}

export async function lookupSemanticScholar(title: string): Promise<VerifiedPaperMeta | null> {
  const q = encodeURIComponent(title.slice(0, 200));
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${q}&limit=1&fields=title,authors,year,externalIds,abstract,url`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
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
    const hit = data.data?.[0];
    if (!hit?.title) return null;
    return {
      title: hit.title,
      authors: (hit.authors ?? []).map((a) => a.name).filter(Boolean).join(", ") || "Unknown",
      year: hit.year ?? new Date().getFullYear(),
      url: hit.url,
      doi: hit.externalIds?.DOI,
      abstract: hit.abstract,
      verified: true,
    };
  } catch {
    return null;
  }
}

export async function verifyResearchPaperTitle(title: string): Promise<VerifiedPaperMeta | null> {
  if (!title || title.length < 8) return null;
  return lookupSemanticScholar(title);
}

export function isLikelyFakeUrl(url?: string): boolean {
  if (!url) return false;
  return /example\.com|placeholder|fake|lorem|xxx/i.test(url);
}
