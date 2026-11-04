import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchLandingData } from "@/lib/landingQueries";
import { prefetchCoreRoutes, prefetchPptLibraryData } from "@/lib/routePrefetch";

/** Idle-time warmup so navigation to core pages and Study Materials feels instant (0ms delay). */
export function RouteWarmup() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const warm = () => {
      prefetchLandingData(queryClient);
      prefetchPptLibraryData(queryClient);
      prefetchCoreRoutes();
    };

    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(warm, { timeout: 1000 });
      return () => window.cancelIdleCallback(id);
    }

    const timer = window.setTimeout(warm, 200);
    return () => window.clearTimeout(timer);
  }, [queryClient]);

  return null;
}
