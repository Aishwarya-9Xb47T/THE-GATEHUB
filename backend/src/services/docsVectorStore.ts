import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import {
  indexDocumentation,
  type DocChunk,
  DOCS_DIR,
} from "./docsIndexService.js";
import { logger } from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const VECTOR_INDEX_PATH = path.join(DOCS_DIR, "vector-index.json");

export interface IndexedChunk {
  id: string;
  manual: string;
  section: string;
  content: string;
  slug: string;
  sectionId: string;
  /** TF-IDF vector (always present) */
  tfidf: number[];
  /** OpenAI embedding (optional) */
  embedding?: number[];
}

export interface VectorIndexFile {
  version: number;
  builtAt: string;
  vocabulary: string[];
  idf: number[];
  chunks: IndexedChunk[];
}

let cachedIndex: VectorIndexFile | null = null;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function buildTfidfIndex(chunks: DocChunk[]): Omit<VectorIndexFile, "builtAt"> {
  const docs = chunks.map((c) => tokenize(`${c.manual} ${c.section} ${c.content}`));
  const df = new Map<string, number>();
  for (const tokens of docs) {
    const unique = new Set(tokens);
    for (const t of unique) df.set(t, (df.get(t) || 0) + 1);
  }
  const vocabulary = [...df.keys()].sort();
  const N = docs.length;
  const idf = vocabulary.map((term) => Math.log((N + 1) / ((df.get(term) || 0) + 1)) + 1);

  const indexed: IndexedChunk[] = chunks.map((chunk, i) => {
    const tokens = docs[i];
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    const maxTf = Math.max(...tf.values(), 1);
    const tfidf = vocabulary.map((term, vi) => {
      const termTf = (tf.get(term) || 0) / maxTf;
      return termTf * idf[vi];
    });
    return {
      id: chunk.id,
      manual: chunk.manual,
      section: chunk.section,
      content: chunk.content,
      slug: chunk.slug,
      sectionId: chunk.sectionId,
      tfidf,
    };
  });

  return { version: 2, vocabulary, idf, chunks: indexed };
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

function queryToTfidf(query: string, index: VectorIndexFile): number[] {
  const tokens = tokenize(query);
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  const maxTf = Math.max(...tf.values(), 1);
  return index.vocabulary.map((term, vi) => {
    const termTf = (tf.get(term) || 0) / maxTf;
    return termTf * index.idf[vi];
  });
}

export function loadVectorIndex(): VectorIndexFile | null {
  if (cachedIndex) return cachedIndex;
  if (!fs.existsSync(VECTOR_INDEX_PATH)) return null;
  try {
    const raw = fs.readFileSync(VECTOR_INDEX_PATH, "utf-8");
    cachedIndex = JSON.parse(raw) as VectorIndexFile;
    return cachedIndex;
  } catch (err) {
    logger.warn("[docs-vector] Failed to load vector index", { err });
    return null;
  }
}

export function invalidateVectorCache() {
  cachedIndex = null;
}

export function semanticSearch(query: string, limit = 10): Array<{ chunk: IndexedChunk; score: number }> {
  const index = loadVectorIndex();
  if (!index) return [];

  const qVec = queryToTfidf(query, index);
  const results = index.chunks.map((chunk) => {
    let score = cosineSimilarity(qVec, chunk.tfidf);
    if (chunk.embedding?.length) {
      // OpenAI embeddings require separate query embedding at runtime — skip unless we add query embed
    }
    return { chunk, score };
  });

  return results
    .filter((r) => r.score > 0.01)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function buildVectorIndex(options?: { useOpenAI?: boolean }): Promise<VectorIndexFile> {
  const chunks = indexDocumentation(true);
  const base = buildTfidfIndex(chunks);
  const useOpenAI = options?.useOpenAI !== false && !!process.env.OPENAI_API_KEY;

  if (useOpenAI) {
    const getOpenAi = (): OpenAI | null => {
  const k = process.env.OPENAI_API_KEY?.trim();
  return k ? new OpenAI({ apiKey: k }) : null;
};
    const BATCH = 20;
    for (let i = 0; i < base.chunks.length; i += BATCH) {
      const batch = base.chunks.slice(i, i + BATCH);
      const inputs = batch.map((c) => `${c.manual} > ${c.section}\n${c.content.slice(0, 2000)}`);
      try {
        const res = await getOpenAi()!.embeddings.create({
          model: "text-embedding-3-small",
          input: inputs,
        });
        res.data.forEach((row, j) => {
          base.chunks[i + j].embedding = row.embedding;
        });
      } catch (err) {
        logger.warn("[docs-vector] OpenAI embedding batch failed, TF-IDF only", { err });
        break;
      }
    }
  }

  const file: VectorIndexFile = {
    ...base,
    builtAt: new Date().toISOString(),
  };

  fs.mkdirSync(DOCS_DIR, { recursive: true });
  fs.writeFileSync(VECTOR_INDEX_PATH, JSON.stringify(file));
  invalidateVectorCache();
  logger.info(`[docs-vector] Index built: ${file.chunks.length} chunks`);
  return file;
}

export async function embedQuery(query: string): Promise<number[] | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const getOpenAi = (): OpenAI | null => {
  const k = process.env.OPENAI_API_KEY?.trim();
  return k ? new OpenAI({ apiKey: k }) : null;
};
    const res = await getOpenAi()!.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    return res.data[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

export function semanticSearchWithEmbedding(
  queryEmbedding: number[],
  limit = 10,
): Array<{ chunk: IndexedChunk; score: number }> {
  const index = loadVectorIndex();
  if (!index) return [];

  return index.chunks
    .filter((c) => c.embedding?.length)
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding!),
    }))
    .filter((r) => r.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export { cosineSimilarity, queryToTfidf };
