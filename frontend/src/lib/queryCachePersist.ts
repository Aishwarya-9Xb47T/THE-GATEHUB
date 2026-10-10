import type { QueryClient } from "@tanstack/react-query";

export const PUBLIC_CACHE_STORAGE_KEY = "gatehub_public_query_cache_v1";
export const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getActiveUserId(): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem("lms-auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.user?.id || null;
  } catch {
    return null;
  }
}

export function getUserCacheStorageKey(userId: string): string {
  return `gatehub_user_query_cache_${userId}`;
}

/**
 * Strict classifier: Returns true ONLY for explicitly public, unauthenticated catalog data.
 * Guarantees that instructor drafts, admin tables, and user-specific queries are NEVER saved publicly.
 */
export function isPublicQueryKey(queryKey: readonly unknown[]): boolean {
  if (!queryKey || queryKey.length === 0) return false;
  const first = String(queryKey[0]);
  const second = queryKey.length > 1 ? String(queryKey[1]) : "";

  // Never allow instructor, admin, or user-private queries into public storage
  if (first === "admin" || first === "instructor" || first === "auth" || first === "user") return false;
  if (
    second === "my-instructor" ||
    second === "mine" ||
    second === "drafts" ||
    second === "instructor" ||
    second === "admin" ||
    second === "edit"
  ) {
    return false;
  }

  // Only permit strictly public catalog read-only keys
  if (first === "landing") return true;
  if (first === "categories") return true;
  if (first === "help") return true;
  if (first === "courses" && (second === "browse" || second === "public" || second === "featured" || second === "")) return true;
  if (first === "learning-universes" && (second === "browse" || second === "public" || second === "catalog")) return true;
  if (first === "resources" && second !== "instructor" && second !== "admin") return true;

  return false;
}

/**
 * Classified user-private queries: Partitioned by active user ID.
 */
export function isUserPrivateQueryKey(queryKey: readonly unknown[]): boolean {
  if (!queryKey || queryKey.length === 0) return false;
  const first = String(queryKey[0]);
  const second = queryKey.length > 1 ? String(queryKey[1]) : "";

  if (first === "admin") return false; // Admin data should remain in memory only, never persisted to disk

  if (
    first === "learning" ||
    first === "my-certificates" ||
    first === "my-enrollments" ||
    first === "lu-enrollments" ||
    first === "cart" ||
    first === "wishlist" ||
    (first === "courses" && second === "my-instructor") ||
    first === "instructor"
  ) {
    return true;
  }

  return false;
}

export interface StoredQueryEntry {
  queryKey: readonly unknown[];
  data: unknown;
  updatedAt: number;
}

/**
 * Clear private user cache on logout or account switch.
 */
export function clearUserQueryCache(userId?: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const id = userId || getActiveUserId();
    if (id) {
      localStorage.removeItem(getUserCacheStorageKey(id));
    }
    // Also remove any remaining user-partitioned keys in storage
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("gatehub_user_query_cache_")) {
        localStorage.removeItem(key);
      }
    });
  } catch {
    /* ignore */
  }
}

/**
 * Restore public and (if authenticated) user-partitioned queries into QueryClient on startup.
 */
export function restoreQueryCache(queryClient: QueryClient): void {
  if (typeof window === "undefined" || !window.localStorage) return;

  const now = Date.now();

  const restoreEntries = (raw: string | null) => {
    if (!raw) return;
    try {
      const entries: StoredQueryEntry[] = JSON.parse(raw);
      if (!Array.isArray(entries)) return;

      for (const entry of entries) {
        if (!entry || !entry.queryKey || !entry.data) continue;
        // Enforce max age limit (24 hours)
        if (entry.updatedAt && now - entry.updatedAt > MAX_CACHE_AGE_MS) continue;

        try {
          queryClient.setQueryData(entry.queryKey, entry.data, {
            updatedAt: entry.updatedAt || now,
          });
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore malformed data */
    }
  };

  // 1. Restore public catalog data
  restoreEntries(localStorage.getItem(PUBLIC_CACHE_STORAGE_KEY));

  // 2. Restore user-partitioned data only for the verified active user
  const activeUserId = getActiveUserId();
  if (activeUserId) {
    restoreEntries(localStorage.getItem(getUserCacheStorageKey(activeUserId)));
  }
}

/**
 * Persist public queries and user-partitioned queries safely without cross-user leakage.
 */
export function setupQueryCachePersistence(queryClient: QueryClient): () => void {
  if (typeof window === "undefined" || !window.localStorage) return () => {};

  let saveTimer: number | null = null;

  const saveCache = () => {
    try {
      const cache = queryClient.getQueryCache();
      const queries = cache.getAll();

      const publicEntries: StoredQueryEntry[] = [];
      const userEntries: StoredQueryEntry[] = [];
      const activeUserId = getActiveUserId();

      for (const query of queries) {
        if (query.state.status !== "success" || query.state.data === undefined) continue;

        const isPublic = isPublicQueryKey(query.queryKey);
        const isPrivate = isUserPrivateQueryKey(query.queryKey);

        if (!isPublic && !isPrivate) continue;

        // Skip massive payloads (> 400KB)
        const serialized = JSON.stringify(query.state.data);
        if (serialized.length > 400_000) continue;

        const entry: StoredQueryEntry = {
          queryKey: query.queryKey,
          data: query.state.data,
          updatedAt: query.state.dataUpdatedAt || Date.now(),
        };

        if (isPublic) {
          publicEntries.push(entry);
        } else if (isPrivate && activeUserId) {
          userEntries.push(entry);
        }
      }

      // Save public catalog cache (capped at 30 entries)
      localStorage.setItem(PUBLIC_CACHE_STORAGE_KEY, JSON.stringify(publicEntries.slice(-30)));

      // Save private user cache partitioned by active user ID (capped at 30 entries)
      if (activeUserId && userEntries.length > 0) {
        localStorage.setItem(getUserCacheStorageKey(activeUserId), JSON.stringify(userEntries.slice(-30)));
      }
    } catch {
      /* ignore storage quota errors */
    }
  };

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (!event) return;
    if (event.type === "updated" && event.action.type === "success") {
      const qKey = event.query.queryKey;
      if (isPublicQueryKey(qKey) || isUserPrivateQueryKey(qKey)) {
        if (saveTimer) window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(saveCache, 600);
      }
    }
  });

  return () => {
    if (saveTimer) window.clearTimeout(saveTimer);
    unsubscribe();
  };
}
