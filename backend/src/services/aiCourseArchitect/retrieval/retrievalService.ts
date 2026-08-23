/**
 * V6 — Central retrieval service for lesson-level RAG (Part 3 full pipeline).
 */
import type { LessonBlueprintPlan, LessonPipelineContext } from "../orchestrator/contracts.js";
import type { LessonRetrievalBundle, RetrievalOptions } from "./types.js";
import { RAG_ENABLED, MIN_CONSENSUS_SOURCES, MAX_RETRIEVAL_SOURCES } from "../architectPerformance.js";
import { buildOfficialDocSources } from "./sourceRegistry.js";
import { analyzeLessonTopic } from "./topicDetection.js";
import { runHybridSearch } from "./hybridSearch.js";
import { fuseRetrievedKnowledge } from "./knowledgeFusion.js";
import { rankRetrievalSources } from "./consensusEngine.js";
import {
  buildRetrievalCacheKey,
  getCachedRetrieval,
  setCachedRetrieval,
} from "./cache.js";
import type { RetrievalSource } from "./types.js";

function officialSourcesToRetrieval(
  entries: ReturnType<typeof buildOfficialDocSources>
): RetrievalSource[] {
  const now = new Date().toISOString();
  return entries.map((e, i) => ({
    id: `official-${i}`,
    title: e.title,
    url: e.url,
    snippet: e.snippet,
    kind: e.kind,
    authority: e.authority,
    relevanceScore: 0.85,
    authorityScore: 0.95,
    freshnessScore: 0.9,
    retrievedAt: now,
  }));
}

export async function retrieveForLesson(
  ctx: LessonPipelineContext,
  plan: LessonBlueprintPlan,
  options: RetrievalOptions = {}
): Promise<LessonRetrievalBundle> {
  const subject = ctx.interview.courseInfo.subject;
  const topicAnalysis = analyzeLessonTopic(ctx, plan);
  const goalsStr = Array.isArray(plan.learningGoals) ? plan.learningGoals.slice(0, 2).join("; ") : "";
  const query = `${subject} ${topicAnalysis.primaryTopic} ${goalsStr}`.trim();
  const cacheKey = buildRetrievalCacheKey(subject, ctx.skeleton.title, query);
  const cached = getCachedRetrieval(cacheKey);
  if (cached) {
    return { ...cached, providerNotes: [...cached.providerNotes, "retrieval cache hit"] };
  }

  const stack = ctx.interview.practicalComponents ?? [];
  const maxSources = options.maxSources ?? MAX_RETRIEVAL_SOURCES;
  const notes: string[] = [`topic:${topicAnalysis.primaryTopic}`, `keywords:${topicAnalysis.keywords.slice(0, 5).join(",")}`];

  if (!RAG_ENABLED) {
    return {
      query,
      subject,
      sources: [],
      consensusFacts: [],
      overallConfidence: 0,
      retrievedAt: new Date().toISOString(),
      providerNotes: ["RAG disabled via AI_ARCHITECT_RAG_ENABLED=false"],
    };
  }

  const official = officialSourcesToRetrieval(buildOfficialDocSources(query, subject, stack));
  notes.push(`topic-detection: ${topicAnalysis.subtopics.length} subtopics`);

  const hybridSources = await runHybridSearch(query, topicAnalysis, official);
  notes.push(`hybrid-search: ${hybridSources.length} sources`);

  let sources = rankRetrievalSources(hybridSources).slice(0, maxSources);
  const fused = fuseRetrievedKnowledge(query, subject, sources, notes);
  sources = fused.bundle.sources;

  if (sources.length < (options.minSources ?? MIN_CONSENSUS_SOURCES)) {
    fused.bundle.providerNotes.push(
      `Below minimum sources (${sources.length}/${options.minSources ?? MIN_CONSENSUS_SOURCES})`
    );
  }

  fused.bundle.providerNotes.push(fused.synthesisGuidance.slice(0, 200));
  setCachedRetrieval(cacheKey, fused.bundle);
  return fused.bundle;
}

export function attachRetrievalToPlan(
  plan: LessonBlueprintPlan,
  bundle: LessonRetrievalBundle
): LessonBlueprintPlan {
  return { ...plan, retrievalContext: bundle };
}
