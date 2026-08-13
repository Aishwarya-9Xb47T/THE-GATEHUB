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
  refetchOnMount: "always" as const,
};

export type LandingUniversesResponse = any[];

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
  refetchOnMount: "always" as const,
};

/** Warm landing JS + API caches before navigation (logo hover / focus / idle). */
export function prefetchLandingData(queryClient: QueryClient): void {
  prefetchLandingRoute();
  void Promise.all([
    queryClient.prefetchQuery(landingCoursesQueryOptions),
    queryClient.prefetchQuery(landingUniversesQueryOptions),
  ]);
}
