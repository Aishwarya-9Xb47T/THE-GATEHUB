/**
 * V6 — In-memory cache for retrieval, search, and verification results.
 */
import type { LessonRetrievalBundle } from "./types.js";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const retrievalCache = new Map<string, CacheEntry<LessonRetrievalBundle>>();
const searchCache = new Map<string, CacheEntry<unknown>>();
const verificationCache = new Map<string, CacheEntry<boolean>>();

const TTL_MS = Math.max(
  60_000,
  parseInt(process.env.AI_ARCHITECT_RETRIEVAL_CACHE_TTL_MS || "3600000", 10) || 3_600_000
);

function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    map.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): void {
  if (map.size > 500) {
    const first = map.keys().next().value;
    if (first) map.delete(first);
  }
  map.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

export function getCachedRetrieval(key: string): LessonRetrievalBundle | null {
  return cacheGet(retrievalCache, key);
}

export function setCachedRetrieval(key: string, bundle: LessonRetrievalBundle): void {
  cacheSet(retrievalCache, key, bundle);
}

export function getCachedSearch<T>(key: string): T | null {
  return cacheGet(searchCache, key) as T | null;
}

export function setCachedSearch<T>(key: string, value: T): void {
  cacheSet(searchCache, key, value);
}

export function getCachedVerification(key: string): boolean | null {
  const v = cacheGet(verificationCache, key);
  return v === null ? null : v;
}

export function setCachedVerification(key: string, valid: boolean): void {
  cacheSet(verificationCache, key, valid);
}

export function buildRetrievalCacheKey(subject: string, lessonTitle: string, query: string): string {
  return `rag:${subject}:${lessonTitle}:${query}`.toLowerCase().slice(0, 240);
}
