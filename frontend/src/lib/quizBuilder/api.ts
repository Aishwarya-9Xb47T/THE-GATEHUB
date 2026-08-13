import { api } from "@/lib/api";
import type { QuizEditorData, QuizListItem, QuizValidationResult } from "./types";

const BASE = "/quiz-builder";

export async function createEmptyQuiz(title?: string) {
  return api<{ success: boolean; data: { id: string; title: string } }>(BASE, {
    method: "POST",
    body: title ? { title } : {},
  });
}

export async function listMyQuizzes(params?: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return api<{ success: boolean; data: QuizListItem[] }>(`${BASE}/my-quizzes${qs ? `?${qs}` : ""}`);
}

export async function getQuizEditor(quizId: string) {
  return api<{ success: boolean; data: QuizEditorData }>(`${BASE}/${quizId}`);
}

export async function saveQuizEditor(quizId: string, body: Record<string, unknown>) {
  return api<{ success: boolean; data: QuizEditorData }>(`${BASE}/${quizId}`, { method: "PATCH", body });
}

export async function validateQuiz(quizId: string) {
  return api<{ success: boolean; data: QuizValidationResult }>(`${BASE}/${quizId}/validate`);
}

export async function duplicateQuiz(quizId: string) {
  return api<{ success: boolean; data: { id: string; title: string } }>(`${BASE}/${quizId}/duplicate`, {
    method: "POST",
  });
}

export async function archiveQuiz(quizId: string, archived: boolean) {
  return api(`${BASE}/${quizId}/archive`, { method: "POST", body: { archived } });
}

export async function deleteQuiz(quizId: string) {
  return api(`${BASE}/${quizId}`, { method: "DELETE" });
}

export async function listQuizVersions(quizId: string) {
  return api<{ success: boolean; data: Array<{ id: string; version: number; createdAt: string }> }>(
    `${BASE}/${quizId}/versions`
  );
}

export async function restoreQuizVersion(quizId: string, version: number) {
  return api<{ success: boolean; data: QuizEditorData }>(`${BASE}/${quizId}/versions/${version}/restore`, {
    method: "POST",
  });
}
