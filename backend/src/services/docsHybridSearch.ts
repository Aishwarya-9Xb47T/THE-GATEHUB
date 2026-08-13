import {
  indexDocumentation,
  keywordSearchChunks,
  expandQueryTerms,
  chunkToHref,
  type DocChunk,
} from "./docsIndexService.js";
import {
  semanticSearch,
  embedQuery,
  semanticSearchWithEmbedding,
  type IndexedChunk,
} from "./docsVectorStore.js";
import {
  detectIntents,
  expandQueryForIntents,
  intentBoostForChunk,
  type DocIntent,
} from "./docsIntentService.js";

export interface PageContext {
  pathname?: string;
  label?: string;
}

export interface RankedChunk {
  chunk: DocChunk;
  score: number;
  keywordScore: number;
  semanticScore: number;
  contextBoost: number;
}

const CONTEXT_RULES: Array<{
  match: RegExp;
  label: string;
  boostTerms: string[];
  preferSlugs?: string[];
}> = [
  {
    match: /learning-universe\/new\/visual/i,
    label: "Visual Authoring Studio",
    boostTerms: ["visual authoring", "visual studio", "lesson builder", "add block", "quiz block", "practice"],
    preferSlugs: ["instructor"],
  },
  {
    match: /learning-universe\/new\/academic/i,
    label: "Academic Authoring Studio",
    boostTerms: ["academic", "dsl", "latex", "learning universe", "\\quiz", "\\track", "main.tex"],
    preferSlugs: ["instructor"],
  },
  {
    match: /project/i,
    label: "Projects",
    boostTerms: ["project", "github", "colab", "submission", "review", "workspace"],
    preferSlugs: ["instructor", "student", "faq"],
  },
  {
    match: /courses\/new/i,
    label: "Course Creation",
    boostTerms: ["course creation", "curriculum", "pricing", "publish"],
    preferSlugs: ["instructor"],
  },
  {
    match: /^\/help\/admin/i,
    label: "Admin Documentation",
    boostTerms: ["admin", "user management", "payments", "analytics", "settings"],
    preferSlugs: ["admin"],
  },
  {
    match: /^\/help\/instructor/i,
    label: "Instructor Documentation",
    boostTerms: ["instructor", "course", "learning universe", "visual", "academic"],
    preferSlugs: ["instructor"],
  },
  {
    match: /^\/help\/student/i,
    label: "Student Documentation",
    boostTerms: ["student", "enroll", "certificate", "quiz"],
    preferSlugs: ["student"],
  },
  {
    match: /^\/help/i,
    label: "Help Center",
    boostTerms: ["getting started", "manual", "faq"],
    preferSlugs: ["getting-started", "faq"],
  },
  {
    match: /^\/student/i,
    label: "Student Dashboard",
    boostTerms: ["student", "enroll", "certificate", "quiz", "progress"],
    preferSlugs: ["student", "faq"],
  },
  {
    match: /^\/admin/i,
    label: "Admin Dashboard",
    boostTerms: ["admin", "user management", "payments", "analytics", "settings"],
    preferSlugs: ["admin"],
  },
  {
    match: /^\/instructor/i,
    label: "Instructor Dashboard",
    boostTerms: ["instructor", "course", "learning universe", "analytics"],
    preferSlugs: ["instructor", "learning-universe", "publishing"],
  },
  {
    match: /coding-lab/i,
    label: "Coding Lab",
    boostTerms: ["coding lab", "colab", "python", "submit", "run code"],
    preferSlugs: ["coding-lab", "integrations"],
  },
  {
    match: /notebook/i,
    label: "Notebook Workspace",
    boostTerms: ["notebook", "jupyter", "cells"],
    preferSlugs: ["coding-lab"],
  },
  {
    match: /research/i,
    label: "Research Workspace",
    boostTerms: ["research", "latex", "overleaf", "compile", "paper"],
    preferSlugs: ["research", "integrations"],
  },
  {
    match: /learning-universe/i,
    label: "Learning Universe",
    boostTerms: ["learning universe", "track", "module", "lesson", "checkpoint"],
    preferSlugs: ["learning-universe", "publishing"],
  },
  {
    match: /latex-editor|academic/i,
    label: "Academic Authoring Studio",
    boostTerms: ["academic", "latex", "dsl", "compile"],
    preferSlugs: ["instructor", "research", "integrations"],
  },
  {
    match: /certificates/i,
    label: "Certificates",
    boostTerms: ["certificate", "verify", "completion", "download"],
    preferSlugs: ["student", "faq"],
  },
  {
    match: /analytics/i,
    label: "Analytics",
    boostTerms: ["analytics", "engagement", "revenue", "reports"],
    preferSlugs: ["instructor", "admin"],
  },
  {
    match: /settings/i,
    label: "Settings",
    boostTerms: ["settings", "profile", "integrations", "notifications"],
    preferSlugs: ["student", "instructor", "admin"],
  },
];

export function resolvePageContext(pathname?: string): PageContext {
  if (!pathname) return {};
  for (const rule of CONTEXT_RULES) {
    if (rule.match.test(pathname)) {
      return { pathname, label: rule.label };
    }
  }
  return { pathname };
}

function contextBoost(chunk: DocChunk, pathname?: string): number {
  if (!pathname) return 0;
  let boost = 0;
  const text = `${chunk.manual} ${chunk.section} ${chunk.content}`.toLowerCase();
  for (const rule of CONTEXT_RULES) {
    if (!rule.match.test(pathname)) continue;
    if (rule.preferSlugs?.includes(chunk.slug)) boost += 0.15;
    for (const term of rule.boostTerms) {
      if (text.includes(term.toLowerCase())) boost += 0.05;
    }
  }
  return Math.min(boost, 0.35);
}

function indexedToDocChunk(c: IndexedChunk): DocChunk {
  return {
    id: c.id,
    manual: c.manual,
    section: c.section,
    content: c.content,
    slug: c.slug,
    sectionId: c.sectionId,
  };
}

function normalizeKeyword(score: number): number {
  return Math.min(score / 10, 1);
}

export async function hybridSearch(
  query: string,
  options?: { limit?: number; pageContext?: PageContext; intents?: DocIntent[]; history?: Array<{ role: string; content: string }> },
): Promise<RankedChunk[]> {
  const limit = options?.limit ?? 8;
  const pathname = options?.pageContext?.pathname;
  const intents = options?.intents ?? detectIntents(query, options?.history);
  const expandedQuery = expandQueryForIntents(query, intents);
  const searchQuery = expandedQuery || expandQueryTerms(query.toLowerCase()).join(" ");

  const keywordResults = keywordSearchChunks(searchQuery || query, limit * 3);
  const tfidfResults = semanticSearch(expandedQuery || query, limit * 2);

  let embeddingResults: Array<{ chunk: IndexedChunk; score: number }> = [];
  const queryEmbed = await embedQuery(query);
  if (queryEmbed) {
    embeddingResults = semanticSearchWithEmbedding(queryEmbed, limit * 2);
  }

  const merged = new Map<string, RankedChunk>();

  const upsert = (
    chunk: DocChunk,
    keywordScore: number,
    semanticScore: number,
  ) => {
    const ctx = contextBoost(chunk, pathname);
    let intentBoost = 0;
    for (const intent of intents) {
      intentBoost += intentBoostForChunk(intent, chunk.manual, chunk.section, chunk.content, chunk.slug);
    }
    intentBoost = Math.min(intentBoost, 0.4);

    const existing = merged.get(chunk.id);
    const kw = Math.max(existing?.keywordScore ?? 0, keywordScore);
    const sem = Math.max(existing?.semanticScore ?? 0, semanticScore);
    const combined = 0.3 * normalizeKeyword(kw) + 0.4 * sem + 0.15 * ctx + 0.15 * intentBoost;
    merged.set(chunk.id, {
      chunk,
      score: combined,
      keywordScore: kw,
      semanticScore: sem,
      contextBoost: ctx + intentBoost,
    });
  };

  for (const { chunk, score } of keywordResults) {
    upsert(chunk, score, 0);
  }
  for (const { chunk, score } of tfidfResults) {
    upsert(indexedToDocChunk(chunk), 0, score);
  }
  for (const { chunk, score } of embeddingResults) {
    upsert(indexedToDocChunk(chunk), 0, score);
  }

  // If index missing, fall back to in-memory keyword on all chunks
  if (merged.size === 0) {
    const q = query.toLowerCase();
    const words = expandQueryTerms(q);
    for (const chunk of indexDocumentation()) {
      const text = `${chunk.manual} ${chunk.section} ${chunk.content}`.toLowerCase();
      let kw = 0;
      if (text.includes(q)) kw += 8;
      for (const w of words) if (text.includes(w)) kw += 1;
      if (kw > 0) upsert(chunk, kw, 0);
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export interface AssistantSource {
  manual: string;
  section: string;
  slug: string;
  sectionId: string;
  href: string;
}

export function toAssistantSources(chunks: DocChunk[]): AssistantSource[] {
  const seen = new Set<string>();
  const sources: AssistantSource[] = [];
  for (const c of chunks) {
    const key = `${c.manual}:${c.section}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      manual: c.manual,
      section: c.section,
      slug: c.slug,
      sectionId: c.sectionId,
      href: chunkToHref(c),
    });
  }
  return sources;
}
