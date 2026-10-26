import type { QueryClient } from "@tanstack/react-query";
import { api, getLandingShowcaseLearningUniverses } from "@/lib/api";
import { prefetchLandingRoute } from "@/lib/routePrefetch";

const LANDING_STALE_MS = 5 * 60 * 1000;
const LANDING_GC_MS = 30 * 60 * 1000;

export interface LandingCoursesResponse {
  success: boolean;
  courses: Array<{
    id: string;
    title: string;
    subtitle?: string;
    thumbnail?: string;
    bannerUrl?: string;
    price: number;
    averageRating?: number;
    reviewCount?: number;
    category?: string;
    categoryRel?: { name: string };
    instructor?: { firstName: string; lastName: string };
  }>;
}

export const SEED_LANDING_COURSES: LandingCoursesResponse = {
  success: true,
  courses: [],
};

export const LANDING_CACHE_VERSION = "v2";
export const LANDING_CACHE_TTL_MS = 10 * 60 * 1000;

interface StoredLandingCache<T> {
  version: string;
  savedAt: number;
  data: T;
}

export function getCachedLandingCourses(): LandingCoursesResponse {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const stored = localStorage.getItem("gatehub_landing_featured_courses");
      if (stored) {
        const parsed = JSON.parse(stored) as StoredLandingCache<LandingCoursesResponse> | LandingCoursesResponse;
        if (
          parsed &&
          typeof parsed === "object" &&
          "version" in parsed &&
          parsed.version === LANDING_CACHE_VERSION &&
          Array.isArray((parsed as StoredLandingCache<LandingCoursesResponse>).data?.courses)
        ) {
          const wrapper = parsed as StoredLandingCache<LandingCoursesResponse>;
          if (Date.now() - wrapper.savedAt < LANDING_CACHE_TTL_MS) {
            return wrapper.data;
          }
        } else {
          // Remove unversioned stale cache from prior sessions
          localStorage.removeItem("gatehub_landing_featured_courses");
        }
      }
    } catch {
      /* ignore */
    }
  }
  return { success: true, courses: [] };
}

export function getCachedLandingUniverses(): any[] {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const stored = localStorage.getItem("gatehub_landing_universes");
      if (stored) {
        const parsed = JSON.parse(stored) as StoredLandingCache<any[]> | any[];
        if (
          parsed &&
          typeof parsed === "object" &&
          "version" in parsed &&
          parsed.version === LANDING_CACHE_VERSION &&
          Array.isArray((parsed as StoredLandingCache<any[]>).data)
        ) {
          const wrapper = parsed as StoredLandingCache<any[]>;
          if (Date.now() - wrapper.savedAt < LANDING_CACHE_TTL_MS) {
            return wrapper.data;
          }
        } else {
          // Remove unversioned stale cache from prior sessions
          localStorage.removeItem("gatehub_landing_universes");
        }
      }
    } catch {
      /* ignore */
    }
  }
  return [];
}

export const landingCoursesQueryOptions = {
  queryKey: ["landing", "featured-courses"] as const,
  queryFn: async (): Promise<LandingCoursesResponse> => {
    const res = await api<LandingCoursesResponse>("/courses?featured=home&limit=8");
    if (res.error) throw new Error(res.error);
    const data = res.data?.courses ? res.data : { success: true, courses: [] };
    if (typeof window !== "undefined" && window.localStorage && data.courses.length > 0) {
      try {
        localStorage.setItem(
          "gatehub_landing_featured_courses",
          JSON.stringify({ version: LANDING_CACHE_VERSION, savedAt: Date.now(), data })
        );
      } catch {
        /* ignore */
      }
    }
    return data;
  },
  initialData: getCachedLandingCourses,
  initialDataUpdatedAt: () => 0,
  staleTime: 60 * 1000,
  gcTime: LANDING_GC_MS,
  retry: 2,
  retryDelay: 1000,
  refetchOnMount: true,
  refetchOnWindowFocus: true,
};

export type LandingUniversesResponse = any[];

/** Minimal identity used to merge Learning Universe + course catalogs without forcing a single payload shape. */
export interface CatalogMergeIdentity {
  id: string;
  title?: string | null;
}

export interface CatalogUniverseIdentity extends CatalogMergeIdentity {
  structuredData?: {
    linkedCourseId?: string | null;
  } | null;
}

export type CatalogExploreItem<TUniverse extends CatalogUniverseIdentity, TCourse extends CatalogMergeIdentity> =
  | { kind: "universe"; id: string; universe: TUniverse }
  | { kind: "course"; id: string; course: TCourse };

export type LandingExploreItem = CatalogExploreItem<
  CatalogUniverseIdentity,
  LandingCoursesResponse["courses"][number]
>;

function normalizeCatalogTitle(title: unknown): string {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Combine universes + courses, dropping duplicates by id/title/linked course. */
export function mergeLandingExploreItems<
  TUniverse extends CatalogUniverseIdentity,
  TCourse extends CatalogMergeIdentity,
>(
  universes: readonly TUniverse[] | undefined,
  courses: readonly TCourse[] | undefined,
): CatalogExploreItem<TUniverse, TCourse>[] {
  const items: CatalogExploreItem<TUniverse, TCourse>[] = [];
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();

  const universeList: readonly TUniverse[] = Array.isArray(universes)
    ? universes
    : (normalizeLandingUniverses(universes) as TUniverse[]);

  const courseList: readonly TCourse[] = Array.isArray(courses)
    ? courses
    : Array.isArray((courses as any)?.courses)
      ? ((courses as any).courses as TCourse[])
      : [];

  for (const universe of universeList) {
    if (!universe?.id || seenIds.has(universe.id)) continue;
    const linkedId = universe.structuredData?.linkedCourseId;
    seenIds.add(universe.id);
    if (typeof linkedId === "string" && linkedId) seenIds.add(linkedId);
    const title = normalizeCatalogTitle(universe.title);
    if (title) seenTitles.add(title);
    items.push({ kind: "universe", id: universe.id, universe });
  }

  for (const course of courseList) {
    if (!course?.id || seenIds.has(course.id)) continue;
    const title = normalizeCatalogTitle(course.title);
    if (title && seenTitles.has(title)) continue;
    seenIds.add(course.id);
    if (title) seenTitles.add(title);
    items.push({ kind: "course", id: course.id, course });
  }

  return items;
}

export function normalizeLandingUniverses(payload: unknown): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload === "object" && payload !== null) {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data;
    const nested = obj.data as Record<string, unknown> | undefined;
    if (nested && Array.isArray(nested.data)) return nested.data as any[];
  }
  return [];
}

export const landingUniversesQueryOptions = {
  queryKey: ["landing", "learning-universes"] as const,
  queryFn: async (): Promise<LandingUniversesResponse> => {
    const res = await getLandingShowcaseLearningUniverses();
    if (res.error) throw new Error(res.error);
    const data = normalizeLandingUniverses(res.data);
    if (typeof window !== "undefined" && window.localStorage && Array.isArray(data)) {
      try {
        localStorage.setItem(
          "gatehub_landing_universes",
          JSON.stringify({ version: LANDING_CACHE_VERSION, savedAt: Date.now(), data })
        );
      } catch {
        /* ignore */
      }
    }
    return data;
  },
  initialData: getCachedLandingUniverses,
  initialDataUpdatedAt: () => 0,
  staleTime: 60 * 1000,
  gcTime: LANDING_GC_MS,
  retry: 2,
  retryDelay: 1000,
  refetchOnMount: true,
  refetchOnWindowFocus: true,
};

/** Warm landing JS + API caches before navigation (home hover / focus / idle). */
export function prefetchLandingData(queryClient: QueryClient): void {
  prefetchLandingRoute();
  void Promise.all([
    queryClient.prefetchQuery(landingCoursesQueryOptions),
    queryClient.prefetchQuery(landingUniversesQueryOptions),
  ]);
}
