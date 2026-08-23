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

function basename(ref: string): string {
  return ref.replace(/\\/g, "/").replace(/[\r\n]+/g, "").split("?")[0].split("/").pop() || ref;
}

export function matchUniverseAsset(
  ref: string,
  assets?: UniverseAsset[]
): UniverseAsset | undefined {
  if (!ref || !assets?.length) return undefined;
  const original = ref.trim();
  const base = basename(original);
  return (
    assets.find((a) => a.filename === original) ||
    assets.find((a) => a.filename.toLowerCase() === original.toLowerCase()) ||
    assets.find((a) => a.filename === base) ||
    assets.find((a) => a.filename.toLowerCase() === base.toLowerCase()) ||
    assets.find((a) => a.storedFilename === original) ||
    assets.find((a) => a.storedFilename === base) ||
    assets.find((a) => a.storedFilename.toLowerCase() === base.toLowerCase()) ||
    assets.find((a) => basename(a.storedFilename).toLowerCase() === base.toLowerCase())
  );
}

function publicUniverseAssetUrl(universeId: string, storedFilename: string): string {
  const cleaned = storedFilename.replace(/^\/+/, "").replace(/^uploads\//, "");
  // Canonical pointer assets store durable keys like videos/<uuid>.mp4 (not a LU copy UUID).
  if (
    cleaned.includes("/") ||
    /^(videos|images|banners|pdfs|projects)\//i.test(cleaned)
  ) {
    return withUploadAuth(`${apiBase()}/uploads/${cleaned}`);
  }
  return withUploadAuth(`${apiBase()}/uploads/learning-universes/${universeId}/${cleaned}`);
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
  const originalRef = (ref || "").replace(/[\r\n]+/g, "").trim();
  if (!originalRef) {
    return { originalRef: "", resolvedUrl: "", status: "missing" };
  }

  // Prefer the published LearningUniverseAsset copy over gated /uploads/projects paths.
  if (universeId) {
    const matched = matchUniverseAsset(originalRef, assets);
    if (matched) {
      return {
        originalRef,
        resolvedUrl: publicUniverseAssetUrl(universeId, matched.storedFilename),
        status: "found",
      };
    }
  }

  const uploadUrl = normalizeUploadUrl(originalRef);
  if (uploadUrl) {
    return { originalRef, resolvedUrl: uploadUrl, status: "found" };
  }

  if (isRemoteUrl(originalRef)) {
    try {
      const parsed = new URL(originalRef);
      if (
        parsed.pathname.startsWith("/uploads/") &&
        (parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname === "0.0.0.0")
      ) {
        if (universeId) {
          const matched = matchUniverseAsset(parsed.pathname, assets);
          if (matched) {
            return {
              originalRef,
              resolvedUrl: publicUniverseAssetUrl(universeId, matched.storedFilename),
              status: "found",
            };
          }
        }
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

  return {
    originalRef,
    resolvedUrl: withUploadAuth(
      `${apiBase()}/api/learning-universes/${universeId}/assets/${encodeURIComponent(basename(originalRef))}`
    ),
    status: "missing",
  };
}
