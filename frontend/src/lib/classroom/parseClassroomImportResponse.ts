export type ClassroomImportPayload = {
  type?: string;
  success?: boolean;
  presentationId?: string;
  id?: string;
  presentation?: { id?: string };
  error?: { code?: string; message?: string; presentationId?: string; reason?: string; method?: string } | string;
  overallStatus?: string;
  code?: string;
  slideCount?: number;
  slidesSucceeded?: number;
  extractionWarnings?: unknown[];
  warnings?: unknown[];
  [key: string]: unknown;
};

/** Last NDJSON `result` line only. Ignore progress and error.presentationId. */
export function parseClassroomImportNdjson(text: string): ClassroomImportPayload {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let data: ClassroomImportPayload = {};
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as ClassroomImportPayload;
      if (!parsed || typeof parsed !== "object") continue;
      if (parsed.type === "progress") continue;
      if (parsed.type === "result" || parsed.success === true || parsed.success === false) {
        data = parsed;
      }
    } catch {
      /* partial NDJSON line */
    }
  }
  return data;
}

/** Canonical DB presentation id from a successful create/import payload. */
export function classroomImportPresentationId(payload: ClassroomImportPayload | null | undefined): string | null {
  if (!payload || payload.success === false) return null;
  if (payload.error && payload.success !== true) return null;
  const id =
    (typeof payload.presentationId === "string" && payload.presentationId) ||
    (typeof payload.presentation?.id === "string" && payload.presentation.id) ||
    null;
  return id || null;
}

export function classroomImportErrorMessage(payload: ClassroomImportPayload | null | undefined, httpStatus?: number): string {
  const error = payload?.error;
  const code =
    (error && typeof error === "object" && error.code) ||
    (typeof payload?.code === "string" ? payload.code : undefined);
  if (code === "CLASSROOM_B2_VERIFY_FAILED" || code === "CLASSROOM_B2_UPLOAD_FAILED") {
    return "PowerPoint upload verification failed. Please retry.";
  }
  const raw =
    typeof error === "string"
      ? error
      : error?.message || error?.reason || error?.code;
  if (payload?.error && typeof payload.error === "object" && payload.error.code && raw && !String(raw).includes(payload.error.code)) {
    return `${payload.error.code}: ${raw}`;
  }
  if (raw) return String(raw);
  if (httpStatus === 413 || payload?.code === "CLASSROOM_PPTX_TOO_LARGE") {
    return "This PowerPoint is too large. Use a .pptx smaller than 100 MB.";
  }
  if (httpStatus === 502 || httpStatus === 504 || httpStatus === 524) {
    return "The server timed out while importing. Try again; if the file is large, compress images first.";
  }
  if (httpStatus && httpStatus >= 400) return `Import failed (HTTP ${httpStatus}).`;
  return "Failed to import PowerPoint file";
}

export function unwrapClassroomPresentation(data: unknown): { id: string; slides: unknown[]; [key: string]: unknown } | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const candidate =
    rec.slides && rec.id
      ? rec
      : rec.presentation && typeof rec.presentation === "object"
        ? (rec.presentation as Record<string, unknown>)
        : null;
  if (!candidate || typeof candidate.id !== "string" || !candidate.id) return null;
  if (!Array.isArray(candidate.slides)) return null;
  return candidate as { id: string; slides: unknown[]; [key: string]: unknown };
}
