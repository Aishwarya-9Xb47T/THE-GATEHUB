import type {
  AiAssessmentConfig,
  AiGenerationPreview,
  AiJobStatusResponse,
  AiSourceType,
  AiGeneratedQuestion,
} from "./types";
import type { AiErrorPayload } from "./ApiError";
import { parseApiError } from "./ErrorMapper";

const BASE = "/assessment-studio";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type PollResult =
  | { ok: true; preview: AiGenerationPreview; demoNotice?: AiErrorPayload }
  | { ok: false; error: AiErrorPayload };

function parseJobFailure(data: AiJobStatusResponse): AiErrorPayload {
  if (data.errorDetails) return data.errorDetails as AiErrorPayload;
  return parseApiError(data.error || "Generation failed");
}

export async function startAiGeneration(params: {
  source: AiSourceType;
  config: AiAssessmentConfig;
  file?: File;
  url?: string;
  text?: string;
}): Promise<{ jobId?: string; error?: AiErrorPayload }> {
  const formData = new FormData();
  formData.append("source", params.source);
  formData.append("config", JSON.stringify(params.config));
  if (params.file) formData.append("file", params.file, params.file.name);
  if (params.url) formData.append("url", params.url);
  if (params.text) formData.append("text", params.text);

  const token = localStorage.getItem("lms_token");
  const headers: HeadersInit = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`/api${BASE}/ai/generate-assessment`, { method: "POST", headers, body: formData });
    const json = (await res.json()) as {
      success: boolean;
      data?: { jobId: string };
      error?: string | AiErrorPayload;
    };
    if (res.status !== 202 || !json.data?.jobId) {
      return { error: parseApiError(json.error || "Failed to start AI generation") };
    }
    return { jobId: json.data.jobId };
  } catch {
    return {
      error: parseApiError("network: Unable to connect to the server. Check that the backend is running on port 5000."),
    };
  }
}

export async function getAiJobStatus(jobId: string): Promise<{ data?: AiJobStatusResponse; error?: AiErrorPayload }> {
  const token = localStorage.getItem("lms_token");
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`/api${BASE}/ai/jobs/${jobId}`, { headers });
    const json = (await res.json()) as {
      success: boolean;
      data: AiJobStatusResponse;
      error?: string | AiErrorPayload;
    };
    if (res.status === 202 || res.status === 422 || res.ok) return { data: json.data };
    return { error: parseApiError(json.error || "Failed to load status") };
  } catch {
    return { error: parseApiError("network: Backend unreachable") };
  }
}

export async function pollAiJob(
  jobId: string,
  onProgress?: (p: AiJobStatusResponse["progress"]) => void,
  signal?: AbortSignal
): Promise<PollResult> {
  for (let i = 0; i < 180; i++) {
    if (signal?.aborted) {
      return { ok: false, error: parseApiError("aborted") };
    }
    await sleep(i < 3 ? 500 : 900);
    const res = await getAiJobStatus(jobId);
    if (res.error && !res.data) return { ok: false, error: res.error };
    const d = res.data;
    if (d?.status === "processing") {
      if (d.progress) onProgress?.(d.progress);
      continue;
    }
    if (d?.status === "ready" && d.preview) {
      return {
        ok: true,
        preview: d.preview,
        demoNotice:
          d.preview.demoMode && d.preview.aiNotice?.title !== "Development Mode"
            ? d.preview.aiNotice
            : undefined,
      };
    }
    if (d?.status === "failed") {
      return { ok: false, error: parseJobFailure(d) };
    }
  }
  return {
    ok: false,
    error: parseApiError("timeout: AI generation timed out. Try again with fewer questions."),
  };
}

export async function commitAiToQuiz(
  jobId: string,
  title: string,
  options?: { questionIds?: string[]; questions?: AiGeneratedQuestion[] }
) {
  const token = localStorage.getItem("lms_token");
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(`/api${BASE}/ai/jobs/${jobId}/commit-quiz`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        title,
        questionIds: options?.questionIds,
        questions: options?.questions,
      }),
    });
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        quizId: string;
        quizTitle: string;
        imported: number;
        editor?: import("@/lib/quizBuilder/types").QuizEditorData;
      };
      error?: string | { message?: string };
    };
    if (!res.ok) {
      const err =
        typeof json.error === "string"
          ? json.error
          : json.error?.message || "Failed to save quiz. Is the backend running?";
      return { error: err };
    }
    return { data: json.data };
  } catch (err: any) {
    if (err instanceof Error && err.name === "AbortError") {
      return { error: "Request timed out. Check that the backend is running on port 5000." };
    }
    return { error: "Could not reach the server. Restart the backend and try again." };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function fillRemainingQuestions(jobId: string) {
  const token = localStorage.getItem("lms_token");
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`/api${BASE}/ai/jobs/${jobId}/fill-remaining`, { method: "POST", headers });
    const json = (await res.json()) as {
      success: boolean;
      data?: { preview: AiGenerationPreview };
      error?: string | AiErrorPayload;
    };
    if (!res.ok || !json.data?.preview) {
      return { error: parseApiError(json.error || "Failed to generate remaining questions") };
    }
    return { preview: json.data.preview };
  } catch {
    return { error: parseApiError("network: Backend unreachable") };
  }
}
