function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Development: relative `/api` so the Vite `/api` proxy still works (localhost backend).
 * Production: `VITE_API_BASE_URL` from `.env.production` (Render backend). Never use localhost in prod.
 */
export function getApiBase(): string {
  if (import.meta.env.PROD) {
    const env = String(import.meta.env.VITE_API_BASE_URL || "").trim();
    if (env) return stripTrailingSlash(env);
  }
  return "/api";
}

export const API_BASE_URL = getApiBase();

/** Join a path onto the API base without producing `/api/api`. */
export function apiUrl(path: string): string {
  const base = getApiBase();
  let p = path.startsWith("/") ? path : `/${path}`;
  if (p === "/api") p = "";
  else if (p.startsWith("/api/")) p = p.slice(4);
  return `${base}${p}`;
}

/** Backend origin (no `/api`) for OAuth redirects and `/uploads`. */
export function getBackendOrigin(): string {
  const base = getApiBase();
  if (/^https?:\/\//i.test(base)) {
    return stripTrailingSlash(base.replace(/\/api$/i, ""));
  }
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

/** Backend path for `/uploads` and similar non-API routes. */
export function backendUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (p === "/api" || p.startsWith("/api/")) return apiUrl(p);
  const base = getApiBase();
  if (/^https?:\/\//i.test(base)) {
    return `${getBackendOrigin()}${p}`;
  }
  return p;
}

/** WebSocket host: Vite proxy in dev, VITE_WS_BASE_URL / API host in production. */
export function getWsConnectTarget(): { protocol: string; host: string } {
  if (typeof window === "undefined") {
    return { protocol: "ws", host: "localhost:5000" };
  }
  if (import.meta.env.PROD) {
    const raw = String(
      import.meta.env.VITE_WS_BASE_URL || import.meta.env.VITE_API_BASE_URL || ""
    ).trim();
    if (raw) {
      const url = new URL(raw);
      const protocol = url.protocol === "https:" || url.protocol === "wss:" ? "wss" : "ws";
      return { protocol, host: url.host };
    }
  }
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return { protocol, host: window.location.host };
}

export function getToken(): string | null {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const qToken = params.get("token");
    if (qToken) {
      sessionStorage.setItem("lms_token", qToken);
    }
    return sessionStorage.getItem("lms_token") || localStorage.getItem("lms_token");
  }
  return null;
}

type ApiOptions = Omit<RequestInit, "body"> & { body?: unknown; skipLoginRedirect?: boolean };

/** In-flight GET dedupe: identical path+auth shares one network request. */
const inflightGetRequests = new Map<string, Promise<{ data?: unknown; error?: string }>>();

function redirectToLoginSoft(fromPath: string) {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/login")) return;
  try {
    localStorage.removeItem("lms_token");
    sessionStorage.removeItem("lms_token");
  } catch {
    /* ignore */
  }
  // Auth expiry must leave private SPA state; soft client navigate via assign (no SPA cache bleed).
  window.location.assign(`/login?from=${encodeURIComponent(fromPath)}`);
}

function sanitizePayload(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isNaN(value)) return undefined;

  if (Array.isArray(value)) {
    const sanitizedArray = value
      .map((item) => sanitizePayload(item))
      .filter((item) => item !== undefined);
    return sanitizedArray;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const sanitizedObject: Record<string, unknown> = {};

    entries.forEach(([key, rawValue]) => {
      const sanitized = sanitizePayload(rawValue);
      if (sanitized !== undefined) {
        sanitizedObject[key] = sanitized;
      }
    });

    return sanitizedObject;
  }

  return value;
}

function extractApiErrorMessage(json: Record<string, unknown>): string | undefined {
  const raw = json.error ?? json.message ?? (json.importError as { message?: string } | undefined)?.message;
  if (typeof raw === "string" && raw.trim()) return raw;
  if (raw && typeof raw === "object") {
    const msg = (raw as { message?: string }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
    try {
      return JSON.stringify(raw);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function api<T>(
  path: string,
  options: ApiOptions = {}
): Promise<{ data?: T; error?: string }> {
  const { body, skipLoginRedirect, ...init } = options;
  const method = String(init.method || "GET").toUpperCase();
  const token = getToken();
  const canDedupe = method === "GET" && body === undefined && !init.signal;

  const run = async (): Promise<{ data?: T; error?: string }> => {
  const sanitizedBody = body !== undefined ? sanitizePayload(body) : undefined;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  
  try {
    const res = await fetch(apiUrl(path), {
      ...init,
      headers,
      body: sanitizedBody !== undefined ? JSON.stringify(sanitizedBody) : undefined,
    });
    
    let json: any = {};
    const text = await res.text();
    try {
      json = JSON.parse(text);
    } catch (e: any) {
      // Cannot parse JSON; could be a 404/500 HTML page
    }

    if (!res.ok) {
      let errorMessage = extractApiErrorMessage(json);
      if (!errorMessage) {
        if (res.status === 404) errorMessage = "Resource not found.";
        else if (res.status === 401) errorMessage = "Authentication required. Please log in again.";
        else if (res.status === 429) errorMessage = "Too many requests. Please wait a moment and try again.";
        else if (res.status === 403) errorMessage = "You do not have permission to perform this action.";
        else if (res.status === 502 || res.status === 503 || res.status === 504) {
          errorMessage = "Backend server is unreachable. Start the backend: cd backend && npm run dev";
        }
        else if (res.status >= 500) {
          errorMessage =
            "Server error during this request. Ensure the backend is running (cd backend && npm run dev) and try again.";
        }
        else errorMessage = res.statusText || "Request failed. Please try again.";
      }
      if (res.status === 401) {
        const isGoogleIntegration =
          skipLoginRedirect ||
          path.includes("/integrations/") ||
          path.includes("/analyze-google") ||
          path.includes("/google") ||
          json.error === "AUTH_REQUIRED" ||
          String(errorMessage).toLowerCase().includes("google");
        if (!isGoogleIntegration) {
          redirectToLoginSoft(window.location.pathname);
        }
      }
      // Preserve full JSON body (logs, errors, etc.) for compile and similar endpoints
      return { data: json as T, error: errorMessage };
    }
    return { data: json as T };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { error: "Request cancelled" };
    }
    console.error("API Call failed:", err);
    if (err.message === "Failed to fetch") {
      return { error: "Backend server is unreachable. Please ensure the backend is running on port 5000." };
    }
    return { error: err.message || "Network error occurred. Please check your connection." };
  }
  };

  if (!canDedupe) return run();

  const dedupeKey = `${method}:${path}:${token || ""}`;
  const existing = inflightGetRequests.get(dedupeKey);
  if (existing) return existing as Promise<{ data?: T; error?: string }>;

  const pending = run().finally(() => {
    inflightGetRequests.delete(dedupeKey);
  });
  inflightGetRequests.set(dedupeKey, pending as Promise<{ data?: unknown; error?: string }>);
  return pending;
}

export async function apiFormData<T>(
  path: string,
  formData: FormData,
  init: Omit<RequestInit, "body" | "method"> = {},
): Promise<{
  data?: T;
  error?: string;
  importError?: { message?: string; code?: string; suggestion?: string; supportId?: string; retryable?: boolean };
}> {
  const token = getToken();
  const headers: HeadersInit = {
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const res = await fetch(apiUrl(path), { method: "POST", ...init, headers, body: formData });
    let json: any = {};
    const text = await res.text();
    try {
      json = JSON.parse(text);
    } catch (e: any) {
      // Cannot parse JSON
    }

    if (!res.ok) {
      let errorMessage = extractApiErrorMessage(json);
      if (!errorMessage) {
        if (res.status === 404) errorMessage = "Resource not found.";
        else if (res.status === 401) {
          errorMessage = "Authentication required. Please log in again.";
          redirectToLoginSoft(window.location.pathname);
        }
        else if (res.status === 429) errorMessage = json.error || json.message || "Too many requests. Please wait a moment and try again.";
        else if (res.status === 403) errorMessage = json.importError?.message || "You do not have permission to perform this action.";
        else if (res.status >= 500) errorMessage = json.importError?.message || json.message || "Server error. Please try again.";
        else errorMessage = res.statusText || "Upload failed. Please try again.";
      }
      return { error: errorMessage, data: json as T, importError: json.importError };
    }
    return { data: json as T };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { error: "Request cancelled" };
    }
    console.error("API FormData call failed:", err);
    if (err instanceof Error && err.message === "Failed to fetch") {
      return { error: "Backend server is unreachable. Please ensure the backend is running on port 5000." };
    }
    return { error: err instanceof Error ? err.message : "Network error occurred. Please check your connection." };
  }
}

// Learning Universe API functions
export async function publishLearningUniverse<T>(
  dslSource: string,
  projectId?: string,
  universeId?: string,
  options?: {
    snapshotHash?: string;
    fileOverlay?: Array<{ name: string; content: string }>;
    editorVersion?: number;
  }
): Promise<{ data?: T; error?: string }> {
  return api("/learning-universes/publish", {
    method: "POST",
    body: {
      dslSource,
      projectId,
      universeId,
      snapshotHash: options?.snapshotHash,
      fileOverlay: options?.fileOverlay,
      editorVersion: options?.editorVersion,
    },
  });
}

export async function publishAcademicCourse<T>(
  dslSource: string,
  projectId?: string,
  courseId?: string
): Promise<{ data?: T; error?: string }> {
  return api("/courses/publish-from-dsl", { method: "POST", body: { dslSource, projectId, courseId } });
}

export async function publishVisualLearningUniverse<T>(
  structuredData: unknown,
  options?: { projectId?: string; universeId?: string; price?: number; assets?: File[] }
): Promise<{ data?: T; error?: string }> {
  const files = options?.assets?.filter(Boolean) || [];
  if (files.length > 0) {
    const formData = new FormData();
    formData.append("structuredData", JSON.stringify(structuredData));
    if (options?.projectId) formData.append("projectId", options.projectId);
    if (options?.universeId) formData.append("universeId", options.universeId);
    if (options?.price != null) formData.append("price", String(options.price));
    for (const file of files) {
      formData.append("assets", file, file.name);
    }
    return apiFormData("/learning-universes/publish", formData);
  }
  return api("/learning-universes/publish", {
    method: "POST",
    body: { structuredData, projectId: options?.projectId, universeId: options?.universeId, price: options?.price },
  });
}

export async function getPublishedLearningUniverses<T>(options?: { categorySlug?: string }): Promise<{ data?: T; error?: string }> {
  const params = new URLSearchParams();
  if (options?.categorySlug) params.set("categorySlug", options.categorySlug);
  return api(`/learning-universes${params.toString() ? `?${params.toString()}` : ""}`, { method: "GET" });
}

export async function getFeaturedLearningUniverses<T>(): Promise<{ data?: T; error?: string }> {
  return api("/learning-universes/catalog/featured", { method: "GET" });
}

export async function getLandingShowcaseLearningUniverses<T>(): Promise<{ data?: T; error?: string }> {
  return api("/learning-universes/catalog/landing", { method: "GET" });
}

export async function getLearningUniverseById<T>(id: string): Promise<{ data?: T; error?: string }> {
  return api(`/learning-universes/${id}`, { method: "GET" });
}

export interface DocsAssistantSource {
  manual: string;
  section: string;
  slug: string;
  sectionId: string;
  href: string;
}

export interface DocsAssistantResult {
  answer: string;
  sources: DocsAssistantSource[];
  relatedTopics?: string[];
  followUpSuggestions?: string[];
  fromFallback?: boolean;
  usedAI?: boolean;
  confidence?: "high" | "medium" | "low";
}

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

const ASSISTANT_UNAVAILABLE =
  "I'm currently unavailable. Please try again later or search the documentation.";

export async function askDocsAssistant(
  question: string,
  pageContext?: AssistantPageContext,
  history?: ChatHistoryMessage[],
): Promise<{ data?: DocsAssistantResult; error?: string }> {
  const res = await api<{
    success: boolean;
    data?: DocsAssistantResult;
    error?: string;
  }>("/docs/assistant/chat", {
    method: "POST",
    body: { question, pageContext, history },
  });

  if (res.data?.success && res.data.data) {
    return { data: res.data.data };
  }
  if (res.data?.data && "answer" in (res.data.data as object)) {
    return { data: res.data.data as DocsAssistantResult };
  }
  // Never surface raw API errors to assistant UI
  return {
    data: {
      answer: ASSISTANT_UNAVAILABLE,
      sources: [],
      fromFallback: true,
    },
  };
}

export type DocsAssistantStreamEvent =
  | { type: "thinking"; intents?: string[] }
  | { type: "start" }
  | { type: "token"; content: string }
  | {
      type: "done";
      answer: string;
      sources: DocsAssistantSource[];
      relatedTopics?: string[];
      followUpSuggestions?: string[];
      fromFallback?: boolean;
      usedAI?: boolean;
      confidence?: "high" | "medium" | "low";
    };

export async function streamDocsAssistant(
  question: string,
  pageContext: AssistantPageContext | undefined,
  handlers: {
    onEvent: (event: DocsAssistantStreamEvent) => void;
    onError?: () => void;
  },
  history?: ChatHistoryMessage[],
  signal?: AbortSignal,
): Promise<void> {
  const token = getToken();
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(apiUrl("/docs/assistant/stream"), {
      method: "POST",
      headers,
      body: JSON.stringify({ question, pageContext, history }),
      signal,
    });

    if (!res.ok || !res.body) {
      handlers.onError?.();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6)) as DocsAssistantStreamEvent;
          handlers.onEvent(event);
        } catch {
          /* skip malformed */
        }
      }
    }
  } catch {
    handlers.onError?.();
  }
}

export async function searchDocsApi(q: string): Promise<{
  data?: Array<{
    manual: string;
    section: string;
    snippet: string;
    slug: string;
    sectionId?: string;
    href?: string;
  }>;
  error?: string;
}> {
  const res = await api<{ success: boolean; data: Array<{
    manual: string;
    section: string;
    snippet: string;
    slug: string;
    sectionId?: string;
    href?: string;
  }> }>(`/docs/search?q=${encodeURIComponent(q)}`, { method: "GET" });
  return { data: res.data?.data, error: res.error };
}

export interface AssistantPageContext {
  pathname?: string;
  label?: string;
  area?: string;
  role?: string;
  hints?: string[];
  learning?: {
    universeId?: string;
    universeTitle?: string;
    lessonId?: string;
    lessonTitle?: string;
    stepId?: string | null;
    stepTitle?: string | null;
    stepKind?: string | null;
    progressPercent?: number;
  };
}






