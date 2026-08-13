/**
 * V6 — Format retrieval bundle for LLM prompts (RAG context injection).
 */
import type { LessonRetrievalBundle } from "./types.js";

export function formatRetrievalForPrompt(bundle: LessonRetrievalBundle | undefined): string {
  if (!bundle?.sources?.length) {
    return `
RETRIEVAL CONTEXT: No external sources retrieved. Use only well-established principles.
Do NOT invent citations, URLs, API names, or package versions.`;
  }

  const sourceBlock = bundle.sources
    .slice(0, 12)
    .map(
      (s, i) =>
        `[${i + 1}] ${s.title} (${s.authority}, ${s.kind})
URL: ${s.url}
${s.authors ? `Authors: ${s.authors}` : ""}${s.year ? ` Year: ${s.year}` : ""}
Snippet: ${s.snippet.slice(0, 280)}`
    )
    .join("\n\n");

  const facts = bundle.consensusFacts
    .map((f) => `- (${Math.round(f.confidence * 100)}% confidence) ${f.claim}`)
    .join("\n");

  return `
RETRIEVAL-AUGMENTED GENERATION (mandatory):
- Synthesize the sources below into ORIGINAL educational prose.
- Do NOT copy text verbatim from sources.
- Do NOT cite sources not listed below.
- Do NOT invent URLs, papers, or APIs beyond what retrieval supports.
- Overall retrieval confidence: ${Math.round(bundle.overallConfidence * 100)}%

CONSENSUS FACTS:
${facts || "(derive from sources)"}

AUTHORITATIVE SOURCES:
${sourceBlock}
`.trim();
}

export const RAG_SYNTHESIS_RULES = `
RAG RULES:
1. Retrieve-first: ground factual claims in provided sources.
2. Prefer official documentation over blogs when sources conflict.
3. If confidence is low, teach general principles without specific version numbers.
4. Never fabricate DOI, ISBN, package versions, or function signatures.
`.trim();
