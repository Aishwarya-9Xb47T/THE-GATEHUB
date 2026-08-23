/**
 * V6 Part 3 — Hallucination prevention: verify facts against retrieval evidence.
 */
import type { LessonRetrievalBundle } from "./types.js";
import { isLikelyFakeUrl } from "../externalResearchApis.js";
import { hasPlaceholderContent } from "./factualVerifier.js";

export type FactVerdict = "supported" | "unsupported" | "unknown";

export interface FactCheck {
  claim: string;
  verdict: FactVerdict;
  reason: string;
}

function evidenceCorpus(bundle?: LessonRetrievalBundle): string {
  if (!bundle?.sources?.length) return "";
  return bundle.sources.map((s) => `${s.title} ${s.snippet}`).join(" ").toLowerCase();
}

export function checkFactualClaim(claim: string, bundle?: LessonRetrievalBundle): FactCheck {
  const text = claim.toLowerCase().trim();
  if (!text || text.length < 8) {
    return { claim, verdict: "unknown", reason: "Too short to verify" };
  }
  if (hasPlaceholderContent(claim) || isLikelyFakeUrl(claim)) {
    return { claim, verdict: "unsupported", reason: "Placeholder or fake URL" };
  }

  const corpus = evidenceCorpus(bundle);
  if (!corpus) return { claim, verdict: "unknown", reason: "No retrieval evidence" };

  const tokens = text.split(/\s+/).filter((t) => t.length > 4);
  const hits = tokens.filter((t) => corpus.includes(t)).length;
  const ratio = tokens.length ? hits / tokens.length : 0;

  if (ratio >= 0.35) return { claim, verdict: "supported", reason: `${hits}/${tokens.length} terms in evidence` };
  if (ratio < 0.1) return { claim, verdict: "unsupported", reason: "No evidence overlap" };
  return { claim, verdict: "unknown", reason: "Partial evidence" };
}

export function auditLessonFacts(
  lesson: { theory?: string; summary?: string; codeExample?: string } | null | undefined,
  bundle?: LessonRetrievalBundle
): FactCheck[] {
  if (!lesson || typeof lesson !== "object") return [];
  const sentences = `${lesson.theory ?? ""} ${lesson.summary ?? ""}`
    .split(/[.!?]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40)
    .slice(0, 8);

  return sentences.map((s) => checkFactualClaim(s, bundle));
}

export function hasUnsupportedFacts(checks: FactCheck[]): boolean {
  return checks.some((c) => c.verdict === "unsupported");
}
