import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchLandingData } from "@/lib/landingQueries";
import { prefetchCoreRoutes } from "@/lib/routePrefetch";

/** Idle-time warmup so logo → home feels instant after first dashboard visit. */
export function RouteWarmup() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const warm = () => {
      prefetchLandingData(queryClient);
      prefetchCoreRoutes();
    };

    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(warm, { timeout: 3500 });
      return () => window.cancelIdleCallback(id);
    }

    const timer = window.setTimeout(warm, 1800);
    return () => window.clearTimeout(timer);
  }, [queryClient]);

  return null;
}
