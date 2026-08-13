import { prisma } from "../../../utils/prisma.js";
import { AppError } from "../../../middlewares/errorHandler.js";
import { isAdminRole } from "../../../utils/roles.js";
import type { ImportedQuestionDraft, ImportPreview } from "./types.js";
import { stripMockArtifacts } from "../../ai/mockQuestionRefinement.js";
import type { QuizBuilderQuestion } from "../documentIntelligence/QuizBuilderReconstructor.js";

const DEFAULT_QUIZ_SETTINGS = {
  shuffleQuestions: false,
  shuffleOptions: true,
  randomSubset: 0,
  timePerQuestion: 30,
  showExplanations: true,
  passingScore: 60,
  maxAttempts: 0,
  negativeMarking: false,
};

const VALID_TYPES = new Set([
  "multiple_choice",
  "multiple_select",
  "true_false",
  "fill_blank",
  "numerical",
  "matching",
  "ordering",
  "essay",
  "case_study",
  "scenario",
  "coding",
  "debugging",
  "predict_output",
  "sql",
  "diagram",
  "image_based",
  "research_analysis",
]);

export function normalizeImportQuestionType(raw?: string): string {
  if (!raw) return "multiple_choice";
  const key = raw.toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    mcq: "multiple_choice",
    multiple_choice: "multiple_choice",
    multiple_select: "multiple_select",
    msq: "multiple_select",
    true_false: "true_false",
    "true/false": "true_false",
    fill_blank: "fill_blank",
    fill_in_blank: "fill_blank",
    short_answer: "fill_blank",
    numerical: "numerical",
    matching: "matching",
    ordering: "ordering",
    essay: "essay",
    case_study: "case_study",
    scenario: "scenario",
    coding: "coding",
    code: "coding",
    programming: "coding",
    debugging: "debugging",
    predict_output: "predict_output",
    sql: "sql",
    diagram: "diagram",
    image_based: "image_based",
    research_analysis: "research_analysis",
  };
  const mapped = aliases[key] || key;
  return VALID_TYPES.has(mapped) ? mapped : "multiple_choice";
}

function buildOptions(
  type: string,
  fromDraft?: Array<{ text: string; isCorrect: boolean }>
): Array<{ text: string; isCorrect: boolean; order: number }> {
  if (fromDraft?.length) {
    let opts = fromDraft.map((o, i) => ({
      text: o.text || "",
      isCorrect: Boolean(o.isCorrect),
      order: i,
    }));
    // Drop trailing blank placeholders (import often has 2 real options, not 4)
    while (opts.length > 2 && !opts[opts.length - 1]!.text.trim()) {
      opts = opts.slice(0, -1);
    }
    if (opts.length >= 2) return opts.map((o, i) => ({ ...o, order: i }));
    if (opts.length === 1) return [opts[0]!, { text: "", isCorrect: false, order: 1 }];
    return opts;
  }
  if (type === "true_false") {
    return [
      { text: "True", isCorrect: true, order: 0 },
      { text: "False", isCorrect: false, order: 1 },
    ];
  }
  if (["multiple_choice", "multiple_select"].includes(type)) {
    return [
      { text: "", isCorrect: true, order: 0 },
      { text: "", isCorrect: false, order: 1 },
      { text: "", isCorrect: false, order: 2 },
      { text: "", isCorrect: false, order: 3 },
    ];
  }
  return [];
}

function isPlaceholderQuestion(q: { text: string; options: Array<{ text: string }> }): boolean {
  return !q.text.trim() && q.options.every((o) => !o.text.trim());
}

function draftToCreateInput(draft: ImportedQuestionDraft, order: number, preview: ImportPreview) {
  const type = normalizeImportQuestionType(draft.type);
  const options = buildOptions(type, draft.options);

  const draftMeta: Record<string, any> = { ...(draft.metadata || {}) };

  const codeObj = draft.codeBlock || draftMeta.code || (Array.isArray(draftMeta.codeBlocks) ? draftMeta.codeBlocks[0] : null);
  const starterCodeStr = draft.starterCode || draftMeta.starterCode || codeObj?.content;
  if (codeObj || starterCodeStr) {
    draftMeta.code = codeObj || { type: "code", id: `code_${Date.now()}`, content: starterCodeStr, language: draftMeta.language || "python" };
    draftMeta.starterCode = starterCodeStr || codeObj?.content;
    draftMeta.codeBlocks = [draftMeta.code];
    draftMeta.language = draftMeta.language || codeObj?.language || "python";
  }

  const tableObj = draft.table || draftMeta.table || (Array.isArray(draftMeta.tables) ? draftMeta.tables[0] : null);
  if (tableObj) {
    draftMeta.table = tableObj;
    draftMeta.tables = [tableObj];
  }

  const mathObj = draft.mathNode;
  const formulasArr = draft.formulas || draftMeta.formulas || (mathObj ? [mathObj.latex] : undefined);
  if (formulasArr && formulasArr.length > 0) {
    draftMeta.formulas = formulasArr;
    draftMeta.equations = draftMeta.equations || formulasArr.map((f: string, idx: number) => ({ id: `eq_${idx}`, latex: f, format: "latex" }));
  }

  const mediaArr = draft.media || draftMeta.images;
  const mediaUrlStr = draftMeta.mediaUrl || (Array.isArray(mediaArr) ? mediaArr[0]?.dataUrl || mediaArr[0]?.url : undefined);
  if (mediaUrlStr || (mediaArr && mediaArr.length > 0)) {
    draftMeta.mediaUrl = mediaUrlStr;
    draftMeta.images = mediaArr;
    draftMeta.media = mediaUrlStr ? { url: mediaUrlStr, kind: "image" } : undefined;
  }

  const hyperlinksArr = draft.hyperlinks || draftMeta.hyperlinks;
  if (hyperlinksArr && hyperlinksArr.length > 0) {
    draftMeta.hyperlinks = hyperlinksArr;
    draftMeta.hyperlink = hyperlinksArr[0];
  }

  const listsArr = draft.lists || draftMeta.lists;
  if (listsArr && listsArr.length > 0) {
    draftMeta.lists = listsArr;
    draftMeta.list = listsArr[0];
  }

  return {
    text: stripMockArtifacts(draft.stem.trim()),
    type,
    difficulty: draft.difficulty || "medium",
    marks: 1,
    order,
    explanation: draft.explanation || null,
    metadata: {
      ...draftMeta,
      bloomLevel: draft.bloomLevel || "L2",
      estimatedSeconds: 45,
      hints: draft.hints || [],
      tags: [...(draft.tags || []), `import:${preview.source}`],
      importJobId: preview.jobId,
      importSource: preview.source,
      sourceUrl: preview.sourceUrl,
      fileName: preview.fileName,
      learningObjectives: draft.learningObjectives,
    },
    options,
  };
}

async function assertQuizOwner(quizId: string, userId: string, role: string) {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) throw new AppError(404, "Quiz not found");
  if (!isAdminRole(role) && quiz.authorId !== userId) throw new AppError(403, "Forbidden");
  return quiz;
}

/** Create a new quiz in the Quiz Builder format — same shape as createEmptyQuiz + questions. */
export async function materializeQuizFromImportDrafts(
  userId: string,
  title: string,
  drafts: ImportedQuestionDraft[],
  preview: ImportPreview
) {
  if (!drafts.length) throw new AppError(400, "No questions to import");

  const quiz = await prisma.$transaction(async (tx) => {
    const created = await tx.quiz.create({
      data: {
        title: title.trim() || "Imported Quiz",
        authorId: userId,
        visibility: "private",
        totalMarks: drafts.length,
        metadata: { version: 1, settings: DEFAULT_QUIZ_SETTINGS, sections: [] },
      },
    });

    await Promise.all(
      drafts.map((draft, i) => {
        const input = draftToCreateInput(draft, i, preview);
        return tx.question.create({
          data: {
            quizId: created.id,
            text: input.text,
            type: input.type,
            difficulty: input.difficulty,
            marks: input.marks,
            order: input.order,
            explanation: input.explanation,
            metadata: input.metadata,
            options: input.options.length
              ? {
                  create: input.options.map((o) => ({
                    text: o.text,
                    isCorrect: o.isCorrect,
                    order: o.order,
                  })),
                }
              : undefined,
          },
        });
      })
    );

    return tx.quiz.findUnique({
      where: { id: created.id },
      include: {
        questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } },
      },
    });
  });

  if (!quiz) throw new AppError(500, "Failed to create quiz");
  return quiz;
}

/** Create a new quiz from Quiz Builder Reconstructor output — preserving all educational components. */
export async function materializeQuizFromQuizBuilderModel(
  userId: string,
  title: string,
  quizBuilderQuestions: QuizBuilderQuestion[],
  preview: ImportPreview
) {
  if (!quizBuilderQuestions.length) throw new AppError(400, "No questions to import");

  const quiz = await prisma.$transaction(async (tx) => {
    const created = await tx.quiz.create({
      data: {
        title: title.trim() || "Imported Quiz",
        authorId: userId,
        visibility: "private",
        totalMarks: quizBuilderQuestions.reduce((sum, q) => sum + (q.marks || 1), 0),
        metadata: { 
          version: 1, 
          settings: DEFAULT_QUIZ_SETTINGS, 
          sections: [],
          quizBuilderModel: true // Flag to indicate this came from Quiz Builder reconstruction
        },
      },
    });

    await Promise.all(
      quizBuilderQuestions.map((qbQuestion, i) => {
        return tx.question.create({
          data: {
            quizId: created.id,
            text: qbQuestion.text,
            type: qbQuestion.type,
            difficulty: qbQuestion.difficulty,
            marks: qbQuestion.marks,
            negativeMarks: qbQuestion.negativeMarks,
            order: qbQuestion.order ?? i,
            explanation: qbQuestion.explanation,
            hint: qbQuestion.hint,
            bloomLevel: qbQuestion.bloomLevel,
            metadata: {
              ...qbQuestion.metadata,
              bloomLevel: qbQuestion.bloomLevel,
              estimatedSeconds: qbQuestion.estimatedSeconds,
              hints: qbQuestion.hints,
              tags: qbQuestion.tags,
              sectionId: qbQuestion.sectionId,
              media: qbQuestion.media || (qbQuestion.mediaUrl ? { url: qbQuestion.mediaUrl, kind: "image" } : undefined),
              mediaUrl: qbQuestion.mediaUrl || qbQuestion.metadata?.mediaUrl || (qbQuestion.diagram as any)?.url || (qbQuestion.images && qbQuestion.images[0] ? (qbQuestion.images[0] as any).dataUrl || (qbQuestion.images[0] as any).url : undefined),
              diagram: qbQuestion.diagram || qbQuestion.metadata?.diagram,
              images: qbQuestion.images || qbQuestion.metadata?.images || (qbQuestion.diagram ? [qbQuestion.diagram] : undefined),
              table: qbQuestion.table || qbQuestion.metadata?.table,
              tables: qbQuestion.tables || qbQuestion.metadata?.tables || (qbQuestion.table ? [qbQuestion.table] : undefined),
              code: qbQuestion.code || qbQuestion.metadata?.code,
              codeBlocks: qbQuestion.codeBlocks || qbQuestion.metadata?.codeBlocks || (qbQuestion.code ? [qbQuestion.code] : undefined),
              equations: qbQuestion.equations || qbQuestion.metadata?.equations,
              formulas: qbQuestion.formulas || qbQuestion.metadata?.formulas || (qbQuestion.equations ? qbQuestion.equations.map(e => e.latex) : undefined),
              hyperlinks: qbQuestion.hyperlinks || qbQuestion.metadata?.hyperlinks,
              lists: qbQuestion.lists || qbQuestion.metadata?.lists,
              // Preserve educational object ownership information
              quizBuilderReconstructed: true,
              importJobId: preview.jobId,
              importSource: preview.source,
              sourceUrl: preview.sourceUrl,
              fileName: preview.fileName,
            },
            options: qbQuestion.options && qbQuestion.options.length
              ? {
                  create: qbQuestion.options.map((o) => ({
                    text: o.text,
                    isCorrect: o.isCorrect,
                    order: o.order,
                  })),
                }
              : undefined,
          },
        });
      })
    );

    return tx.quiz.findUnique({
      where: { id: created.id },
      include: {
        questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } },
      },
    });
  });

  if (!quiz) throw new AppError(500, "Failed to create quiz");
  return quiz;
}

/** Append imported questions to an existing quiz (e.g. import from builder header). */
export async function appendImportDraftsToQuiz(
  quizId: string,
  userId: string,
  role: string,
  drafts: ImportedQuestionDraft[],
  preview: ImportPreview
) {
  if (!drafts.length) throw new AppError(400, "No questions to import");
  const quiz = await assertQuizOwner(quizId, userId, role);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.question.findMany({
      where: { quizId },
      orderBy: { order: "asc" },
      include: { options: true },
    });

    const placeholderIds = existing.filter(isPlaceholderQuestion).map((q) => q.id);
    if (placeholderIds.length && drafts.length) {
      await tx.option.deleteMany({ where: { questionId: { in: placeholderIds } } });
      await tx.question.deleteMany({ where: { id: { in: placeholderIds } } });
    }

    const remaining = existing.filter((q) => !placeholderIds.includes(q.id));
    let order = remaining.length ? Math.max(...remaining.map((q) => q.order)) + 1 : 0;

    for (const draft of drafts) {
      const input = draftToCreateInput(draft, order, preview);
      const question = await tx.question.create({
        data: {
          quizId,
          text: input.text,
          type: input.type,
          difficulty: input.difficulty,
          marks: input.marks,
          order: input.order,
          explanation: input.explanation,
          metadata: input.metadata,
        },
      });
      if (input.options.length) {
        await tx.option.createMany({
          data: input.options.map((o) => ({
            questionId: question.id,
            text: o.text,
            isCorrect: o.isCorrect,
            order: o.order,
          })),
        });
      }
      order++;
    }

    const totalMarks = await tx.question.aggregate({ where: { quizId }, _sum: { marks: true } });
    const prevMeta = (quiz.metadata || {}) as Record<string, unknown>;
    await tx.quiz.update({
      where: { id: quizId },
      data: {
        totalMarks: totalMarks._sum.marks ?? drafts.length,
        metadata: {
          ...prevMeta,
          version: (typeof prevMeta.version === "number" ? prevMeta.version : 0) + 1,
        },
      },
    });

    return { id: quizId, title: quiz.title };
  });
}
