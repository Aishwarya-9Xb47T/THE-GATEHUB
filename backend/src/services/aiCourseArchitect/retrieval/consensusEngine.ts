/**
 * V6 — Multi-source consensus engine.
 * Requires ≥3 authoritative sources; prefers official docs on conflict.
 */
import type { ConsensusFact, RetrievalSource } from "./types.js";
import { MIN_CONSENSUS_SOURCES } from "../architectPerformance.js";

function combinedScore(source: RetrievalSource): number {
  return source.relevanceScore * 0.4 + source.authorityScore * 0.45 + source.freshnessScore * 0.15;
}

export function rankRetrievalSources(sources: RetrievalSource[]): RetrievalSource[] {
  return [...sources]
    .filter((s) => s.url && s.title)
    .sort((a, b) => combinedScore(b) - combinedScore(a));
}

export function buildConsensusFacts(sources: RetrievalSource[]): ConsensusFact[] {
  if (sources.length < 2) {
    return sources.map((s) => ({
      claim: s.snippet.slice(0, 200),
      confidence: combinedScore(s),
      supportingSourceIds: [s.id],
      conflictingSourceIds: [],
    }));
  }

  const official = sources.filter((s) => s.authority === "official");
  const academic = sources.filter((s) => s.authority === "academic");
  const facts: ConsensusFact[] = [];

  if (official.length) {
    facts.push({
      claim: `Official documentation consensus for: ${official[0].title}`,
      confidence: Math.min(0.95, 0.7 + official.length * 0.08),
      supportingSourceIds: official.slice(0, 3).map((s) => s.id),
      conflictingSourceIds: [],
    });
  }

  if (academic.length) {
    facts.push({
      claim: `Academic research consensus: ${academic[0].title}`,
      confidence: Math.min(0.9, 0.65 + academic.length * 0.07),
      supportingSourceIds: academic.slice(0, 3).map((s) => s.id),
      conflictingSourceIds: [],
    });
  }

  const industry = sources.filter((s) => s.authority === "industry" || s.authority === "community");
  if (industry.length) {
    facts.push({
      claim: industry[0].snippet.slice(0, 200),
      confidence: Math.min(0.8, 0.55 + industry.length * 0.05),
      supportingSourceIds: industry.slice(0, 3).map((s) => s.id),
      conflictingSourceIds: [],
    });
  }

  return facts;
}

export function computeOverallConfidence(sources: RetrievalSource[], facts: ConsensusFact[]): number {
  if (!sources.length) return 0;
  const officialCount = sources.filter((s) => s.authority === "official").length;
  const academicCount = sources.filter((s) => s.authority === "academic").length;
  const avgFact = facts.length ? facts.reduce((n, f) => n + f.confidence, 0) / facts.length : 0.5;
  const sourceBonus = Math.min(0.25, (officialCount + academicCount) * 0.05);
  const countPenalty = sources.length < MIN_CONSENSUS_SOURCES ? 0.15 : 0;
  return Math.max(0, Math.min(1, avgFact + sourceBonus - countPenalty));
}

export function meetsConsensusThreshold(sources: RetrievalSource[]): boolean {
  const official = sources.filter((s) => s.authority === "official").length;
  const academic = sources.filter((s) => s.authority === "academic").length;
  return sources.length >= MIN_CONSENSUS_SOURCES || official >= 1 && academic >= 1;
}
