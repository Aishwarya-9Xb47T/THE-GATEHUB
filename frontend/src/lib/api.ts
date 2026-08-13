const API_BASE = "/api";
export const API_BASE_URL = "/api";

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
  const sanitizedBody = body !== undefined ? sanitizePayload(body) : undefined;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  
  try {
    const res = await fetch(`${API_BASE}${path}`, {
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
          if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
            window.location.href = `/login?from=${encodeURIComponent(window.location.pathname)}`;
          }
        }
      }
      // Preserve full JSON body (logs, errors, etc.) for compile and similar endpoints
      return { data: json as T, error: errorMessage };
    }
    return { data: json as T };
  } catch (err: any) {
    console.error("API Call failed:", err);
    if (err.message === "Failed to fetch") {
      return { error: "Backend server is unreachable. Please ensure the backend is running on port 5000." };
    }
    return { error: err.message || "Network error occurred. Please check your connection." };
  }
}

export async function apiFormData<T>(path: string, formData: FormData): Promise<{
  data?: T;
  error?: string;
  importError?: { message?: string; code?: string; suggestion?: string; supportId?: string; retryable?: boolean };
}> {
  const token = getToken();
  const headers: HeadersInit = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: formData });
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
          localStorage.removeItem("lms_token");
          if (!window.location.pathname.startsWith("/login")) {
            window.location.href = "/login";
          }
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
    const res = await fetch(`${API_BASE}/docs/assistant/stream`, {
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






