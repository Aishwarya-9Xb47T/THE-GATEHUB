import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { GateHubAssistantProvider, GateHubAssistantRoot } from "@/assistant";
import { AppScrollRestoration } from "@/components/navigation/AppScrollRestoration";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

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
