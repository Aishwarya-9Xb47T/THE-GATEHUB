import { useUserStore } from "@/store/userStore";
import { apiUrl } from "@/lib/api";
import type { MediaKind, MediaUploadOptions } from "./types";

const IMAGE_TYPES = /^image\//;
const VIDEO_TYPES = /^video\//;
const AUDIO_TYPES = /^audio\//;

export function detectMediaKind(file: File): MediaKind {
  if (IMAGE_TYPES.test(file.type)) return "image";
  if (VIDEO_TYPES.test(file.type)) return "video";
  if (AUDIO_TYPES.test(file.type)) return "audio";
  // Fallback: check extension
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (/^(mp4|webm|mov|m4v|mkv|avi)$/.test(ext)) return "video";
  if (/^(mp3|wav|m4a|aac|ogg|flac)$/.test(ext)) return "audio";
  if (/^(png|jpe?g|gif|webp|svg|bmp|avif|ico|tiff?)$/.test(ext)) return "image";
  return "attachment";
}

export function isImageFile(file: File): boolean {
  return IMAGE_TYPES.test(file.type);
}

function parseUploadUrl(raw: string): string {
  // Already a relative path — use as-is
  if (raw.startsWith("/uploads/")) return raw;
  // Full URL — extract just the pathname if it's an uploads path
  try {
    const parsed = new URL(raw);
    if (parsed.pathname.startsWith("/uploads/")) return parsed.pathname;
  } catch {
    /* fall through */
  }
  // Relative without leading slash
  if (raw.startsWith("uploads/")) return `/${raw}`;
  return raw;
}

/** Single upload entry point for all quiz / assessment media. */
export function uploadMedia(file: File, options?: MediaUploadOptions): Promise<string> {
  const token = useUserStore.getState().token;
  // Use a single generic upload endpoint for all file types
  const endpoint = apiUrl("/api/upload");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && options?.onProgress) {
        options.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        try {
          const body = JSON.parse(xhr.responseText);
          reject(new Error(body.error || "Upload failed"));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
        return;
      }
      try {
        const result = JSON.parse(xhr.responseText);
        const raw = result.url || result.imageUrl;
        if (!raw) {
          reject(new Error("Upload succeeded but no URL returned"));
          return;
        }
        resolve(parseUploadUrl(raw));
      } catch {
        reject(new Error("Invalid upload response"));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

    xhr.open("POST", endpoint);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(formData);
  });
}

/** Build markdown with explicit alt tag so parser can identify block type regardless of URL extension. */
export function buildMarkdownForFile(url: string, file: File): string {
  const kind = detectMediaKind(file);
  switch (kind) {
    case "video":
      return `![video](${url})`;
    case "audio":
      return `![audio](${url})`;
    case "attachment":
      return `[Attachment](${url})`;
    default:
      return `![image](${url})`;
  }
}
