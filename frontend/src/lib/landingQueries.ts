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

export const landingCoursesQueryOptions = {
  queryKey: ["landing", "featured-courses"] as const,
  queryFn: async (): Promise<LandingCoursesResponse> => {
    const res = await api<LandingCoursesResponse>("/courses?featured=home&limit=8");
    if (res.error) throw new Error(res.error);
    if (!res.data?.courses) {
      return { success: true, courses: [] };
    }
    return res.data;
  },
  staleTime: LANDING_STALE_MS,
  gcTime: LANDING_GC_MS,
  retry: 2,
  retryDelay: 1000,
  refetchOnMount: false,
};

export type LandingUniversesResponse = any[];

function normalizeCatalogTitle(title: unknown): string {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export type LandingExploreItem =
  | { kind: "universe"; id: string; universe: Record<string, any> }
  | { kind: "course"; id: string; course: LandingCoursesResponse["courses"][number] };

/** Combine landing universes + featured courses, dropping duplicates by id/title/linked course. */
export function mergeLandingExploreItems(
  universes: LandingUniversesResponse | undefined,
  courses: LandingCoursesResponse["courses"] | undefined,
): LandingExploreItem[] {
  const items: LandingExploreItem[] = [];
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();

  for (const universe of universes || []) {
    if (!universe?.id || seenIds.has(universe.id)) continue;
    const linkedId = universe.structuredData?.linkedCourseId;
    seenIds.add(universe.id);
    if (typeof linkedId === "string" && linkedId) seenIds.add(linkedId);
    const title = normalizeCatalogTitle(universe.title);
    if (title) seenTitles.add(title);
    items.push({ kind: "universe", id: universe.id, universe });
  }

  for (const course of courses || []) {
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
    return normalizeLandingUniverses(res.data);
  },
  staleTime: LANDING_STALE_MS,
  gcTime: LANDING_GC_MS,
  retry: 2,
  retryDelay: 1000,
  refetchOnMount: false,
};

/** Warm landing JS + API caches before navigation (home hover / focus / idle). */
export function prefetchLandingData(queryClient: QueryClient): void {
  prefetchLandingRoute();
  void Promise.all([
    queryClient.prefetchQuery(landingCoursesQueryOptions),
    queryClient.prefetchQuery(landingUniversesQueryOptions),
  ]);
}
