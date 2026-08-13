import { prisma } from "../../../utils/prisma.js";
import { AppError } from "../../../middlewares/errorHandler.js";
import { createBankQuestion } from "../assessmentStudioService.js";
import type {
  ImportCommitResult,
  ImportJobStatusResponse,
  ImportPreview,
  ImportSourceType,
} from "./types.js";
import {
  extractTextFromDocx,
  extractTextFromImage,
  extractTextFromPdf,
  extractTextFromPlain,
  extractTextFromPptx,
} from "./textExtractors.js";
import {
  extractGoogleFormContent,
  extractWebsiteContent,
  extractYouTubeTranscript,
} from "./urlExtractors.js";
import {
  extractGoogleDocContent,
  extractTextFromCsv,
  extractTextFromHtmlFile,
  extractTextFromMoodleXml,
} from "./documentExtractors.js";
import { buildPreviewSummary, extractQuestionsFromContent } from "./questionExtractorAI.js";
import { ImportError, serializeImportFailure } from "./importErrors.js";
import { progressPayload, type ImportProgress } from "./importProgress.js";
import { attachValidationWarnings, validateImportedQuestions } from "./importValidation.js";
import {
  appendImportDraftsToQuiz,
  materializeQuizFromImportDrafts,
} from "./importQuizMaterializer.js";
import { DocumentIntelligenceAdapter } from "./extractors/DocumentIntelligenceAdapter.js";
import { UnifiedExtractionEngine } from "../../extraction/UnifiedExtractionEngine.js";

const SOURCE_LABELS: Record<ImportSourceType, string> = {
  google_forms: "Google Forms",
  google_docs: "Google Docs",
  pdf: "PDF Document",
  docx: "Word Document",
  pptx: "PowerPoint",
  image: "Image (OCR)",
  txt: "Plain Text",
  markdown: "Markdown",
  html: "HTML",
  csv: "CSV / Excel",
  moodle_xml: "Moodle XML",
  youtube: "YouTube",
  website: "Website",
};

async function getExistingStems(authorId: string): Promise<string[]> {
  const rows = await prisma.bankQuestion.findMany({
    where: { authorId },
    select: { stem: true },
    take: 5000,
  });
  return rows.map((r) => r.stem);
}

async function updateJobProgress(jobId: string, progress: ImportProgress) {
  await prisma.bankQuestionImportJob.update({
    where: { id: jobId },
    data: { preview: { _progress: progress } as object },
  });
}

async function extractRawContent(params: {
  source: ImportSourceType;
  userId: string;
  buffer?: Buffer;
  mimeType?: string;
  text?: string;
  url?: string;
  fileName?: string;
}): Promise<string> {
  const { source, userId, buffer, mimeType, text, url, fileName } = params;

  switch (source) {
    case "pdf":
      if (!buffer) throw new ImportError(400, "UNSUPPORTED_FORMAT", "PDF file required.", "Upload a .pdf file.");
      return extractTextFromPdf(buffer);
    case "docx":
      if (!buffer) throw new ImportError(400, "UNSUPPORTED_FORMAT", "DOCX file required.", "Upload a .docx file.");
      return extractTextFromDocx(buffer);
    case "pptx":
      if (!buffer) throw new ImportError(400, "UNSUPPORTED_FORMAT", "PPTX file required.", "Upload a .pptx file.");
      return extractTextFromPptx(buffer);
    case "image":
      if (!buffer || !mimeType) throw new ImportError(400, "UNSUPPORTED_FORMAT", "Image file required.", "Upload PNG, JPEG, WEBP, or TIFF.");
      return extractTextFromImage(buffer, mimeType);
    case "txt":
    case "markdown":
      if (buffer) return extractTextFromPlain(buffer);
      if (text?.trim()) return text.trim();
      throw new ImportError(400, "FILE_EMPTY", "Text content required.", "Paste text or upload a file.");
    case "html":
      if (buffer) return extractTextFromHtmlFile(buffer);
      if (url?.trim()) return extractWebsiteContent(url.trim());
      throw new ImportError(400, "URL_INVALID", "HTML file or URL required.", "Upload .html or paste a webpage URL.");
    case "csv":
      if (!buffer) throw new ImportError(400, "UNSUPPORTED_FORMAT", "CSV file required.", "Upload a .csv file exported from Excel or Google Sheets.");
      return extractTextFromCsv(buffer);
    case "moodle_xml":
      if (!buffer) throw new ImportError(400, "UNSUPPORTED_FORMAT", "Moodle XML file required.", "Export quiz as Moodle XML.");
      return extractTextFromMoodleXml(buffer);
    case "google_forms":
      if (!url?.trim()) throw new ImportError(400, "URL_INVALID", "Google Forms URL required.", "Paste the full forms.google.com link.");
      return extractGoogleFormContent(url.trim(), userId);
    case "google_docs":
      if (!url?.trim()) throw new ImportError(400, "URL_INVALID", "Google Docs URL required.", "Paste the docs.google.com link.");
      return extractGoogleDocContent(url.trim(), userId);
    case "youtube":
      if (!url?.trim()) throw new ImportError(400, "URL_INVALID", "YouTube URL required.", "Paste a youtube.com or youtu.be link.");
      return extractYouTubeTranscript(url.trim());
    case "website":
      if (!url?.trim()) throw new ImportError(400, "URL_INVALID", "Website URL required.", "Paste an https:// link.");
      return extractWebsiteContent(url.trim());
    default:
      throw new ImportError(400, "UNSUPPORTED_FORMAT", `Unsupported import source: ${source}`, "Choose a supported import type.");
  }
}

/** Start async import — returns immediately with jobId */
export async function startImportJob(params: {
  authorId: string;
  source: ImportSourceType;
  buffer?: Buffer;
  mimeType?: string;
  text?: string;
  url?: string;
  fileName?: string;
}): Promise<{ jobId: string }> {
  const job = await prisma.bankQuestionImportJob.create({
    data: {
      authorId: params.authorId,
      source: params.source,
      status: "processing",
      fileName: params.fileName,
      sourceUrl: params.url,
      preview: { _progress: progressPayload("uploading", 5) } as object,
    },
  });

  setImmediate(() => {
    void runImportPipeline(job.id, params).catch((err) => {
      console.error(`[import] job ${job.id} failed:`, err);
    });
  });

  return { jobId: job.id };
}

async function runImportPipeline(
  jobId: string,
  params: {
    authorId: string;
    source: ImportSourceType;
    buffer?: Buffer;
    mimeType?: string;
    text?: string;
    url?: string;
    fileName?: string;
  }
) {
  try {
    await updateJobProgress(jobId, progressPayload("uploading", 10));
    await updateJobProgress(jobId, progressPayload("parsing", 25));

    let questions: any[] = [];
    
    // Pass through UnifiedExtractionEngine as the single unified extraction engine
    try {
      const unifiedResult = await UnifiedExtractionEngine.process({
        buffer: params.buffer,
        fileName: params.fileName || `file.${params.source}`,
        mimeType: params.mimeType,
        url: params.url,
      });

      if (unifiedResult.questions && unifiedResult.questions.length > 0) {
        questions = unifiedResult.questions.map((q) => {
          const codeObj = q.codeBlock;
          const tableObj = q.table;
          const mathObj = q.mathNode;
          const mediaArr = q.media;
          const hyperlinksArr = q.hyperlinks;
          const listsArr = q.lists;

          const meta: Record<string, any> = {
            ...(q.metadata || {}),
          };

          if (codeObj) {
            meta.code = codeObj;
            meta.starterCode = codeObj.content;
            meta.codeBlocks = [codeObj];
            meta.language = codeObj.language || "python";
          }
          if (tableObj) {
            meta.table = tableObj;
            meta.tables = [tableObj];
          }
          if (mathObj) {
            meta.formulas = [mathObj.latex];
            meta.equations = [{ id: mathObj.id, latex: mathObj.latex, format: "latex" }];
          }
          if (mediaArr && mediaArr.length > 0) {
            meta.images = mediaArr;
            meta.mediaUrl = mediaArr[0]?.dataUrl || mediaArr[0]?.url;
            meta.media = meta.mediaUrl ? { url: meta.mediaUrl, kind: "image" } : undefined;
          }
          if (hyperlinksArr && hyperlinksArr.length > 0) {
            meta.hyperlinks = hyperlinksArr;
            meta.hyperlink = hyperlinksArr[0];
          }
          if (listsArr && listsArr.length > 0) {
            meta.lists = listsArr;
            meta.list = listsArr[0];
          }

          return {
            stem: q.stem,
            text: q.stem,
            type: q.type,
            marks: q.marks || 1,
            order: 1,
            difficulty: q.difficulty || "medium",
            negativeMarks: q.negativeMarks || 0,
            explanation: q.explanation || "",
            hint: q.hint || "",
            hints: q.hint ? [q.hint] : [],
            codeBlock: codeObj,
            starterCode: codeObj?.content,
            table: tableObj,
            mathNode: mathObj,
            formulas: mathObj ? [mathObj.latex] : undefined,
            media: mediaArr,
            mediaUrl: meta.mediaUrl,
            hyperlinks: hyperlinksArr,
            lists: listsArr,
            metadata: meta,
            options: q.options.map((opt) => ({
              text: opt.text,
              isCorrect: opt.isCorrect,
              order: opt.order,
            })),
          };
        });
      }
    } catch (unifiedErr) {
      console.warn(`[importService] UnifiedExtractionEngine error, attempting raw fallback:`, unifiedErr);
    }

    if (!questions || questions.length === 0) {
      const content = await extractRawContent({
        source: params.source,
        userId: params.authorId,
        buffer: params.buffer,
        mimeType: params.mimeType,
        text: params.text,
        url: params.url,
        fileName: params.fileName,
      });

      if (params.source === "image") {
        await updateJobProgress(jobId, progressPayload("ocr", 45));
      }

      await updateJobProgress(jobId, progressPayload("ai_extraction", 60));

      const existingStems = await getExistingStems(params.authorId);
      questions = await extractQuestionsFromContent(
        content,
        { source: params.source, fileName: params.fileName, sourceUrl: params.url },
        existingStems
      );
    }

    if (!questions.length) {
      throw new ImportError(
        422,
        "NO_QUESTIONS_FOUND",
        "No questions could be extracted from this source.",
        "Try a clearer document, connect Google for private forms, or paste questions manually.",
        true
      );
    }

    await updateJobProgress(jobId, progressPayload("validation", 85));
    const validationIssues = validateImportedQuestions(questions);
    questions = attachValidationWarnings(questions);

    const preview: ImportPreview = {
      jobId,
      source: params.source,
      sourceLabel: SOURCE_LABELS[params.source],
      fileName: params.fileName,
      sourceUrl: params.url,
      questions,
      summary: buildPreviewSummary(questions),
      validationIssues,
    };

    await updateJobProgress(jobId, progressPayload("saving", 95));

    await prisma.bankQuestionImportJob.update({
      where: { id: jobId },
      data: { status: "ready", preview: preview as object, error: null },
    });
  } catch (err) {
    const { error, importError } = serializeImportFailure(err);
    await prisma.bankQuestionImportJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error,
        preview: {
          _progress: progressPayload("failed", 0),
          _importError: importError,
        } as object,
      },
    });
  }
}

/** @deprecated sync path — use startImportJob */
export async function createImportJob(params: Parameters<typeof startImportJob>[0]): Promise<ImportPreview> {
  const { jobId } = await startImportJob(params);
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const status = await getImportJobStatus(jobId, params.authorId, "instructor");
    if (status.status === "ready" && status.preview) return status.preview;
    if (status.status === "failed") {
      throw new ImportError(
        422,
        (status.importError?.code as ImportError["code"]) || "UNKNOWN",
        status.error || "Import failed",
        status.importError?.suggestion || "Try again.",
        status.importError?.retryable ?? true
      );
    }
  }
  throw new ImportError(504, "UNKNOWN", "Import timed out.", "Try a smaller file or split into parts.", true);
}

export async function getImportJobStatus(
  jobId: string,
  userId: string,
  role: string
): Promise<ImportJobStatusResponse> {
  const job = await prisma.bankQuestionImportJob.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError(404, "Import job not found");
  if (job.authorId !== userId && role !== "admin" && role !== "super_admin") {
    throw new AppError(403, "Forbidden");
  }

  const rawPreview = job.preview as Record<string, unknown> | null;

  if (job.status === "processing") {
    const progress = (rawPreview?._progress as ImportProgress | undefined) || progressPayload("parsing", 20);
    return { jobId, status: "processing", progress };
  }

  if (job.status === "failed") {
    const importError = rawPreview?._importError as ImportJobStatusResponse["importError"];
    return {
      jobId,
      status: "failed",
      error: job.error || "Import failed",
      importError,
    };
  }

  if (job.status === "committed") {
    return { jobId, status: "committed", preview: rawPreview as unknown as ImportPreview };
  }

  if (!rawPreview || !("questions" in rawPreview)) {
    throw new AppError(404, "Preview not available");
  }

  return {
    jobId,
    status: "ready",
    preview: rawPreview as unknown as ImportPreview,
  };
}

export async function getImportJobPreview(jobId: string, userId: string, role: string): Promise<ImportPreview> {
  const status = await getImportJobStatus(jobId, userId, role);
  if (status.status === "processing") throw new AppError(202, "Import still processing");
  if (status.status === "failed") {
    throw new ImportError(
      422,
      (status.importError?.code as ImportError["code"]) || "UNKNOWN",
      status.importError?.message || status.error || "Import failed",
      status.importError?.suggestion || "Try again with a different file or URL.",
      status.importError?.retryable ?? true
    );
  }
  if (!status.preview) throw new AppError(404, "Preview not available");
  return status.preview;
}

export async function updateImportPreview(
  jobId: string,
  userId: string,
  role: string,
  questions: ImportPreview["questions"]
): Promise<ImportPreview> {
  const job = await prisma.bankQuestionImportJob.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError(404, "Import job not found");
  if (job.authorId !== userId && role !== "admin" && role !== "super_admin") {
    throw new AppError(403, "Forbidden");
  }
  if (job.status !== "ready") throw new AppError(400, "Import job is not ready for editing");

  const validationIssues = validateImportedQuestions(questions);
  const preview: ImportPreview = {
    ...(job.preview as unknown as ImportPreview),
    questions: attachValidationWarnings(questions),
    summary: buildPreviewSummary(questions),
    validationIssues,
  };

  await prisma.bankQuestionImportJob.update({
    where: { id: jobId },
    data: { preview: preview as object },
  });

  return preview;
}

export async function commitImportJob(
  jobId: string,
  userId: string,
  role: string,
  options?: { questionIds?: string[]; skipDuplicates?: boolean }
): Promise<ImportCommitResult> {
  const job = await prisma.bankQuestionImportJob.findUnique({ where: { id: jobId } });
  if (job?.status === "committed") {
    throw new ImportError(400, "IMPORT_ALREADY_COMMITTED", "This import was already saved.", "Start a new import if you need more questions.", false);
  }

  const preview = await getImportJobPreview(jobId, userId, role);

  let toImport = preview.questions.filter((q) => q.selected);
  if (options?.questionIds?.length) {
    const idSet = new Set(options.questionIds);
    toImport = toImport.filter((q) => idSet.has(q.id));
  }
  if (options?.skipDuplicates !== false) {
    toImport = toImport.filter((q) => !q.isDuplicate);
  }

  if (!toImport.length) throw new AppError(400, "No questions selected for import");

  const questionIds: string[] = [];
  let skipped = 0;

  for (const draft of toImport) {
    if (!draft.stem?.trim()) {
      skipped++;
      continue;
    }

    const created = await createBankQuestion(userId, {
      stem: draft.stem,
      type: draft.type,
      difficulty: draft.difficulty,
      bloomLevel: draft.bloomLevel,
      explanation: draft.explanation,
      topic: draft.topic,
      subtopic: draft.subtopic,
      tags: [...(draft.tags || []), `import:${preview.source}`],
      hints: draft.hints,
      metadata: {
        ...(draft.metadata || {}),
        importJobId: jobId,
        importSource: preview.source,
        sourceUrl: preview.sourceUrl,
        fileName: preview.fileName,
        learningObjectives: draft.learningObjectives,
      },
      source: "imported",
      status: "pending_review",
      options: draft.options,
    });
    questionIds.push(created.id);
  }

  await prisma.bankQuestionImportJob.update({
    where: { id: jobId },
    data: { status: "committed" },
  });

  return { imported: questionIds.length, skipped, questionIds };
}

export async function commitImportAsQuiz(
  jobId: string,
  userId: string,
  role: string,
  options: { title: string; questionIds?: string[]; skipDuplicates?: boolean; targetQuizId?: string }
) {
  const job = await prisma.bankQuestionImportJob.findUnique({ where: { id: jobId } });
  if (job?.status === "committed") {
    throw new ImportError(400, "IMPORT_ALREADY_COMMITTED", "This import was already saved.", "Start a new import if you need more questions.", false);
  }

  const preview = await getImportJobPreview(jobId, userId, role);

  let toImport = preview.questions.filter((q) => q.selected);
  if (options.questionIds?.length) {
    const idSet = new Set(options.questionIds);
    toImport = toImport.filter((q) => idSet.has(q.id));
  }
  if (options.skipDuplicates !== false) {
    toImport = toImport.filter((q) => !q.isDuplicate);
  }
  toImport = toImport.filter((q) => q.stem?.trim());

  if (!toImport.length) throw new AppError(400, "No questions selected for import");

  const quiz = options.targetQuizId
    ? await appendImportDraftsToQuiz(options.targetQuizId, userId, role, toImport, preview)
    : await materializeQuizFromImportDrafts(
        userId,
        options.title?.trim() || preview.sourceLabel || "Imported Quiz",
        toImport,
        preview
      );

  await prisma.bankQuestionImportJob.update({
    where: { id: jobId },
    data: { status: "committed" },
  });

  return {
    imported: toImport.length,
    skipped: preview.questions.filter((q) => q.selected).length - toImport.length,
    questionIds: [],
    quizId: quiz.id,
    quizTitle: quiz.title,
  };
}

export { SOURCE_LABELS };
