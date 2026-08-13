/** Resolve uploaded course media (PDF, images, videos) to a browser-loadable URL. */

import { apiUrl, getBackendOrigin } from "@/lib/api";

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
      absolute.pathname.startsWith("/uploads/") ||
      /\/api\/learning-universes\/[^/]+\/assets\//i.test(absolute.pathname);
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
    if (!isLocal) return url;
    if (parsed.pathname.startsWith("/uploads/") || parsed.pathname.startsWith("/api/")) {
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
