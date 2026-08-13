/**
 * arXiv API provider for academic retrieval.
 */
import type { RetrievalSource } from "../types.js";

export async function searchArxiv(query: string, limit = 3): Promise<RetrievalSource[]> {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query.slice(0, 100))}&start=0&max_results=${limit}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const xml = await res.text();
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
    const now = new Date().toISOString();
    return entries.slice(0, limit).map((match, i) => {
      const block = match[1];
      const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
      const summary = block.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
      const id = block.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() ?? "";
      const published = block.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.slice(0, 4);
      return {
        id: `arxiv-${i}`,
        title,
        url: id,
        snippet: summary.slice(0, 400),
        kind: "arxiv" as const,
        authority: "academic" as const,
        year: published ? parseInt(published, 10) : undefined,
        relevanceScore: 0.7,
        authorityScore: 0.75,
        freshnessScore: published ? Math.min(1, (parseInt(published, 10) - 2000) / 25) : 0.5,
        retrievedAt: now,
      };
    }).filter((s) => s.title);
  } catch {
    return [];
  }
}
