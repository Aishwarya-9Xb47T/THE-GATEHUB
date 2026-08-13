import type { AiGeneratedQuestion } from "./types";
import type { CopilotIntent } from "./copilotTypes";
import { apiUrl } from "@/lib/api";

const BASE = "/assessment-studio";

export type CopilotProgressEvent =
  | { type: "stage"; message: string }
  | { type: "question_updated"; questionId: string; question: AiGeneratedQuestion; original?: AiGeneratedQuestion }
  | { type: "questions_replaced"; questions: AiGeneratedQuestion[] }
  | { type: "message"; text: string }
  | { type: "done"; summary: string; modifiedIds: string[] };

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("lms_token");
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function getAiJobStatus(jobId: string): Promise<{ data?: import("./types").AiJobStatusResponse; error?: string }> {
  const token = localStorage.getItem("lms_token");
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(apiUrl(`/api${BASE}/ai/jobs/${jobId}`), { headers });
    const json = (await res.json()) as { success: boolean; data: import("./types").AiJobStatusResponse; error?: string };
    if (res.status === 202 || res.status === 422 || res.ok) return { data: json.data };
    return { error: json.error || "Failed to load status" };
  } catch {
    return { error: "Backend unreachable" };
  }
}

export async function runCopilotCommand(
  jobId: string,
  command: string,
  questionIds?: string[]
): Promise<{
  data?: { questions: AiGeneratedQuestion[]; message: string; modifiedIds: string[] };
  error?: string;
}> {
  try {
    const res = await fetch(apiUrl(`/api${BASE}/ai/jobs/${jobId}/copilot`), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ command, questionIds, stream: false }),
    });
    const json = (await res.json()) as {
      success: boolean;
      data?: { questions: AiGeneratedQuestion[]; message: string; modifiedIds: string[] };
      error?: string;
    };
    if (!res.ok) return { error: json.error || "Copilot command failed" };
    return { data: json.data };
  } catch {
    return { error: "Backend unreachable" };
  }
}

export async function runCopilotAction(
  jobId: string,
  intent: CopilotIntent,
  questionIds?: string[]
): Promise<{
  data?: {
    questions: AiGeneratedQuestion[];
    message: string;
    modifiedIds: string[];
    comparisons?: Array<{ questionId: string; original: AiGeneratedQuestion; improved: AiGeneratedQuestion }>;
  };
  error?: string;
}> {
  try {
    const res = await fetch(apiUrl(`/api${BASE}/ai/jobs/${jobId}/copilot/action`), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ intent, questionIds }),
    });
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        questions: AiGeneratedQuestion[];
        message: string;
        modifiedIds: string[];
        comparisons?: Array<{ questionId: string; original: AiGeneratedQuestion; improved: AiGeneratedQuestion }>;
      };
      error?: string;
    };
    if (!res.ok) return { error: json.error || "Copilot action failed" };
    return { data: json.data };
  } catch {
    return { error: "Backend unreachable" };
  }
}

export async function streamCopilotCommand(
  jobId: string,
  command: string,
  questionIds: string[] | undefined,
  onEvent: (e: CopilotProgressEvent) => void
): Promise<{ error?: string }> {
  const token = localStorage.getItem("lms_token");
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(apiUrl(`/api${BASE}/ai/jobs/${jobId}/copilot`), {
      method: "POST",
      headers,
      body: JSON.stringify({ command, questionIds, stream: true }),
    });

    if (!res.ok || !res.body) {
      return { error: "Streaming failed" };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const payload = JSON.parse(line.slice(6)) as CopilotProgressEvent;
          onEvent(payload);
        } catch {
          /* skip malformed */
        }
      }
    }
    return {};
  } catch {
    return { error: "Backend unreachable" };
  }
}
