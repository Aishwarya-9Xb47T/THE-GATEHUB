import type { QueryClient } from "@tanstack/react-query";

/** Single source of truth — invalidate all caches that power course player + curriculum. */
export function invalidateCourseContentCaches(
  queryClient: QueryClient,
  courseId: string | undefined | null
) {
  if (!courseId) return;
  void queryClient.invalidateQueries({ queryKey: ["course-learn", courseId] });
  void queryClient.invalidateQueries({ queryKey: ["sections", courseId] });
  void queryClient.invalidateQueries({ queryKey: ["courses", courseId] });
}
