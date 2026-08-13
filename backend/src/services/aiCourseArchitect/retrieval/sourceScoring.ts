/**
 * V6 Part 3 — Source quality scoring and filtering.
 */
import type { RetrievalSource } from "./types.js";

const OFFICIAL_DOMAINS = [
  "learn.microsoft.com",
  "docs.aws.amazon.com",
  "cloud.google.com",
  "developer.mozilla.org",
  "docs.python.org",
  "pytorch.org",
  "tensorflow.org",
  "react.dev",
  "nodejs.org",
  "rust-lang.org",
  "go.dev",
  "huggingface.co",
  "docs.anthropic.com",
  "platform.openai.com",
  "kubernetes.io",
  "docker.com",
  "postgresql.org",
  "redis.io",
  "elastic.co",
  "nvidia.com",
];

const ACADEMIC_DOMAINS = ["arxiv.org", "doi.org", "semanticscholar.org", "openalex.org", "crossref.org", "ieee.org", "acm.org"];

const EDU_DOMAINS = ["mit.edu", "stanford.edu", "harvard.edu", "berkeley.edu", "cmu.edu", "ocw.mit.edu"];

function domainAuthority(url: string): number {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (OFFICIAL_DOMAINS.some((d) => host.includes(d))) return 0.95;
    if (ACADEMIC_DOMAINS.some((d) => host.includes(d))) return 0.88;
    if (EDU_DOMAINS.some((d) => host.includes(d))) return 0.85;
    if (host.includes("github.com")) return 0.7;
    if (host.includes("youtube.com")) return 0.65;
    return 0.5;
  } catch {
    return 0.3;
  }
}

export function computeSourceQualityScore(source: RetrievalSource): number {
  const domain = domainAuthority(source.url);
  const yearBoost = source.year ? Math.min(0.15, (source.year - 2015) / 50) : 0;
  const citationProxy = source.kind === "semantic-scholar" || source.doi ? 0.1 : 0;
  return Math.min(
    1,
    source.relevanceScore * 0.35 +
      source.authorityScore * 0.25 +
      source.freshnessScore * 0.15 +
      domain * 0.2 +
      yearBoost +
      citationProxy
  );
}

export const MIN_SOURCE_QUALITY = parseFloat(process.env.AI_ARCHITECT_MIN_SOURCE_QUALITY || "0.45");

export function scoreAndFilterSources(sources: RetrievalSource[]): RetrievalSource[] {
  return sources
    .map((s) => {
      const quality = computeSourceQualityScore(s);
      const authority =
        domainAuthority(s.url) >= 0.85 ? ("official" as const) :
        domainAuthority(s.url) >= 0.8 ? ("academic" as const) :
        s.authority;
      return { ...s, authority, relevanceScore: quality };
    })
    .filter((s) => s.relevanceScore >= MIN_SOURCE_QUALITY)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}
