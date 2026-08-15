/** Resolve uploaded course media (PDF, images, videos) to a browser-loadable URL. */

import { apiUrl, getBackendOrigin } from "@/lib/api";

/** Strip tokens from URLs before logging. */
export function redactMediaUrl(url: string): string {
  try {
    const parsed = new URL(url, "https://placeholder.local");
    parsed.searchParams.delete("token");
    const q = parsed.searchParams.toString();
    const path = `${parsed.pathname}${q ? `?${q}` : ""}`;
    if (/^https?:\/\//i.test(url)) return `${parsed.origin}${path}`;
    return path;
  } catch {
    return url.split("?")[0];
  }
}

export async function loadAuthenticatedPdfBlob(url: string): Promise<string> {
  const fetchUrl = withUploadAuth(rewritePersistedMediaHost(url));
  console.log("[RESEARCH_PDF_URL]", redactMediaUrl(fetchUrl));
  // Query-token GET, no Authorization header — same CORS path as Academic Authoring PdfPreview.
  const res = await fetch(fetchUrl);
  if (!res.ok) {
    throw new Error(`PDF load failed: HTTP ${res.status}`);
  }
  const type = res.headers.get("content-type") || "";
  if (!type.includes("pdf") && !type.includes("octet-stream")) {
    throw new Error(`PDF load failed: expected application/pdf, got ${type || "unknown"}`);
  }
  const blob = await res.blob();
  if (blob.size < 128) {
    throw new Error(`PDF load failed: empty file (${blob.size} bytes)`);
  }
  const header = await blob.slice(0, 5).text();
  if (!header.startsWith("%PDF-")) {
    throw new Error("PDF load failed: response is not a PDF");
  }
  return URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
}

export function getAuthToken(): string | null {
  try {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const qToken = params.get("token");
      if (qToken) sessionStorage.setItem("lms_token", qToken);
    }
    return sessionStorage.getItem("lms_token") || localStorage.getItem("lms_token");
  } catch {
    return null;
  }
}

/** Fetch a gated /uploads asset with the app's JWT (Bearer + same-origin). */
export async function fetchAuthenticatedUpload(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const resolved = url.startsWith("http")
    ? url
    : url.startsWith("/api/")
      ? apiUrl(url)
      : url.startsWith("/")
        ? `${getBackendOrigin()}${url}`
        : `/${url}`;
  return fetch(resolved, {
    ...init,
    headers,
    credentials: init?.credentials ?? "same-origin",
  });
}

/** Append bearer as query token so <img>/<video> can load gated media routes. */
export function withUploadAuth(url: string): string {
  if (!url) return url;
  if (/^(data:|blob:)/i.test(url)) return url;
  if (!/^https?:\/\//i.test(url) && import.meta.env.PROD) {
    url = url.startsWith("/api/") ? apiUrl(url) : `${getBackendOrigin()}${url.startsWith("/") ? url : `/${url}`}`;
  }
  const token = getAuthToken();
  if (!token) return url;
  try {
    const absolute = url.startsWith("http")
      ? new URL(url)
      : new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    const needsAuth =
      /\/api\/learning-universes\/[^/]+\/assets\//i.test(absolute.pathname) ||
      (absolute.pathname.startsWith("/uploads/") &&
        !/^\/uploads\/(learning-universes|banners|public|resources|music)\//i.test(
          absolute.pathname
        ));
    if (!needsAuth) return url;
    if (absolute.searchParams.has("token")) return url;
    absolute.searchParams.set("token", token);
    if (url.startsWith("http")) return absolute.toString();
    return `${absolute.pathname}${absolute.search}${absolute.hash}`;
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}token=${encodeURIComponent(token)}`;
  }
}

/**
 * Prefer same-origin media URLs in the browser.
 * Rewrites absolute localhost / 127.0.0.1 / Vite-dev API hosts that were
 * accidentally persisted during authoring, without inventing a second content model.
 */
export function rewritePersistedMediaHost(url: string): string {
  if (!url?.trim()) return url;
  url = url.replace(/[\r\n]+/g, "").trim();
  if (/^(data:|blob:)/i.test(url)) return url;
  try {
    if (!/^https?:\/\//i.test(url)) return url;
    const parsed = new URL(url);
    const host = parsed.hostname;
    const isLocal =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.endsWith(".local");
    const isUploadOrApi =
      parsed.pathname.startsWith("/uploads/") || parsed.pathname.startsWith("/api/");
    // Drop persisted hosts (localhost or a stale Render URL) so playback/preview
    // uses the current API origin instead of iframing a dead backend.
    if (!isLocal && !isUploadOrApi) return url;
    if (isUploadOrApi) {
      const origin = getBackendOrigin() || (typeof window !== "undefined" ? window.location.origin : "");
      if (origin) {
        return `${origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    /* keep */
  }
  return url;
}

export function resolveCourseMediaUrl(src?: string | null): string | null {
  if (!src?.trim()) return null;
  const trimmed = rewritePersistedMediaHost(src.trim());

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.pathname.startsWith("/uploads/")) {
        const origin = getBackendOrigin() || parsed.origin;
        return withUploadAuth(`${origin}${parsed.pathname}${parsed.search}`);
      }
    } catch {
      /* keep original URL */
    }
    return trimmed;
  }

  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return trimmed;
  if (trimmed.startsWith("//")) return `${window.location.protocol}${trimmed}`;
  if (trimmed.startsWith("/")) {
    const resolved = trimmed.startsWith("/api/") ? apiUrl(trimmed) : `${getBackendOrigin()}${trimmed}`;
    return withUploadAuth(resolved);
  }

  return withUploadAuth(`${getBackendOrigin()}/uploads/${encodeURIComponent(trimmed)}`);
}

export function resolveLectureVideoUrl(
  videoUrl: string | null | undefined,
  videoType: string | null | undefined,
  lectureId?: string
): string | null {
  const trimmed = videoUrl?.trim() || "";

  let effectiveType = videoType?.toLowerCase().trim() || "";
  if (!effectiveType && trimmed) {
    if (trimmed.includes("youtu")) effectiveType = "youtube";
    else if (trimmed.includes("vimeo.com")) effectiveType = "vimeo";
    else if (trimmed.startsWith("/uploads/") || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(trimmed)) {
      effectiveType = "upload";
    }
  }

  if (effectiveType === "youtube" || effectiveType === "vimeo") {
    return trimmed || null;
  }

  if (trimmed) {
    const direct = resolveCourseMediaUrl(trimmed);
    if (direct) return direct;
  }

  if ((effectiveType === "upload" || !effectiveType) && lectureId) {
    return withUploadAuth(apiUrl(`/api/lectures/video/${lectureId}`));
  }

  return trimmed || null;
}
