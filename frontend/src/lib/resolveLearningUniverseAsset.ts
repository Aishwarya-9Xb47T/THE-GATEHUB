/**
 * Resolve Learning Universe uploaded asset URLs for the student player.
 */

import { mediaApiBase } from "@/lib/latexEditor/projectAssetResolver";
import { withUploadAuth } from "@/lib/courseMediaUrls";

export interface UniverseAsset {
  filename: string;
  storedFilename: string;
}

export interface ResolvedAsset {
  originalRef: string;
  resolvedUrl: string;
  status: "found" | "missing" | "remote";
}

function apiBase(): string {
  return mediaApiBase();
}

function isRemoteUrl(value: string): boolean {
  return /^(https?:\/\/|data:|blob:)/i.test(value);
}

function normalizeUploadUrl(ref: string): string | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/uploads/")) return withUploadAuth(`${apiBase()}${trimmed}`);
  if (trimmed.startsWith("uploads/")) return withUploadAuth(`${apiBase()}/${trimmed}`);
  return null;
}

export function resolveLearningUniverseAsset(
  ref: string | undefined | null,
  universeId: string | undefined,
  assets?: UniverseAsset[]
): ResolvedAsset {
  const originalRef = (ref || "").trim();
  if (!originalRef) {
    return { originalRef: "", resolvedUrl: "", status: "missing" };
  }

  const uploadUrl = normalizeUploadUrl(originalRef);
  if (uploadUrl) {
    return { originalRef, resolvedUrl: uploadUrl, status: "found" };
  }

  if (isRemoteUrl(originalRef)) {
    // Project publish may store absolute localhost URLs — rewrite to current API/origin.
    try {
      const parsed = new URL(originalRef);
      if (
        parsed.pathname.startsWith("/uploads/") &&
        (parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname === "0.0.0.0")
      ) {
        const remoteUpload = normalizeUploadUrl(parsed.pathname);
        if (remoteUpload) {
          return { originalRef, resolvedUrl: remoteUpload, status: "found" };
        }
      }
    } catch {
      /* fall through */
    }
    const remoteUpload = normalizeUploadUrl(originalRef.replace(/^https?:\/\/[^/]+/i, ""));
    if (remoteUpload) {
      return { originalRef, resolvedUrl: remoteUpload, status: "found" };
    }
    return { originalRef, resolvedUrl: originalRef, status: "remote" };
  }

  if (!universeId) {
    return { originalRef, resolvedUrl: "", status: "missing" };
  }

  const base = originalRef.replace(/\\/g, "/").split("/").pop() || originalRef;
  const asset =
    assets?.find((a) => a.filename === originalRef) ||
    assets?.find((a) => a.filename.toLowerCase() === originalRef.toLowerCase()) ||
    assets?.find((a) => a.filename === base) ||
    assets?.find((a) => a.filename.toLowerCase() === base.toLowerCase());

  if (asset) {
    return {
      originalRef,
      resolvedUrl: withUploadAuth(
        `${apiBase()}/uploads/learning-universes/${universeId}/${asset.storedFilename}`
      ),
      status: "found",
    };
  }

  return {
    originalRef,
    resolvedUrl: withUploadAuth(
      `${apiBase()}/api/learning-universes/${universeId}/assets/${encodeURIComponent(base)}`
    ),
    status: "missing",
  };
}
