import { api } from "@/lib/api";
import type { QuizTemplateDetail, QuizTemplateSummary, TemplateListResponse } from "./types";

function buildQuery(params?: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") search.set(k, String(v));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export async function listTemplateLibrary(params?: Record<string, string | number | boolean | undefined>) {
  return api<{ success: boolean; data: TemplateListResponse }>(`/template-library${buildQuery(params)}`);
}

export async function getTemplateLibraryItem(id: string) {
  return api<{ success: boolean; data: QuizTemplateDetail }>(`/template-library/${id}`);
}

export async function useTemplateLibraryItem(id: string, body?: Record<string, unknown>) {
  return api<{ success: boolean; data: { quizId: string; templateId: string; title: string } }>(
    `/template-library/${id}/use`,
    { method: "POST", body: body ?? {} }
  );
}

export async function duplicateTemplateLibraryItem(id: string) {
  return api<{ success: boolean; data: QuizTemplateSummary }>(`/template-library/${id}/duplicate`, {
    method: "POST",
  });
}

export async function favoriteTemplateLibraryItem(id: string) {
  return api<{ success: boolean; data: { favorited: boolean } }>(`/template-library/${id}/favorite`, {
    method: "POST",
  });
}

export async function saveQuizAsTemplate(body: {
  quizId: string;
  title: string;
  description?: string;
  category: string;
  subject?: string;
  gradeLevel?: string;
  difficulty?: string;
  tags?: string[];
  visibility?: string;
}) {
  return api<{ success: boolean; data: QuizTemplateSummary }>("/template-library/save", {
    method: "POST",
    body,
  });
}

export async function deleteTemplateLibraryItem(id: string) {
  return api<{ success: boolean }>(`/template-library/${id}`, { method: "DELETE" });
}

export async function getTemplateCategories() {
  return api<{ success: boolean; data: string[] }>("/template-library/categories");
}

export async function generateAiTemplate(body: Record<string, unknown>) {
  return api<{ success: boolean; data: { templateId?: string; quizId?: string; preview?: unknown; partial?: boolean } }>(
    "/template-library/ai/generate",
    { method: "POST", body }
  );
}

export async function fillRemainingAiTemplate(body: {
  input: Record<string, unknown>;
  questions: import("@/lib/aiAssessmentStudio/types").AiGeneratedQuestion[];
}) {
  return api<{
    success: boolean;
    data: {
      questions: import("@/lib/aiAssessmentStudio/types").AiGeneratedQuestion[];
      partial?: boolean;
      preview?: { questions: import("@/lib/aiAssessmentStudio/types").AiGeneratedQuestion[]; summary?: Record<string, unknown> };
    };
  }>("/template-library/ai/fill-remaining", { method: "POST", body });
}
