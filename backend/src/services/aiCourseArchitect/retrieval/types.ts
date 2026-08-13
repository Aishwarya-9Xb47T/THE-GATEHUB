/**
 * V6 — Retrieval-Augmented Generation types for AI Course Architect.
 * Shared across all knowledge-producing agents.
 */

export type RetrievalSourceKind =
  | "semantic-scholar"
  | "crossref"
  | "openalex"
  | "arxiv"
  | "official-docs"
  | "web-search"
  | "github"
  | "platform-docs";

export type SourceAuthority = "official" | "academic" | "industry" | "community";

export interface RetrievalSource {
  id: string;
  title: string;
  url: string;
  snippet: string;
  kind: RetrievalSourceKind;
  authority: SourceAuthority;
  authors?: string;
  year?: number;
  doi?: string;
  relevanceScore: number;
  authorityScore: number;
  freshnessScore: number;
  retrievedAt: string;
}

export interface ConsensusFact {
  claim: string;
  confidence: number;
  supportingSourceIds: string[];
  conflictingSourceIds: string[];
}

export interface LessonRetrievalBundle {
  query: string;
  subject: string;
  sources: RetrievalSource[];
  consensusFacts: ConsensusFact[];
  overallConfidence: number;
  retrievedAt: string;
  providerNotes: string[];
}

export interface RetrievalOptions {
  minSources?: number;
  maxSources?: number;
  requireOfficial?: boolean;
  includeAcademic?: boolean;
  includeWebSearch?: boolean;
}
