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

/** Pre-seeded active production courses for 0-millisecond instant initial paint */
export const SEED_LANDING_COURSES: LandingCoursesResponse = {
  success: true,
  courses: [
    {
      id: "cmuyyrclo006ab4kywr3pypkl",
      title: "Cyber Security",
      subtitle: "Professional Cyber Security — Custom",
      price: 0,
      thumbnail: "/uploads/banners/1b406ad0-f47b-41bf-95ec-959a1354b3e9.jpg",
      bannerUrl: "/uploads/banners/1b406ad0-f47b-41bf-95ec-959a1354b3e9.jpg",
      category: "Cyber Security",
      categoryRel: { name: "Cyber Security" },
      instructor: { firstName: "N", lastName: "AISHWARYA" },
    },
    {
      id: "cmt7jc1ff000310g6u2egopr4",
      title: "Computer Networking",
      subtitle: "Professional Computer Networking — Custom",
      price: 0,
      thumbnail: "/uploads/banners/d78f6c86-a5b1-46d1-a6b1-4ce0cbc7ffd4.jpg",
      bannerUrl: "/uploads/banners/d78f6c86-a5b1-46d1-a6b1-4ce0cbc7ffd4.jpg",
      category: "Computer Networking",
      categoryRel: { name: "Computer Networking" },
      instructor: { firstName: "N", lastName: "AISHWARYA" },
    },
    {
      id: "cmt7hmqv300aw4c57cvx9e2a7",
      title: "Deep Learning",
      subtitle: "Professional Deep Learning — Custom",
      price: 0,
      thumbnail: "/uploads/banners/a645f8e8-860b-4d1c-bb49-6a7931254c09.png",
      bannerUrl: "/uploads/banners/a645f8e8-860b-4d1c-bb49-6a7931254c09.png",
      category: "Deep Learning",
      categoryRel: { name: "Deep Learning" },
      instructor: { firstName: "N", lastName: "AISHWARYA" },
    },
    {
      id: "cmt7hgrys000m4c57gs35qg0z",
      title: "AIML",
      subtitle: "Professional AIML — Custom",
      price: 0,
      thumbnail: "/uploads/banners/16152995-3b57-4321-82b7-751bdbcc49ae.jpg",
      bannerUrl: "/uploads/banners/16152995-3b57-4321-82b7-751bdbcc49ae.jpg",
      category: "Artificial Intelligence",
      categoryRel: { name: "Artificial Intelligence" },
      instructor: { firstName: "N", lastName: "AISHWARYA" },
    },
  ],
};

function getCachedLandingCourses(): LandingCoursesResponse {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const stored = localStorage.getItem("gatehub_landing_featured_courses");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.courses?.length > 0) return parsed;
      }
    } catch {
      /* ignore */
    }
  }
  return SEED_LANDING_COURSES;
}

function getCachedLandingUniverses(): any[] {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const stored = localStorage.getItem("gatehub_landing_universes");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
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
        localStorage.setItem("gatehub_landing_featured_courses", JSON.stringify(data));
      } catch {
        /* ignore */
      }
    }
    return data;
  },
  initialData: getCachedLandingCourses,
  staleTime: LANDING_STALE_MS,
  gcTime: LANDING_GC_MS,
  retry: 2,
  retryDelay: 1000,
  refetchOnMount: false,
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
        localStorage.setItem("gatehub_landing_universes", JSON.stringify(data));
      } catch {
        /* ignore */
      }
    }
    return data;
  },
  initialData: getCachedLandingUniverses,
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
