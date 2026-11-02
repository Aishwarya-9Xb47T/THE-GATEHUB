import type { QueryClient } from "@tanstack/react-query";
import { fetchLibraryTopics, fetchLibraryResources } from "@/lib/pptLibrary/api";

/** One-shot JS chunk prefetch — safe to call repeatedly; each id runs once. */
const prefetchedChunks = new Set<string>();

export function prefetchRouteChunk(loader: () => Promise<unknown>, id: string): void {
  if (prefetchedChunks.has(id)) return;
  prefetchedChunks.add(id);
  void loader();
}

export function prefetchLandingRoute(): void {
  prefetchRouteChunk(() => import("@/pages/public/LandingPage"), "landing");
}

export function prefetchCoursesRoute(): void {
  prefetchRouteChunk(
    () => import("@/pages/student/BrowseCourses").then((m) => m.BrowseCourses),
    "browse-courses"
  );
}

export function prefetchHelpRoute(): void {
  prefetchRouteChunk(
    () => import("@/pages/help/HelpHomePage").then((m) => m.HelpHomePage),
    "help-home"
  );
}

export function prefetchResourcesRoute(): void {
  prefetchRouteChunk(() => import("@/pages/ResourcesPage"), "resources");
}

export function prefetchPptLibraryRoute(): void {
  prefetchRouteChunk(
    () => import("@/pages/public/ppt-library/PptLibraryPage").then((m) => m.PptLibraryPage),
    "ppt-library"
  );
}

export function prefetchStudentDashboardRoute(): void {
  prefetchRouteChunk(
    () => import("@/pages/student/StudentDashboard").then((m) => m.StudentDashboard),
    "student-dashboard"
  );
}

export function prefetchStudentMyCoursesRoute(): void {
  prefetchRouteChunk(
    () => import("@/pages/student/MyCourses").then((m) => m.MyCourses),
    "student-my-courses"
  );
}

export function prefetchInstructorDashboardRoute(): void {
  prefetchRouteChunk(
    () => import("@/pages/instructor/InstructorDashboard").then((m) => m.InstructorDashboard),
    "instructor-dashboard"
  );
}

export function prefetchInstructorCoursesRoute(): void {
  prefetchRouteChunk(
    () => import("@/pages/instructor/MyCoursesInstructor").then((m) => m.MyCoursesInstructor),
    "instructor-courses"
  );
}

export function prefetchAdminDashboardRoute(): void {
  prefetchRouteChunk(
    () => import("@/pages/admin/AdminDashboard").then((m) => m.AdminDashboard),
    "admin-dashboard"
  );
}

export function prefetchAdminApprovalsRoute(): void {
  prefetchRouteChunk(
    () => import("@/pages/admin/AdminInstructorApprovals").then((m) => m.AdminInstructorApprovals),
    "admin-instructor-approvals"
  );
}

/** Preload PPT query data so clicking PPT Library opens instantaneously with zero loading delay */
export function prefetchPptLibraryData(queryClient: QueryClient): void {
  void queryClient.prefetchQuery({
    queryKey: ["ppt-library", "topics"],
    queryFn: () => fetchLibraryTopics(),
    staleTime: 5 * 60 * 1000,
  });
  void queryClient.prefetchQuery({
    queryKey: ["ppt-library", "resources", 1, "", "", "", "newest"],
    queryFn: () => fetchLibraryResources({ page: 1, limit: 12, sort: "newest" }),
    staleTime: 2 * 60 * 1000,
  });
}

/** Warm common routes during idle time */
export function prefetchCoreRoutes(): void {
  prefetchLandingRoute();
  prefetchCoursesRoute();
  prefetchPptLibraryRoute();
  prefetchHelpRoute();
  prefetchResourcesRoute();
  prefetchStudentDashboardRoute();
  prefetchInstructorDashboardRoute();
  prefetchAdminDashboardRoute();
}
