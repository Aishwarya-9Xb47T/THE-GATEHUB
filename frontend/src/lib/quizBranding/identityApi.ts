import { api } from "@/lib/api";
import type { QuizIdentity, TemplateMergeMode } from "./types";
import { identityToMetadata } from "./types";

export async function createQuizWithIdentity(identity: QuizIdentity, options?: { withPlaceholder?: boolean }) {
  console.log("[IDENTITY API] createQuizWithIdentity START");
  const body = {
    title: identity.title.trim() || "Untitled Quiz",
    description: identity.description.trim() || undefined,
    subject: identity.subject.trim() || undefined,
    visibility: identity.visibility,
    metadata: identityToMetadata(identity),
    withPlaceholder: options?.withPlaceholder ?? false,
  };
  console.log("[IDENTITY API] Request body:", JSON.stringify(body, null, 2));
  const result = await api<{ success: boolean; data: { id: string; title: string } }>("/quiz-builder", {
    method: "POST",
    body,
  });
  console.log("[IDENTITY API] Response:", JSON.stringify(result, null, 2));
  console.log("[IDENTITY API] createQuizWithIdentity END");
  return result;
}

export async function applyIdentityToQuiz(quizId: string, identity: QuizIdentity) {
  return api<{ success: boolean; data: { id: string } }>(`/quiz-builder/${quizId}/identity`, {
    method: "PATCH",
    body: {
      ...identityToMetadata(identity),
      title: identity.title.trim() || undefined,
      description: identity.description.trim() || undefined,
      subject: identity.subject.trim() || undefined,
      visibility: identity.visibility,
    },
  });
}

export async function useTemplateWithIdentity(
  templateId: string,
  identity: QuizIdentity,
  mode: TemplateMergeMode
) {
  return api<{ success: boolean; data: { quizId: string; templateId: string; title: string } }>(
    `/template-library/${templateId}/use`,
    {
      method: "POST",
      body: {
        mergeMode: mode,
        identity: identityToMetadata(identity),
        title: identity.title.trim(),
        description: identity.description.trim() || undefined,
        subject: identity.subject.trim() || undefined,
        visibility: identity.visibility,
      },
    }
  );
}

export async function duplicateQuizWithBranding(
  quizId: string,
  identity: QuizIdentity,
  keepOriginalBranding: boolean
) {
  return api<{ success: boolean; data: { id: string; title: string } }>(
    `/quiz-builder/${quizId}/duplicate`,
    {
      method: "POST",
      body: {
        keepOriginalBranding,
        identity: keepOriginalBranding ? undefined : identityToMetadata(identity),
        title: identity.title.trim() || undefined,
      },
    }
  );
}
