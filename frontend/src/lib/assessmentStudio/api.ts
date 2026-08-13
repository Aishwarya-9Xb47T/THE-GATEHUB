import { api, apiFormData, apiUrl } from "@/lib/api";
import type {
  BankCollection,
  BankQuestion,
  ImportErrorPayload,
  ImportJobStatus,
  ImportPreview,
  ImportSourceType,
  StudioDashboard,
} from "./types";

const BASE = "/assessment-studio";

export async function getStudioDashboard() {
  return api<{ success: boolean; data: StudioDashboard }>(`${BASE}/dashboard`);
}

export async function listBankQuestions(params?: Record<string, string | number>) {
  const qs = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    });
  }
  const query = qs.toString();
  return api<{
    success: boolean;
    data: { items: BankQuestion[]; total: number; page: number; pages: number };
  }>(`${BASE}/questions${query ? `?${query}` : ""}`);
}

export async function getBankQuestion(id: string) {
  return api<{ success: boolean; data: BankQuestion }>(`${BASE}/questions/${id}`);
}

export async function createBankQuestion(body: Record<string, unknown>) {
  return api<{ success: boolean; data: BankQuestion }>(`${BASE}/questions`, { method: "POST", body });
}

export async function updateBankQuestion(id: string, body: Record<string, unknown>) {
  return api<{ success: boolean; data: BankQuestion }>(`${BASE}/questions/${id}`, { method: "PATCH", body });
}

export async function deleteBankQuestion(id: string) {
  return api<{ success: boolean }>(`${BASE}/questions/${id}`, { method: "DELETE" });
}

export async function bulkUpdateQuestionStatus(ids: string[], status: string) {
  return api(`${BASE}/questions/bulk-status`, { method: "POST", body: { ids, status } });
}

export async function migrateCourseQuizzes(courseId?: string) {
  return api<{ success: boolean; data: { imported: number; skipped: number } }>(`${BASE}/migrate`, {
    method: "POST",
    body: courseId ? { courseId } : {},
  });
}

export async function materializeQuizFromBank(title: string, questionIds: string[], courseId?: string) {
  return api<{ success: boolean; data: { id: string; title: string } }>(`${BASE}/materialize-quiz`, {
    method: "POST",
    body: { title, questionIds, courseId },
  });
}

export async function generateAIQuestions(body: {
  topic: string;
  difficulty?: string;
  bloomLevel?: string;
  type?: string;
  count?: number;
}) {
  return api<{ success: boolean; data: BankQuestion[] }>(`${BASE}/ai/generate`, { method: "POST", body });
}

export async function submitQuestionForReview(id: string) {
  return api(`${BASE}/questions/${id}/submit-review`, { method: "POST" });
}

export async function approveQuestion(id: string) {
  return api(`${BASE}/questions/${id}/approve`, { method: "POST" });
}

export async function listCollections() {
  return api<{ success: boolean; data: BankCollection[] }>(`${BASE}/collections`);
}

export async function createCollection(body: {
  name: string;
  description?: string;
  kind?: string;
  isTemplate?: boolean;
  templateType?: string;
}) {
  return api<{ success: boolean; data: BankCollection }>(`${BASE}/collections`, { method: "POST", body });
}

export async function getCollection(id: string) {
  return api<{ success: boolean; data: unknown }>(`${BASE}/collections/${id}`);
}

export async function addQuestionsToCollection(collectionId: string, questionIds: string[]) {
  return api(`${BASE}/collections/${collectionId}/items`, { method: "POST", body: { questionIds } });
}

export async function getImportJobStatus(jobId: string) {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("lms_token") : null;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  console.log(`[frontend][api] === GET IMPORT JOB STATUS ===`);
  console.log(`[frontend][api] JobId: ${jobId}`);
  console.log(`[frontend][api] Token: ${token ? 'present' : 'missing'}`);

  try {
    const res = await fetch(apiUrl(`/api${BASE}/import/jobs/${jobId}`), { headers });
    const json = (await res.json()) as {
      success: boolean;
      data: ImportJobStatus;
      importError?: ImportErrorPayload;
      error?: string;
    };

    console.log(`[frontend][api] Response status: ${res.status}`);
    console.log(`[frontend][api] Response JSON:`, json);

    if (res.status === 202 || res.status === 422 || res.ok) {
      console.log(`[frontend][api] Returning data:`, json);
      return { data: json };
    }
    console.error(`[frontend][api] Unexpected status: ${res.status}`);
    return { error: json.error || json.importError?.message || "Failed to load import status" };
  } catch (err: any) {
    console.error(`[frontend][api] Fetch error:`, err);
    return { error: "Backend server is unreachable. Please ensure the backend is running on port 5000." };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function analyzeImportSource(params: {
  source: ImportSourceType;
  file?: File;
  url?: string;
  text?: string;
  onProgress?: (progress: ImportJobStatus["progress"]) => void;
}): Promise<{ data?: { success: boolean; data: ImportPreview }; error?: string; importError?: ImportErrorPayload }> {
  console.log(`[frontend][api] === ANALYZE IMPORT SOURCE ===`);
  console.log(`[frontend][api] Source: ${params.source}`);
  console.log(`[frontend][api] File: ${params.file?.name || 'none'}`);
  console.log(`[frontend][api] URL: ${params.url || 'none'}`);
  console.log(`[frontend][api] Text length: ${params.text?.length || 0}`);

  const formData = new FormData();
  formData.append("source", params.source);
  if (params.file) formData.append("file", params.file, params.file.name);
  if (params.url) formData.append("url", params.url);
  if (params.text) formData.append("text", params.text);

  const token = typeof localStorage !== "undefined" ? localStorage.getItem("lms_token") : null;
  const headers: HeadersInit = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let jobId: string;
  try {
    console.log(`[frontend][api] POST to /api${BASE}/import/analyze`);
    const res = await fetch(apiUrl(`/api${BASE}/import/analyze`), { method: "POST", headers, body: formData });
    const json = (await res.json()) as {
      success: boolean;
      data?: { jobId: string };
      error?: string;
      importError?: ImportErrorPayload;
    };

    console.log(`[frontend][api] Analyze response status: ${res.status}`);
    console.log(`[frontend][api] Analyze response:`, json);

    if (res.status !== 202 || !json.data?.jobId) {
      console.error(`[frontend][api] Analyze failed:`, json);
      return {
        error: json.importError?.message || json.error || "Failed to start import",
        importError: json.importError,
      };
    }
    jobId = json.data.jobId;
    console.log(`[frontend][api] Job started with ID: ${jobId}`);
  } catch (err: any) {
    console.error(`[frontend][api] Analyze fetch error:`, err);
    return { error: "Backend server is unreachable. Please ensure the backend is running on port 5000." };
  }
  params.onProgress?.({ stage: "uploading", percent: 5, message: "Uploading content…" });

  console.log(`[frontend][api] Starting polling loop for job ${jobId}`);
  console.time(`[frontend][api] Total polling time`);
  for (let attempt = 0; attempt < 240; attempt++) {
    await sleep(attempt < 3 ? 400 : 800);
    if (attempt % 10 === 0) console.log(`[frontend][api] Poll attempt ${attempt + 1}/240`);
    const statusRes = await getImportJobStatus(jobId);

    if (statusRes.error && !statusRes.data) {
      console.error(`[frontend][api] Polling error:`, statusRes.error);
      console.timeEnd(`[frontend][api] Total polling time`);
      return { error: statusRes.error };
    }

    const payload = statusRes.data;
    const status = payload?.data;

    console.log(`[frontend][api] Job status: ${status?.status}`);
    console.log(`[frontend][api] Progress stage: ${status?.progress?.stage}`);
    console.log(`[frontend][api] Progress percent: ${status?.progress?.percent}`);

    if (status?.status === "processing") {
      if (status.progress) params.onProgress?.(status.progress);
      continue;
    }

    if (status?.status === "ready" && status.preview) {
      console.log(`[frontend][api] === IMPORT READY ===`);
      console.log(`[frontend][api] Preview questions count: ${status.preview.questions.length}`);
      console.log(`[frontend][api] Preview summary:`, status.preview.summary);
      console.log(`[frontend][api] Preview validation issues:`, status.preview.validationIssues);
      console.timeEnd(`[frontend][api] Total polling time`);
      params.onProgress?.({ stage: "completed", percent: 100, message: "Import complete" });
      return { data: { success: true, data: status.preview } };
    }

    if (status?.status === "failed") {
      console.error(`[frontend][api] === IMPORT FAILED ===`);
      console.error(`[frontend][api] Error:`, status.error);
      console.error(`[frontend][api] ImportError:`, status.importError);
      console.timeEnd(`[frontend][api] Total polling time`);
      const imp = payload?.importError || status.importError;
      return {
        error: imp?.message || payload?.error || status.error || "Import failed",
        importError: imp,
      };
    }

    console.warn(`[frontend][api] Unexpected status: ${status?.status}, continuing to poll...`);
  }

  console.error(`[frontend][api] === IMPORT TIMEOUT ===`);
  console.timeEnd(`[frontend][api] Total polling time`);
  return {
    error: "Import timed out.",
    importError: {
      code: "UNKNOWN",
      message: "Import timed out.",
      suggestion: "Try a smaller file or split your content into parts.",
      supportId: "",
      retryable: true,
    },
  };
}

export async function getImportPreview(jobId: string) {
  return getImportJobStatus(jobId);
}

export async function updateImportPreview(jobId: string, questions: ImportPreview["questions"]) {
  return api<{ success: boolean; data: ImportPreview }>(`${BASE}/import/jobs/${jobId}`, {
    method: "PATCH",
    body: { questions },
  });
}

export async function commitImport(jobId: string, options?: { questionIds?: string[]; skipDuplicates?: boolean }) {
  return api<{ success: boolean; data: { imported: number; skipped: number; questionIds: string[] } }>(
    `${BASE}/import/jobs/${jobId}/commit`,
    { method: "POST", body: options || {} }
  );
}

export async function commitImportAsQuiz(
  jobId: string,
  title: string,
  options?: { questionIds?: string[]; skipDuplicates?: boolean; targetQuizId?: string }
) {
  return api<{
    success: boolean;
    data: { imported: number; skipped: number; questionIds: string[]; quizId: string; quizTitle: string };
  }>(`${BASE}/import/jobs/${jobId}/commit-as-quiz`, {
    method: "POST",
    body: { title, ...options },
  });
}

export async function getGoogleImportStatus() {
  return api<{ success: boolean; data: { connected: boolean; configured: boolean; email?: string } }>(
    `${BASE}/import/google/status`
  );
}

export async function getGoogleImportConnectUrl(returnTo?: string) {
  const qs = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
  return api<{ success: boolean; data: { url: string } }>(`${BASE}/import/google/connect${qs}`);
}
