/**
 * V6 Part 3 — Lightweight embeddings for hybrid search (OpenAI or TF-IDF fallback).
 */
import OpenAI from "openai";
import { getOpenAi } from "../openaiClient.js";
import { getCachedSearch, setCachedSearch } from "./cache.js";


function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 2);
}

function tfidfVector(text: string, vocabulary: string[]): number[] {
  const tokens = tokenize(text);
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  const max = Math.max(...tf.values(), 1);
  return vocabulary.map((term) => (tf.get(term) ?? 0) / max);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export async function embedText(text: string): Promise<number[] | null> {
  const cacheKey = `emb:${text.slice(0, 120)}`;
  const cached = getCachedSearch<number[]>(cacheKey);
  if (cached) return cached;

  if (getOpenAi()) {
    try {
      const res = await getOpenAi()!.embeddings.create({
        model: process.env.AI_ARCHITECT_EMBEDDING_MODEL || "text-embedding-3-small",
        input: text.slice(0, 8000),
      });
      const vec = res.data[0]?.embedding;
      if (vec) {
        setCachedSearch(cacheKey, vec);
        return vec;
      }
    } catch {
      /* fallback */
    }
  }
  return null;
}

export function lexicalSimilarity(query: string, document: string): number {
  const vocab = [...new Set([...tokenize(query), ...tokenize(document)])];
  if (!vocab.length) return 0;
  return cosine(tfidfVector(query, vocab), tfidfVector(document, vocab));
}

export async function hybridSimilarity(query: string, document: string): Promise<number> {
  const [qEmb, dEmb] = await Promise.all([embedText(query), embedText(document)]);
  if (qEmb && dEmb && qEmb.length === dEmb.length) {
    return cosine(qEmb, dEmb);
  }
  return lexicalSimilarity(query, document);
}
