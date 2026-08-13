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

export function prefetchResourcesRoute(): void {
  prefetchRouteChunk(() => import("@/pages/ResourcesPage"), "resources");
}

export function prefetchStudentDashboardRoute(): void {
  prefetchRouteChunk(
    () => import("@/pages/student/StudentDashboard").then((m) => m.StudentDashboard),
    "student-dashboard"
  );
}

export function prefetchInstructorDashboardRoute(): void {
  prefetchRouteChunk(
    () => import("@/pages/instructor/InstructorDashboard").then((m) => m.InstructorDashboard),
    "instructor-dashboard"
  );
}

export function prefetchAdminDashboardRoute(): void {
  prefetchRouteChunk(
    () => import("@/pages/admin/AdminDashboard").then((m) => m.AdminDashboard),
    "admin-dashboard"
  );
}

/** Warm common dashboard + landing chunks during idle time. */
export function prefetchCoreRoutes(): void {
  prefetchLandingRoute();
  prefetchResourcesRoute();
  prefetchStudentDashboardRoute();
  prefetchInstructorDashboardRoute();
  prefetchAdminDashboardRoute();
}
