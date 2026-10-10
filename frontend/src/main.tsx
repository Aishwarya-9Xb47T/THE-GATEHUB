import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { GateHubAssistantProvider, GateHubAssistantRoot } from "@/assistant";
import { AppScrollRestoration } from "@/components/navigation/AppScrollRestoration";
import { restoreQueryCache, setupQueryCachePersistence } from "@/lib/queryCachePersist";
import { landingCoursesQueryOptions, landingUniversesQueryOptions } from "@/lib/landingQueries";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 5-minute staleTime so intra-session and cross-page navigation is instant (0ms delay)
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  },
});

// Restore persisted queries from localStorage immediately before initial render
restoreQueryCache(queryClient);

// Ensure landing query cache has initial data seeded so course cards render at frame 0
if (!queryClient.getQueryData(landingCoursesQueryOptions.queryKey)) {
  queryClient.setQueryData(
    landingCoursesQueryOptions.queryKey,
    landingCoursesQueryOptions.initialData()
  );
}
if (!queryClient.getQueryData(landingUniversesQueryOptions.queryKey)) {
  queryClient.setQueryData(
    landingUniversesQueryOptions.queryKey,
    landingUniversesQueryOptions.initialData()
  );
}

// Start background cache sync to localStorage
setupQueryCachePersistence(queryClient);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppScrollRestoration />
        <GateHubAssistantProvider>
          <App />
          <GateHubAssistantRoot />
        </GateHubAssistantProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
