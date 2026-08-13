import type { AiQuizDesignerState } from "./types";
import { pollAiJob, startAiGeneration, commitAiToQuiz } from "@/lib/aiAssessmentStudio/api";
import type { AiAssessmentConfig, AiSourceType } from "@/lib/aiAssessmentStudio/types";
import { compositionTotal, resolvedLevel, resolvedSubject } from "./defaultState";
import { api } from "@/lib/api";
import { saveQuizAsTemplate } from "@/lib/templateLibrary/api";

function mapPrimarySource(state: AiQuizDesignerState): {
  source: AiSourceType;
  text?: string;
  url?: string;
  file?: File;
} {
  const order: AiSourceType[] = ["pdf", "docx", "pptx", "image", "notes", "syllabus", "youtube", "website", "text", "topic"];
  for (const s of order) {
    if (!state.contentSources.includes(s)) continue;
    if (s === "topic") return { source: "topic", text: state.topicDetail };
    if (s === "text") return { source: "text", text: state.pastedText };
    if (s === "website") return { source: "website", url: state.websiteUrl };
    if (s === "youtube") return { source: "youtube", url: state.youtubeUrl };
    const file = state.files[0];
    if (file) return { source: s as AiSourceType, file };
  }
  return { source: "topic", text: state.topicDetail || state.title };
}

function buildConfig(state: AiQuizDesignerState): AiAssessmentConfig {
  const types = Object.entries(state.composition)
    .filter(([, n]) => n > 0)
    .map(([t]) => t);

  const bloomDominant = Object.entries(state.bloomDistribution).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Apply";

  return {
    quizName: state.title,
    subject: resolvedSubject(state),
    topic: state.topicDetail || state.pastedText || state.title,
    targetAudience: resolvedLevel(state),
    examType: state.purposes[0],
    difficulty: state.difficulty === "mixed" ? "medium" : state.difficulty,
    questionCount: state.questionCount,
    questionTypes: types.length ? types : ["multiple_choice"],
    questionTypeDistribution: { ...state.composition },
    bloomLevel: bloomDominant,
    bloomDistribution: { ...state.bloomDistribution },
    generateExplanations: state.contentOptions.explanations !== false,
    generateHints: state.contentOptions.hints !== false,
    generateTags: true,
    shuffleQuestions: state.rules.randomizeQuestions,
    shuffleOptions: state.rules.randomizeOptions,
    negativeMarking: state.rules.negativeMarking,
    estimatedMinutes: Math.ceil(state.questionCount * 1.3),
    learningOutcome: state.purposes.join(", "),
    difficultyMix:
      state.difficulty === "mixed"
        ? {
            easy: state.difficultyMix.easy,
            medium: state.difficultyMix.medium,
            hard: state.difficultyMix.hard,
            expert: 0,
          }
        : undefined,
  };
}

export async function startDesignerGeneration(
  state: AiQuizDesignerState,
  onProgress?: (message: string) => void
) {
  const { source, text, url, file } = mapPrimarySource(state);
  const config = buildConfig(state);

  onProgress?.("Starting AI pipeline…");
  const start = await startAiGeneration({ source, config, file, url, text });
  if (start.error || !start.jobId) {
    return { error: start.error?.message || "Failed to start generation" };
  }

  const polled = await pollAiJob(start.jobId, (p) => onProgress?.(p?.message || "Generating…"));
  if (!polled.ok) {
    return { error: polled.error.message || "Generation failed" };
  }

  return { jobId: start.jobId, preview: polled.preview };
}

export async function commitDesignerQuiz(
  jobId: string,
  state: AiQuizDesignerState,
  questions: import("@/lib/aiAssessmentStudio/types").AiGeneratedQuestion[],
  saveAs: "quiz" | "template" | "both"
) {
  const selected = questions.filter((q) => q.selected !== false);
  const commit = await commitAiToQuiz(jobId, state.title, { questions: selected });
  if (commit.error || !commit.data?.quizId) {
    return { error: commit.error || "Failed to save quiz" };
  }

  let templateId: string | undefined;
  if (saveAs === "template" || saveAs === "both") {
    const tpl = await saveQuizAsTemplate({
      quizId: commit.data.quizId,
      title: `${state.title} (AI Template)`,
      description: `AI-designed ${resolvedSubject(state)} assessment`,
      category: state.purposes[0] || "Training",
      subject: resolvedSubject(state),
      gradeLevel: resolvedLevel(state),
      difficulty: state.difficulty === "mixed" ? "medium" : state.difficulty,
      tags: ["ai-designed", ...state.purposes.map((p) => p.toLowerCase().replace(/\s+/g, "-"))],
      visibility: "private",
    });
    if (!tpl.error) templateId = tpl.data?.data?.id;
  }

  return { quizId: commit.data.quizId, templateId };
}

export async function logDesignerAnalytics(event: string, meta?: Record<string, unknown>) {
  try {
    await api("/ai-quiz-designer/analytics", { method: "POST", body: { event, meta } });
  } catch {
    /* non-blocking */
  }
}

export function canGenerate(state: AiQuizDesignerState): boolean {
  if (!state.title.trim() || !resolvedSubject(state).trim()) return false;
  if (state.purposes.length === 0) return false;
  if (compositionTotal(state.composition) !== state.questionCount) return false;
  if (state.contentSources.includes("topic") && !state.topicDetail.trim() && !state.pastedText.trim()) return false;
  return true;
}
