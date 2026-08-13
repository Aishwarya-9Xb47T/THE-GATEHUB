import { prisma } from "../../utils/prisma.js";
import { AppError } from "../../middlewares/errorHandler.js";
import {
  generateAssessment,
  generateRemainingQuestions,
  validateQuizGenerationConfiguration,
  buildGenerationCoverage,
} from "../assessmentGeneration/assessmentGenerationService.js";
import { buildTopicContent } from "../assessmentStudio/aiAssessment/aiAssessmentGenerator.js";
import type { AiAssessmentConfig, AiGeneratedQuestion } from "../assessmentStudio/aiAssessment/types.js";
import { DEFAULT_LIVE_SESSION_SETTINGS, type LiveSessionSettings } from "../liveSession/types.js";

export interface AiTemplateWizardInput {
  title: string;
  subject: string;
  description?: string;
  audience: string;
  difficulty: string;
  questionCount: number;
  composition: Record<string, number>;
  bloomLevel: string;
  media: {
    images?: boolean;
    diagrams?: boolean;
    tables?: boolean;
    formulas?: boolean;
    codeSnippets?: boolean;
    explanations?: boolean;
    hints?: boolean;
    references?: boolean;
  };
  modes: string[];
  timerMode: "per_question" | "whole_quiz" | "none";
  scoring: {
    mode: string;
    negativeMarking?: boolean;
    xp?: boolean;
    leaderboard?: boolean;
  };
  saveAs: "template" | "quiz" | "both";
  category?: string;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildAiConfig(input: AiTemplateWizardInput): AiAssessmentConfig {
  const types = Object.entries(input.composition)
    .filter(([, n]) => n > 0)
    .map(([t]) => t);

  return {
    quizName: input.title,
    subject: input.subject,
    topic: input.description || input.subject,
    targetAudience: input.audience,
    difficulty: input.difficulty === "mixed" ? "medium" : input.difficulty,
    questionCount: input.questionCount,
    questionTypes: types.length ? types : ["multiple_choice"],
    questionTypeDistribution: { ...input.composition },
    bloomLevel: input.bloomLevel,
    generateExplanations: input.media.explanations !== false,
    generateHints: input.media.hints !== false,
    generateTags: true,
    negativeMarking: input.scoring.negativeMarking,
    estimatedMinutes: input.timerMode === "whole_quiz" ? Math.ceil(input.questionCount * 1.5) : undefined,
    tone: "academic",
    language: "en",
  };
}

async function generateQuestions(input: AiTemplateWizardInput): Promise<{
  questions: AiGeneratedQuestion[];
  partial: boolean;
  coverage: ReturnType<typeof buildGenerationCoverage>;
}> {
  const config = buildAiConfig(input);
  const content = buildTopicContent(config, input.description);
  const result = await generateAssessment(content, config);
  return {
    questions: result.questions.map((q) => ({ ...q, selected: true })),
    partial: result.partial,
    coverage: result.coverage,
  };
}

function questionsToSnapshot(
  input: AiTemplateWizardInput,
  questions: AiGeneratedQuestion[],
  sessionSettings: LiveSessionSettings
) {
  return {
    title: input.title,
    description: input.description || `AI-generated ${input.subject} template`,
    subject: input.subject,
    metadata: {
      version: 1,
      aiGenerated: true,
      audience: input.audience,
      bloomLevel: input.bloomLevel,
      modes: input.modes,
      timerMode: input.timerMode,
      scoring: input.scoring,
      media: input.media,
      settings: {
        shuffleQuestions: true,
        shuffleOptions: true,
        timePerQuestion: input.timerMode === "per_question" ? 45 : sessionSettings.timePerQuestion,
        showExplanations: input.media.explanations !== false,
        negativeMarking: input.scoring.negativeMarking,
        xp: input.scoring.xp,
        leaderboard: input.scoring.leaderboard,
      },
      sessionSettings,
    },
    questions: questions.map((q, order) => ({
      text: q.stem,
      type: q.type,
      difficulty: q.difficulty || input.difficulty,
      marks: q.marks ?? 1,
      order,
      explanation: q.explanation,
      metadata: {
        bloomLevel: q.bloomLevel,
        estimatedSeconds: q.estimatedSeconds ?? 60,
        hints: q.hints || [],
        tags: q.tags || [],
        topic: q.topic,
        ...(input.media.formulas ? { hasFormula: true } : {}),
        ...(input.media.images ? { hasImage: true } : {}),
        ...(input.media.codeSnippets ? { hasCode: true } : {}),
        ...q.metadata,
      },
      options: (q.options || []).map((o, oi) => ({
        text: o.text,
        isCorrect: o.isCorrect,
        order: oi,
      })),
    })),
  };
}

async function materializeQuizFromSnapshot(
  userId: string,
  snap: ReturnType<typeof questionsToSnapshot>
) {
  const created = await prisma.quiz.create({
    data: {
      title: snap.title,
      description: snap.description,
      subject: snap.subject,
      authorId: userId,
      visibility: "private",
      metadata: snap.metadata as object,
      totalMarks: snap.questions.reduce((s, q) => s + (q.marks ?? 1), 0),
    },
  });

  for (const [index, q] of snap.questions.entries()) {
    const question = await prisma.question.create({
      data: {
        quizId: created.id,
        text: q.text,
        type: q.type,
        difficulty: q.difficulty,
        marks: q.marks ?? 1,
        order: index,
        explanation: q.explanation,
        metadata: (q.metadata || {}) as object,
      },
    });
    if (q.options?.length) {
      await prisma.option.createMany({
        data: q.options.map((o, oi) => ({
          questionId: question.id,
          text: o.text,
          isCorrect: o.isCorrect,
          order: oi,
        })),
      });
    }
  }
  return created.id;
}

export async function fillRemainingAiTemplate(
  input: AiTemplateWizardInput,
  existing: AiGeneratedQuestion[]
) {
  const config = buildAiConfig(input);
  const validation = validateQuizGenerationConfiguration(config);
  if (!validation.valid) {
    throw new AppError(400, validation.error || "Invalid generation configuration");
  }

  const content = buildTopicContent(config, input.description);
  const questions = await generateRemainingQuestions(content, config, existing);
  const coverage = buildGenerationCoverage(config, questions);

  return {
    questions,
    partial: !coverage.isComplete,
    coverage,
    preview: {
      questions,
      summary: {
        totalQuestions: questions.length,
        requestedQuestions: input.questionCount,
        generatedQuestions: questions.length,
        coveragePercent: coverage.coveragePercent,
        isComplete: coverage.isComplete,
        byType: coverage.byTypeGenerated,
        byTypeRequested: coverage.byTypeRequested,
        estimatedMinutes: Math.max(5, Math.ceil(questions.length * 1.2)),
      },
    },
  };
}

export async function generateAiTemplate(userId: string, input: AiTemplateWizardInput) {
  const config = buildAiConfig(input);
  const validation = validateQuizGenerationConfiguration(config);
  if (!validation.valid) {
    throw new AppError(400, validation.error || "Invalid generation configuration");
  }

  const { questions, partial, coverage } = await generateQuestions(input);
  const sessionSettings: LiveSessionSettings = {
    ...DEFAULT_LIVE_SESSION_SETTINGS,
    timePerQuestion: input.timerMode === "per_question" ? 45 : input.timerMode === "none" ? 0 : 30,
    showExplanations: input.media.explanations !== false,
    shuffleQuestions: true,
    shuffleOptions: true,
  };

  const snap = questionsToSnapshot(input, questions, sessionSettings);
  const questionTypes = [...new Set(questions.map((q) => q.type))];
  const slug = `${slugify(input.title)}-ai-${Date.now().toString(36)}`;

  let templateId: string | undefined;
  let quizId: string | undefined;

  if (input.saveAs === "template" || input.saveAs === "both") {
    const tpl = await prisma.quizLibraryTemplate.create({
      data: {
        slug,
        title: input.title,
        description: input.description || `AI-generated ${input.subject} assessment`,
        category: input.category || "Training",
        subject: input.subject,
        gradeLevel: input.audience,
        difficulty: input.difficulty === "mixed" ? "medium" : input.difficulty,
        tags: ["ai-generated", slugify(input.subject)],
        questionCount: questions.length,
        durationMinutes: Math.max(5, Math.ceil(questions.length * 1.2)),
        questionTypes,
        visibility: "private",
        source: "ai",
        status: "published",
        authorUserId: userId,
        authorName: "You",
        quizSnapshot: snap,
        sessionSettings,
        learningObjectives: [
          `Assess ${input.subject} at ${input.bloomLevel} level`,
          `Practice with ${questionTypes.join(", ")}`,
        ],
        supportsHomework: input.modes.includes("homework") || input.modes.includes("assignment"),
        supportsLive: input.modes.includes("live"),
        supportsAi: true,
        supportsMedia: Object.values(input.media).some(Boolean),
        language: "en",
        coverGradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        coverImageUrl: `https://picsum.photos/seed/${slug}/800/450`,
        publishedAt: new Date(),
      },
    });
    templateId = tpl.id;
  }

  if (input.saveAs === "quiz" || input.saveAs === "both") {
    quizId = await materializeQuizFromSnapshot(userId, snap);
    if (templateId) {
      await prisma.quizLibraryTemplate.update({
        where: { id: templateId },
        data: { quizId },
      });
    }
  }

  return {
    templateId,
    quizId,
    partial,
    preview: {
      questions,
      summary: {
        totalQuestions: questions.length,
        requestedQuestions: input.questionCount,
        generatedQuestions: questions.length,
        coveragePercent: coverage.coveragePercent,
        isComplete: coverage.isComplete,
        byType: coverage.byTypeGenerated,
        byTypeRequested: coverage.byTypeRequested,
        estimatedMinutes: Math.max(5, Math.ceil(questions.length * 1.2)),
      },
      snapshot: snap,
    },
  };
}

export async function saveAiTemplateFromPreview(
  userId: string,
  input: AiTemplateWizardInput,
  questions: AiGeneratedQuestion[]
) {
  const sessionSettings: LiveSessionSettings = { ...DEFAULT_LIVE_SESSION_SETTINGS };
  const snap = questionsToSnapshot(input, questions, sessionSettings);
  const slug = `${slugify(input.title)}-ai-${Date.now().toString(36)}`;
  const questionTypes = [...new Set(questions.map((q) => q.type))];

  const tpl = await prisma.quizLibraryTemplate.create({
    data: {
      slug,
      title: input.title,
      description: input.description,
      category: input.category || "Training",
      subject: input.subject,
      gradeLevel: input.audience,
      difficulty: input.difficulty === "mixed" ? "medium" : input.difficulty,
      tags: ["ai-generated"],
      questionCount: questions.length,
      durationMinutes: Math.max(5, Math.ceil(questions.length * 1.2)),
      questionTypes,
      visibility: "private",
      source: "ai",
      status: "published",
      authorUserId: userId,
      authorName: "You",
      quizSnapshot: snap,
      sessionSettings,
      supportsHomework: true,
      supportsLive: true,
      supportsAi: true,
      supportsMedia: true,
      language: "en",
      publishedAt: new Date(),
    },
  });

  return tpl.id;
}
