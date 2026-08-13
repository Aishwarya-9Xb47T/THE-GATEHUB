/**
 * V6 Part 3 — Knowledge fusion: merge evidence, remove contradictions.
 */
import type { ConsensusFact, LessonRetrievalBundle, RetrievalSource } from "./types.js";
import { buildConsensusFacts, computeOverallConfidence } from "./consensusEngine.js";

export interface FusedKnowledge {
  bundle: LessonRetrievalBundle;
  synthesisGuidance: string;
  evidenceStatements: string[];
  rejectedSourceIds: string[];
}

export function fuseRetrievedKnowledge(
  query: string,
  subject: string,
  sources: RetrievalSource[],
  notes: string[]
): FusedKnowledge {
  const official = sources.filter((s) => s.authority === "official");
  const academic = sources.filter((s) => s.authority === "academic");
  const rejectedSourceIds: string[] = [];

  // Prefer official on conflict — demote low-quality community sources when official exists
  if (official.length >= 2) {
    for (const s of sources.filter((x) => x.authority === "community" && x.relevanceScore < 0.5)) {
      rejectedSourceIds.push(s.id);
    }
  }

  const accepted = sources.filter((s) => !rejectedSourceIds.includes(s.id));
  const consensusFacts = buildConsensusFacts(accepted);
  const overallConfidence = computeOverallConfidence(accepted, consensusFacts);

  const evidenceStatements = consensusFacts.map(
    (f) => `[${Math.round(f.confidence * 100)}%] ${f.claim}`
  );

  const synthesisGuidance = `
KNOWLEDGE FUSION RULES:
- Synthesize from ${accepted.length} sources (${official.length} official, ${academic.length} academic).
- Do NOT copy any source verbatim.
- Prefer official documentation when sources disagree.
- Remove unsupported claims; teach principles when evidence is weak.
- Overall evidence confidence: ${Math.round(overallConfidence * 100)}%.
`.trim();

  const bundle: LessonRetrievalBundle = {
    query,
    subject,
    sources: accepted,
    consensusFacts,
    overallConfidence,
    retrievedAt: new Date().toISOString(),
    providerNotes: [...notes, ...rejectedSourceIds.map((id) => `rejected:${id}`)],
  };

  return { bundle, synthesisGuidance, evidenceStatements, rejectedSourceIds };
}
