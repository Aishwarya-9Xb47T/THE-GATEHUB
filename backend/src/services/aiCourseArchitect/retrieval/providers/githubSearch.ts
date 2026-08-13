/**
 * GitHub Search API for code/examples retrieval.
 */
import type { RetrievalSource } from "../types.js";

export async function searchGitHub(query: string, limit = 3): Promise<RetrievalSource[]> {
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_API_KEY;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "THE-GATEHUB-AI-Architect",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=${limit}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: Array<{ full_name?: string; html_url?: string; description?: string; stargazers_count?: number }>;
    };
    const now = new Date().toISOString();
    return (data.items ?? []).map((repo, i) => ({
      id: `github-${i}`,
      title: repo.full_name ?? query,
      url: repo.html_url ?? "",
      snippet: (repo.description ?? `GitHub repository for ${query}`).slice(0, 400),
      kind: "github" as const,
      authority: "industry" as const,
      relevanceScore: Math.min(0.9, 0.5 + (repo.stargazers_count ?? 0) / 10000),
      authorityScore: 0.65,
      freshnessScore: 0.8,
      retrievedAt: now,
    }));
  } catch {
    return [];
  }
}
