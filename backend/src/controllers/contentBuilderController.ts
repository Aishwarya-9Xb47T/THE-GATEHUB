/**
 * Content Builder Controller
 * Handles API endpoints for the "Build from Content" feature.
 * Two-phase flow: analyze() returns draft questions for review, commit() creates the quiz.
 */

import { Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import { ContentAnalysisEngine } from '../services/assessmentStudio/import/ContentAnalysisEngine.js';
import {
  ContentInput,
  ContentSource,
  SourceType,
  ValidatedQuestionDraft,
  ExtractedQuestionDraft,
} from '../services/assessmentStudio/import/unifiedTypes.js';
import { SourceDetector } from '../services/assessmentStudio/import/extractors/SourceDetector.js';
import { RawContentExtractor } from '../services/assessmentStudio/import/extractors/RawContentExtractor.js';
import { TextNormalizer } from '../services/assessmentStudio/import/extractors/TextNormalizer.js';
import { DocumentSegmenter } from '../services/assessmentStudio/import/extractors/DocumentSegmenter.js';
import { AIQuestionExtractor } from '../services/assessmentStudio/import/extractors/AIQuestionExtractor.js';
import { ValidationEngine } from '../services/assessmentStudio/import/extractors/ValidationEngine.js';
import { QuizConverter } from '../services/assessmentStudio/import/extractors/QuizConverter.js';
import { DocumentIntelligenceAdapter } from '../services/assessmentStudio/import/extractors/DocumentIntelligenceAdapter.js';
import { parseGoogleResourceUrl, getGoogleResourceErrorMessage } from '../services/googleWorkspace/GoogleResourceParser.js';
import { computeGoogleFormsStatistics } from '../services/googleWorkspace/googleFormsIngestion.js';
import {
  ingestGoogleForm,
  ingestGoogleDoc,
  resolveGoogleDriveResource,
} from '../services/googleWorkspace/GoogleWorkspaceOrchestrator.js';
import {
  GoogleIngestionError,
  logGoogleExtractionEvent,
  toGoogleApiResponse,
  getGoogleExtractionUserMessage,
} from '../services/googleWorkspace/googleExtractionErrors.js';
import { prisma } from '../utils/prisma.js';
import { randomUUID, createHash } from 'crypto';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// In-memory job store (replace with Redis/DB in production)
const jobStore = new Map<string, ContentBuilderJob>();

interface ContentBuilderJob {
  id: string;
  userId: string;
  status: 'processing' | 'ready' | 'failed' | 'committed';
  questions?: ValidatedQuestionDraft[];
  statistics?: {
    sourceType: string;
    processingTime: number;
    questionsFound: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    imagesImported: number;
    tablesImported: number;
    formulaeImported?: number;
    codeBlocksImported?: number;
    linksImported?: number;
    audioImported?: number;
    videoImported?: number;
    overallConfidence?: number;
    pagesProcessed: number;
  };
  diagnostics?: {
    fileHash?: string;
    fileName?: string;
    stagesCompleted: string[];
    flaggedQuestions: number;
    rejectedQuestions: number;
    answersDetected?: number;
    needsReview?: number;
    sectionsDetected?: number;
    googleResourceType?: string;
    googleResourceId?: string;
    googleSourceUrl?: string;
    extractionMethod?: string;
    warnings: string[];
  };
  error?: string;
  createdAt: Date;
}

function mapQuestionForReview(q: ValidatedQuestionDraft) {
  const conf = typeof q.confidence === 'number'
    ? (q.confidence <= 1 ? Math.round(q.confidence * 100) : Math.round(q.confidence))
    : 90;
  return {
    id: q.id,
    text: q.text,
    type: q.type,
    options: q.options,
    correctAnswer: q.correctAnswer,
    explanation: q.explanation,
    difficulty: q.difficulty,
    confidence: conf,
    warnings: q.warnings,
    validationStatus: q.validationStatus,
    metadata: q.metadata,
    sourcePage: (q.metadata as any)?.sourcePage ?? (q as any).sourcePage,
    sourceSlide: (q.metadata as any)?.sourceSlide,
    table: q.metadata?.table || (q as any).table,
    tables: q.metadata?.tables || (q as any).tables,
    children: (q as any).children || (q.metadata as any)?.children,
  };
}

interface GoogleSourceMeta {
  sourceType: 'google_docs' | 'google_forms';
  sourceUrl: string;
  resourceId: string;
  resourceTitle?: string;
  extractedAt?: string;
}

function stampGoogleSourceMetadata(
  questions: ValidatedQuestionDraft[],
  meta: GoogleSourceMeta,
): ValidatedQuestionDraft[] {
  const extractedAt = meta.extractedAt || new Date().toISOString();
  return questions.map((q) => ({
    ...q,
    metadata: {
      ...(typeof q.metadata === 'object' && q.metadata ? q.metadata : {}),
      sourceType: meta.sourceType,
      sourceUrl: meta.sourceUrl,
      resourceId: meta.resourceId,
      sourceDocument: meta.resourceTitle || (q.metadata as any)?.sourceDocument,
      extractedAt,
    },
  }));
}

function respondGoogleFormsReviewJob(
  userId: string,
  startTime: number,
  res: Response,
  rawDrafts: ExtractedQuestionDraft[],
  meta: {
    sourceUrl: string;
    resourceId: string;
    formTitle?: string;
    extractionMethod: 'public_html_fallback' | 'forms_api';
    fidelityAudit?: Record<string, unknown>;
  },
) {
  if (rawDrafts.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'NO_QUESTIONS',
      message: getGoogleResourceErrorMessage('NO_QUESTIONS'),
    });
  }

  const validationResult = ValidationEngine.validate(rawDrafts);
  let questions = stampGoogleSourceMetadata(validationResult.questions, {
    sourceType: 'google_forms',
    sourceUrl: meta.sourceUrl,
    resourceId: meta.resourceId,
    resourceTitle: meta.formTitle,
  });

  const committable = questions.filter((q) => q.validationStatus !== 'rejected');
  if (committable.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_FAILED',
      message: 'Questions were detected but none passed validation.',
    });
  }

  const highConf = questions.filter((q) => q.confidence >= 0.85 || q.confidence >= 85).length;
  const medConf = questions.filter((q) => (q.confidence >= 0.6 && q.confidence < 0.85) || (q.confidence >= 60 && q.confidence < 85)).length;
  const lowConf = questions.filter((q) => q.confidence < 0.6 || q.confidence < 60).length;

  let totalConfSum = 0;
  for (const q of questions) {
    let confNum = typeof q.confidence === 'number' ? q.confidence : 0.9;
    if (confNum <= 1) confNum = confNum * 100;
    totalConfSum += Math.round(confNum);
  }
  const overallConfidence = questions.length > 0 ? Math.round(totalConfSum / questions.length) : 95;

  const formStats = computeGoogleFormsStatistics(questions);
  const allWarnings = questions.flatMap((q) => q.warnings || []);
  const needsReview = questions.filter((q) => q.validationStatus === 'flagged' || q.validationStatus === 'rejected' || (q.metadata as any)?.needsReview).length;

  const jobId = randomUUID();
  const job: ContentBuilderJob = {
    id: jobId,
    userId,
    status: 'ready',
    questions,
    statistics: {
      sourceType: 'google_forms',
      processingTime: Date.now() - startTime,
      questionsFound: questions.length,
      highConfidence: highConf,
      mediumConfidence: medConf,
      lowConfidence: lowConf,
      imagesImported: formStats.imagesImported,
      tablesImported: 0,
      formulaeImported: 0,
      codeBlocksImported: 0,
      linksImported: 0,
      audioImported: 0,
      videoImported: 0,
      overallConfidence,
      pagesProcessed: 1,
    },
    diagnostics: {
      fileName: meta.formTitle || 'Google Form',
      stagesCompleted: [
        'resource_identification',
        'authenticated_retrieval',
        'structured_forms_extraction',
        'validation',
      ],
      flaggedQuestions: validationResult.statistics.flaggedQuestions,
      rejectedQuestions: validationResult.statistics.rejectedQuestions,
      answersDetected: formStats.answersDetected,
      needsReview,
      sectionsDetected: formStats.sectionsDetected,
      googleResourceType: 'google_forms',
      googleResourceId: meta.resourceId,
      googleSourceUrl: meta.sourceUrl,
      extractionMethod: meta.extractionMethod,
      fidelityAudit: (meta as any).fidelityAudit,
      warnings: allWarnings.slice(0, 50),
    },
    createdAt: new Date(),
  };

  jobStore.set(jobId, job);
  setTimeout(() => jobStore.delete(jobId), 30 * 60 * 1000);

  return res.json({
    success: true,
    data: {
      jobId,
      questions: questions.map(mapQuestionForReview),
      statistics: job.statistics,
      diagnostics: job.diagnostics,
    },
  });
}

export const contentBuilderUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    console.log('[contentBuilderUpload] File filter called', { 
      originalname: file.originalname, 
      mimetype: file.mimetype 
    });
    const allowedExtensions = [
      '.pdf', '.docx', '.doc', '.pptx', '.ppt',
      '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff',
      '.md', '.markdown', '.txt', '.html', '.htm',
      '.csv', '.xls', '.xlsx', '.xml',
    ];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    const isAllowed = allowedExtensions.includes(ext);
    console.log('[contentBuilderUpload] Extension check', { ext, isAllowed });
    cb(null, isAllowed);
  },
});

const analyzeInputSchema = z.object({
  source: z.enum(['file', 'paste']),
  text: z.string().optional(),
});

const commitSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  questionIds: z.array(z.string()).optional(), // subset; if omitted, all approved
  quizId: z.string().optional(), // existing quiz to update instead of creating new
});

const patchJobSchema = z.object({
  questions: z.array(z.object({
    id: z.string(),
    text: z.string().optional(),
    type: z.string().optional(),
    options: z.array(z.object({
      id: z.string().optional(),
      text: z.string(),
      isCorrect: z.boolean().optional(),
      order: z.number().optional(),
    })).optional(),
    correctAnswer: z.union([z.string(), z.array(z.string())]).optional(),
    explanation: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  })),
});

/**
 * POST /api/content-builder/analyze
 * Runs the full content pipeline and returns draft questions for review.
 */
export async function analyzeContent(req: AuthRequest, res: Response) {
  console.log('[analyzeContent] ENTRY', { userId: req.user?.id, method: req.method, url: req.url });
  if (!req.user) throw new AppError(401, 'Unauthorized');

  const body = analyzeInputSchema.parse(req.body);
  const file = req.file;
  console.log('[analyzeContent] Request parsed', { 
    source: body.source, 
    hasFile: !!file, 
    fileName: file?.originalname,
    fileSize: file?.size,
    mimeType: file?.mimetype,
    bodyKeys: Object.keys(req.body),
    headers: {
      'content-type': req.get('content-type'),
      'content-length': req.get('content-length')
    }
  });

  const startTime = Date.now();

  // Handle paste source — wrap as a TXT file buffer
  if (body.source === 'paste') {
    console.log('[analyzeContent] Handling paste source');
    if (!body.text?.trim()) throw new AppError(400, 'Paste text is required');
    const buffer = Buffer.from(body.text, 'utf-8');
    const syntheticFile = {
      name: 'pasted-content.txt',
      mimeType: 'text/plain',
      buffer,
      size: buffer.length,
    };
    console.log('[analyzeContent] Calling runPipeline for paste');
    return runPipeline(req.user.id, { source: 'file' as ContentSource, file: syntheticFile }, startTime, res);
  }

  // Handle file upload
  if (!file) {
    console.log('[analyzeContent] EXIT - no file provided');
    throw new AppError(400, 'File is required for file source');
  }

  console.log('[analyzeContent] Creating importInput');
  const importInput: ContentInput = {
    source: 'file' as ContentSource,
    file: {
      name: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
      size: file.size,
    },
  };

  console.log('[analyzeContent] Validating input');
  ContentAnalysisEngine.validateInput(importInput);
  console.log('[analyzeContent] Input validated, calling runPipeline');
  return runPipeline(req.user.id, importInput, startTime, res);
}

async function runPipeline(
  userId: string,
  input: ContentInput,
  startTime: number,
  res: Response,
  googleMeta?: GoogleSourceMeta,
) {
  const jobId = randomUUID();
  console.log('[runPipeline] ENTRY', { userId, jobId, fileName: input.file?.name, fileType: input.file?.mimeType });

  try {
    if (!input.file) {
      console.log('[runPipeline] EXIT - No file provided');
      throw new AppError(400, 'File is required');
    }

    console.log('[runPipeline] Input file details', {
      name: input.file.name,
      mimeType: input.file.mimeType,
      size: input.file.size,
      bufferLength: input.file.buffer.length
    });

    let rawExtracted;
    // Force use of Document Intelligence Engine for table support
    console.log('[runPipeline] Forcing Document Intelligence Engine (13-stage reconstruction pipeline) for table support');
    rawExtracted = await DocumentIntelligenceAdapter.extract(input.file);
    console.log('[runPipeline] Document Intelligence Engine completed', {
      extractedCount: rawExtracted?.length || 0,
      extractedType: typeof rawExtracted,
    });

    if (!rawExtracted || rawExtracted.length === 0) {
      console.log('[runPipeline] EXIT - Pipeline returned 0 questions');
      throw new AppError(400, 'No questions could be extracted from the content. Try a document with clear question numbering, options (A/B/C), or an answer key.');
    }

    const validationResult = ValidationEngine.validate(rawExtracted);
    let questions: ValidatedQuestionDraft[] = validationResult.questions;
    if (googleMeta) {
      questions = stampGoogleSourceMetadata(questions, googleMeta);
    }
    const committable = questions.filter((q) => q.validationStatus !== 'rejected');
    console.log('[runPipeline] Questions ready after validation', {
      totalQuestions: questions.length,
      committable: committable.length,
      valid: validationResult.statistics.validQuestions,
      flagged: validationResult.statistics.flaggedQuestions,
      rejected: validationResult.statistics.rejectedQuestions,
    });

    if (committable.length === 0) {
      throw new AppError(400, 'Questions were detected but none passed validation. Check formatting, options, and question text.');
    }

    const highConf = questions.filter(q => q.confidence >= 0.85 || q.confidence >= 85).length;
    const medConf = questions.filter(q => (q.confidence >= 0.6 && q.confidence < 0.85) || (q.confidence >= 60 && q.confidence < 85)).length;
    const lowConf = questions.filter(q => q.confidence < 0.6 || q.confidence < 60).length;

    const seenImageUrls = new Set<string>();
    let tableCount = 0;
    let formulaCount = 0;
    let codeCount = 0;
    let linkCount = 0;
    let audioCount = 0;
    let videoCount = 0;
    let totalConfSum = 0;

    for (const q of questions) {
      const meta = (q.metadata || {}) as any;

      // Image
      const imgUrl = String(
        meta.mediaUrl ||
        meta.media?.url ||
        meta.diagram?.dataUrl ||
        meta.diagram?.url ||
        (Array.isArray(meta.images) ? meta.images[0]?.dataUrl || meta.images[0]?.url : undefined) ||
        (q as any).mediaUrl ||
        (q as any).media?.url ||
        ""
      ).trim();
      if (imgUrl && imgUrl !== "https://" && !seenImageUrls.has(imgUrl)) {
        seenImageUrls.add(imgUrl);
      }

      // Table
      const rawTable = meta.table || (Array.isArray(meta.tables) ? meta.tables[0] : null) || (q as any).table;
      if (rawTable && typeof rawTable === "object") {
        const headers = Array.isArray(rawTable.headers) ? rawTable.headers.filter((h: any) => String(h).trim().length > 0) : [];
        const rows = Array.isArray(rawTable.rows) ? rawTable.rows : Array.isArray(rawTable.cells) ? rawTable.cells : [];
        const validRows = Array.isArray(rows) ? rows.filter((r: any) => Array.isArray(r) && r.some((c: any) => String(c).trim().length > 0)) : [];
        if (headers.length > 0 || validRows.length > 0 || Boolean(rawTable.html?.trim())) {
          tableCount++;
        }
      }

      // Formula
      const rawFormulas = meta.formulas || meta.equations || (q as any).formulas || (q as any).equations;
      if (Array.isArray(rawFormulas) && rawFormulas.length > 0) {
        if (rawFormulas.some((f: any) => typeof f === "string" ? f.trim().length > 0 : Boolean(f?.latex || f?.content || f?.formula))) {
          formulaCount++;
        }
      } else if (typeof rawFormulas === "string" && rawFormulas.trim().length > 0) {
        formulaCount++;
      }

      // Code
      const codeObj = meta.code || (q as any).code || (Array.isArray(meta.codeBlocks) ? meta.codeBlocks[0] : null);
      const starterCode = String(meta.starterCode || (q as any).starterCode || (codeObj?.code || codeObj?.content) || "").trim();
      if (starterCode.length > 0 || q.type === "coding" || q.type === "sql") {
        codeCount++;
      }

      // Link
      const rawLinks = meta.hyperlinks || meta.hyperlink || (q as any).hyperlinks;
      if (Array.isArray(rawLinks) && rawLinks.length > 0) {
        if (rawLinks.some((l: any) => typeof l === "string" ? l.trim().length > 0 : Boolean(l?.url || l?.text))) {
          linkCount++;
        }
      } else if (typeof rawLinks === "string" && rawLinks.trim().length > 0) {
        linkCount++;
      }

      // Audio / Video
      if (meta.media?.kind === "audio" || (q as any).type === "audio_based") audioCount++;
      if (meta.media?.kind === "video" || (q as any).type === "video_based") videoCount++;

      let confNum = typeof q.confidence === "number" ? q.confidence : 0.9;
      if (confNum <= 1) confNum = confNum * 100;
      totalConfSum += Math.round(confNum);
    }

    const overallConfidence = questions.length > 0 ? Math.round(totalConfSum / questions.length) : 0;
    const pagesProcessed = Math.max(
      1,
      ...questions.map((q) => (q.metadata as any)?.sourcePage ?? (q as any).sourcePage ?? 1),
    );
    const fileHash = input.file?.buffer
      ? createHash('sha256').update(input.file.buffer).digest('hex')
      : undefined;

    const allWarnings = questions.flatMap((q) => q.warnings || []);
    const answersDetected = questions.filter((q) => {
      const hasCorrect = (q.options || []).some((o) => o.isCorrect);
      const ca = (q as any).correctAnswer ?? (q.metadata as any)?.correctAnswer ?? (q.metadata as any)?.answerKeySource;
      return hasCorrect || Boolean(ca && String(ca).trim());
    }).length;
    const needsReview = questions.filter((q) => q.validationStatus === 'flagged' || q.validationStatus === 'rejected').length;

    const job: ContentBuilderJob = {
      id: jobId,
      userId,
      status: 'ready',
      questions,
      statistics: {
        sourceType: 'document_intelligence',
        processingTime: Date.now() - startTime,
        questionsFound: questions.length,
        highConfidence: highConf,
        mediumConfidence: medConf,
        lowConfidence: lowConf,
        imagesImported: seenImageUrls.size,
        tablesImported: tableCount,
        formulaeImported: formulaCount,
        codeBlocksImported: codeCount,
        linksImported: linkCount,
        audioImported: audioCount,
        videoImported: videoCount,
        overallConfidence,
        pagesProcessed,
      },
      diagnostics: {
        fileHash,
        fileName: input.file?.name,
        stagesCompleted: [
          'file_validation',
          'native_extraction',
          'layout_analysis',
          'question_detection',
          'answer_key_reconciliation',
          'validation',
          ...(googleMeta ? ['google_docs_ingestion'] : []),
        ],
        flaggedQuestions: validationResult.statistics.flaggedQuestions,
        rejectedQuestions: validationResult.statistics.rejectedQuestions,
        answersDetected,
        needsReview,
        googleResourceType: googleMeta?.sourceType,
        googleResourceId: googleMeta?.resourceId,
        googleSourceUrl: googleMeta?.sourceUrl,
        extractionMethod: googleMeta ? 'docx_export_antigravity_v2' : undefined,
        warnings: allWarnings.slice(0, 50),
        // Dev-only extraction debug (no full source content)
        ...(process.env.NODE_ENV !== 'production'
          ? {
              extractionDebug: {
                sourceCharacters: input.file?.buffer?.length ?? 0,
                detectedQuestions: questions.length,
                detectedTables: tableCount,
                detectedCodeBlocks: codeCount,
                normalizedQuestions: committable.length,
                validationWarnings: allWarnings.length,
                answersDetected,
                needsReview,
              },
            }
          : {}),
      },
      createdAt: new Date(),
    };

    jobStore.set(jobId, job);
    setTimeout(() => jobStore.delete(jobId), 30 * 60 * 1000);

    console.log('[STEP 6] Pipeline finished');
    console.log('[STEP 7] Questions count:', questions.length);

    console.log('[runPipeline] Sending response', { questionCount: questions.length });
    return res.json({
      success: true,
      data: {
        jobId,
        questions: questions.map(mapQuestionForReview),
        statistics: job.statistics,
        diagnostics: job.diagnostics,
      },
    });
  } catch (err) {
    console.log('[runPipeline] EXIT - error', { 
      error: err,
      errorMessage: err instanceof Error ? err.message : 'Unknown error',
      errorStack: err instanceof Error ? err.stack : undefined
    });
    const message = err instanceof Error ? err.message : 'Analysis failed';
    return res.status(500).json({ success: false, error: message });
  }
}

/**
 * GET /api/content-builder/jobs/:jobId
 * Returns job status and questions.
 */
export async function getJob(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');
  const job = jobStore.get(req.params.jobId);
  if (!job || job.userId !== req.user.id) throw new AppError(404, 'Job not found');
  res.json({
    success: true,
    data: {
      status: job.status,
      statistics: job.statistics,
      diagnostics: job.diagnostics,
      questions: job.questions?.map(mapQuestionForReview),
    },
  });
}

/**
 * PATCH /api/content-builder/jobs/:jobId/questions
 * Persist instructor edits from the review workspace before commit.
 */
export async function patchJobQuestions(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');
  const job = jobStore.get(req.params.jobId);
  if (!job || job.userId !== req.user.id) throw new AppError(404, 'Job not found');
  if (job.status !== 'ready') throw new AppError(400, 'Job is not editable');

  const body = patchJobSchema.parse(req.body);
  if (!job.questions?.length) throw new AppError(400, 'Job has no questions');

  const byId = new Map(body.questions.map((q) => [q.id, q]));
  job.questions = job.questions.map((existing) => {
    const patch = byId.get(existing.id);
    if (!patch) return existing;
    return {
      ...existing,
      ...(patch.text !== undefined ? { text: patch.text, statement: patch.text } : {}),
      ...(patch.type !== undefined ? { type: patch.type as ValidatedQuestionDraft['type'] } : {}),
      ...(patch.options !== undefined ? {
        options: patch.options.map((o, i) => ({
          id: o.id || existing.options[i]?.id || randomUUID(),
          text: o.text,
          isCorrect: o.isCorrect !== undefined ? Boolean(o.isCorrect) : Boolean(existing.options[i]?.isCorrect),
          order: o.order ?? i,
        })),
      } : {}),
      ...(patch.correctAnswer !== undefined ? {
        correctAnswer: Array.isArray(patch.correctAnswer) ? patch.correctAnswer.join(', ') : patch.correctAnswer,
      } : {}),
      ...(patch.explanation !== undefined ? { explanation: patch.explanation } : {}),
      ...(patch.metadata !== undefined ? { metadata: { ...(existing.metadata || {}), ...patch.metadata } } : {}),
    };
  });

  jobStore.set(job.id, job);
  res.json({
    success: true,
    data: {
      questions: job.questions.map(mapQuestionForReview),
    },
  });
}

/**
 * POST /api/content-builder/jobs/:jobId/commit
 * User has reviewed questions. Creates a real quiz in the database.
 * If quizId is provided in body, updates existing quiz instead of creating new.
 */
export async function commitToQuiz(req: AuthRequest, res: Response) {
  console.log('[commitToQuiz] ENTRY', { 
    userId: req.user?.id,
    jobId: req.params.jobId,
    bodyKeys: Object.keys(req.body)
  });
  if (!req.user) throw new AppError(401, 'Unauthorized');

  const job = jobStore.get(req.params.jobId);
  console.log('[commitToQuiz] Job retrieved', { 
    hasJob: !!job,
    jobStatus: job?.status,
    jobQuestionCount: job?.questions?.length || 0,
    userIdMatch: job?.userId === req.user.id
  });
  if (!job || job.userId !== req.user.id) throw new AppError(404, 'Job not found');
  if (job.status !== 'ready') throw new AppError(400, 'Job is not ready for commit');
  if (!job.questions?.length) throw new AppError(400, 'No questions to commit');

  const body = commitSchema.parse(req.body);
  console.log('[commitToQuiz] Request body parsed', { 
    title: body.title,
    questionIdsCount: body.questionIds?.length || 0,
    hasDescription: !!body.description,
    quizId: body.quizId
  });

  // Filter to selected question IDs (or use all non-rejected ones)
  let selectedQuestions = job.questions.filter(q => q.validationStatus !== 'rejected');
  console.log('[commitToQuiz] Non-rejected questions', { count: selectedQuestions.length });
  if (body.questionIds?.length) {
    selectedQuestions = selectedQuestions.filter(q => body.questionIds!.includes(q.id));
    console.log('[commitToQuiz] Filtered to selected IDs', { count: selectedQuestions.length });
  }

  if (selectedQuestions.length === 0) {
    console.log('[commitToQuiz] EXIT - no valid questions selected');
    throw new AppError(400, 'No valid questions selected');
  }

  console.log('[commitToQuiz] Converting to GateHub Quiz format');
  // Convert to GateHub Quiz format
  const gatehubQuiz = await QuizConverter.convert(selectedQuestions, {
    title: body.title,
    description: body.description,
  });
  console.log('[commitToQuiz] Quiz converted', { 
    quizQuestionCount: gatehubQuiz.questions.length,
    quizTitle: gatehubQuiz.title
  });

  let quiz;

  // If quizId is provided, update existing quiz instead of creating new
  if (body.quizId) {
    console.log('[commitToQuiz] Updating existing quiz', { quizId: body.quizId });
    
    // Delete existing questions for the quiz
    await prisma.question.deleteMany({
      where: { quizId: body.quizId }
    });
    console.log('[commitToQuiz] Existing questions deleted');

    // Update quiz metadata
    quiz = await prisma.quiz.update({
      where: { id: body.quizId },
      data: {
        title: gatehubQuiz.title,
        description: gatehubQuiz.description || '',
        subject: gatehubQuiz.subject || '',
        metadata: {
          version: 1,
          settings: gatehubQuiz.metadata.settings,
          sections: gatehubQuiz.metadata.sections,
          source: 'content_builder',
        } as any,
        questions: {
          create: gatehubQuiz.questions.map((q, idx) => {
            const resolvedMediaUrl = (q as any).media?.url || q.metadata?.mediaUrl || (q.metadata?.media as any)?.url || (q.metadata?.diagram as any)?.url || (q.metadata?.diagram as any)?.dataUrl || (Array.isArray(q.metadata?.images) ? q.metadata.images[0]?.url || q.metadata.images[0]?.dataUrl : undefined);
            const mediaObj = (q as any).media || q.metadata?.media || (resolvedMediaUrl ? { url: resolvedMediaUrl, kind: 'image' } : undefined);

            return {
              text: q.text,
              type: q.type,
              marks: q.marks,
              order: idx,
              difficulty: q.difficulty,
              negativeMarks: q.negativeMarks,
              bloomLevel: q.bloomLevel,
              explanation: q.explanation,
              metadata: {
                ...(typeof q.metadata === 'object' && q.metadata !== null ? q.metadata : {}),
                hints: q.metadata?.hints || [],
                tags: q.metadata?.tags || [],
                estimatedSeconds: q.metadata?.estimatedSeconds || 60,
                contentConfidence: q.metadata?.importConfidence ?? q.metadata?.contentConfidence ?? 0.9,
                contentWarnings: q.metadata?.importWarnings || [],
                mediaUrl: resolvedMediaUrl,
                media: mediaObj,
              } as any,
              options: {
                create: (q.options || []).map((opt, oi) => ({
                  text: opt.text,
                  isCorrect: opt.isCorrect,
                  order: oi,
                })),
              },
            };
          }),
        },
      },
    });
    console.log('[commitToQuiz] Existing quiz updated', { quizId: quiz.id });
  } else {
    // Create new quiz (original behavior)
    console.log('[commitToQuiz] Creating new quiz in database');
    quiz = await prisma.quiz.create({
      data: {
        title: gatehubQuiz.title,
        description: gatehubQuiz.description || '',
        subject: gatehubQuiz.subject || '',
        visibility: 'private',
        authorId: req.user.id,
        metadata: {
          version: 1,
          settings: gatehubQuiz.metadata.settings,
          sections: gatehubQuiz.metadata.sections,
          source: 'content_builder',
        } as any,
        questions: {
          create: gatehubQuiz.questions.map((q, idx) => {
            const resolvedMediaUrl = (q as any).media?.url || q.metadata?.mediaUrl || (q.metadata?.media as any)?.url || (q.metadata?.diagram as any)?.url || (q.metadata?.diagram as any)?.dataUrl || (Array.isArray(q.metadata?.images) ? q.metadata.images[0]?.url || q.metadata.images[0]?.dataUrl : undefined);
            const mediaObj = (q as any).media || q.metadata?.media || (resolvedMediaUrl ? { url: resolvedMediaUrl, kind: 'image' } : undefined);

            return {
              text: q.text,
              type: q.type,
              marks: q.marks,
              order: idx,
              difficulty: q.difficulty,
              negativeMarks: q.negativeMarks,
              bloomLevel: q.bloomLevel,
              explanation: q.explanation,
              metadata: {
                ...(typeof q.metadata === 'object' && q.metadata !== null ? q.metadata : {}),
                hints: q.metadata?.hints || [],
                tags: q.metadata?.tags || [],
                estimatedSeconds: q.metadata?.estimatedSeconds || 60,
                contentConfidence: q.metadata?.importConfidence ?? q.metadata?.contentConfidence ?? 0.9,
                contentWarnings: q.metadata?.importWarnings || [],
                mediaUrl: resolvedMediaUrl,
                media: mediaObj,
              } as any,
              options: {
                create: (q.options || []).map((opt, oi) => ({
                  text: opt.text,
                  isCorrect: opt.isCorrect,
                  order: oi,
                })),
              },
            };
          }),
        },
      },
    });
    console.log('[commitToQuiz] New quiz created in database', { quizId: quiz.id });
  }

  job.status = 'committed';
  console.log('[commitToQuiz] Job status updated to committed');

  console.log('[commitToQuiz] EXIT - success', { quizId: quiz.id, title: quiz.title });
  return res.json({
    success: true,
    data: {
      quizId: quiz.id,
      title: quiz.title,
      questionCount: selectedQuestions.length,
    },
  });
}

/**
 * POST /api/content-builder/analyze-google
 * Analyzes content from Google Workspace (Docs/Forms) using Document Intelligence Engine
 */
export async function analyzeGoogleContent(req: AuthRequest, res: Response) {
  console.log('[analyzeGoogleContent] ENTRY', { userId: req.user?.id, bodyKeys: Object.keys(req.body || {}) });
  if (!req.user) throw new AppError(401, 'Unauthorized');

  const rawInput = String(req.body.fileId || req.body.url || '').trim();
  logGoogleExtractionEvent('analyze_google_received', {
    userId: req.user.id,
    sourceUrl: rawInput,
  });

  const parsedInitial = parseGoogleResourceUrl(rawInput);
  if (!parsedInitial) {
    logGoogleExtractionEvent('analyze_google_invalid_url', { sourceUrl: rawInput });
    return res.status(400).json({
      success: false,
      error: 'INVALID_GOOGLE_URL',
      message: getGoogleResourceErrorMessage('INVALID_GOOGLE_URL'),
    });
  }

  const startTime = Date.now();
  const fileName = req.body.fileName;

  try {
    let parsed = parsedInitial;
    if (parsed.needsTypeResolution || parsed.resourceType === 'google_drive') {
      parsed = await resolveGoogleDriveResource({
        userId: req.user.id,
        parsed,
        fileName,
        startTime,
      });
    }

    const { resourceType, resourceId: targetFileId, sourceUrl, normalizedUrl } = parsed;
    const isGoogleDocsLink = resourceType === 'google_docs';

    logGoogleExtractionEvent('resource_identified', {
      resourceType,
      resourceId: targetFileId,
      normalizedUrl,
      authenticationState: 'pending',
    });

    const googleDocsMeta: GoogleSourceMeta = {
      sourceType: 'google_docs',
      sourceUrl: normalizedUrl || sourceUrl,
      resourceId: targetFileId,
      resourceTitle: fileName || 'Google Document',
    };

    const ingestionCtx = {
      userId: req.user.id,
      parsed,
      fileName,
      startTime,
    };

    if (isGoogleDocsLink) {
      const docResult = await ingestGoogleDoc(ingestionCtx);
      googleDocsMeta.resourceTitle = docResult.documentTitle || googleDocsMeta.resourceTitle;

      logGoogleExtractionEvent('docs_pipeline_handoff', {
        resourceId: targetFileId,
        extractionMethod: docResult.extractionMethod,
        bytes: docResult.docxBuffer.length,
        durationMs: Date.now() - startTime,
      });

      return runPipeline(
        req.user.id,
        {
          source: 'file' as ContentSource,
          file: {
            name: docResult.fileName,
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            buffer: docResult.docxBuffer,
            size: docResult.docxBuffer.length,
          },
        },
        startTime,
        res,
        googleDocsMeta,
      );
    }

    if (resourceType !== 'google_forms') {
      return res.status(400).json({
        success: false,
        error: 'GOOGLE_RESOURCE_TYPE_UNSUPPORTED',
        message: getGoogleResourceErrorMessage('GOOGLE_RESOURCE_TYPE_UNSUPPORTED'),
      });
    }

    const formResult = await ingestGoogleForm(ingestionCtx);

    logGoogleExtractionEvent('forms_pipeline_handoff', {
      resourceId: targetFileId,
      extractionMethod: formResult.extractionMethod,
      questionCount: formResult.drafts.length,
      durationMs: Date.now() - startTime,
    });

    return respondGoogleFormsReviewJob(req.user.id, startTime, res, formResult.drafts, {
      sourceUrl: normalizedUrl || sourceUrl,
      resourceId: targetFileId,
      formTitle: formResult.formTitle,
      extractionMethod: formResult.extractionMethod,
      fidelityAudit: formResult.fidelity as unknown as Record<string, unknown>,
    });
  } catch (err: unknown) {
    const mapped = toGoogleApiResponse(err);
    // Keep AUTH_REQUIRED alias so existing frontend auth modal continues to work.
    let errorCode = mapped.error;
    if (mapped.error === 'GOOGLE_AUTH_REQUIRED') errorCode = 'AUTH_REQUIRED';
    else if (mapped.error === 'GOOGLE_EMPTY_RESOURCE') errorCode = 'NO_QUESTIONS';
    else if (mapped.error === 'GOOGLE_RESOURCE_NOT_FOUND') errorCode = 'DOCUMENT_NOT_FOUND';

    logGoogleExtractionEvent('analyze_google_failed', {
      code: errorCode,
      httpStatus: mapped.httpStatus,
      durationMs: Date.now() - startTime,
      message: mapped.message,
    });

    if (err instanceof GoogleIngestionError || String(mapped.error).startsWith('GOOGLE_') || mapped.error === 'AUTH_REQUIRED') {
      return res.status(mapped.httpStatus).json({
        success: false,
        error: errorCode,
        message: mapped.message || getGoogleExtractionUserMessage(String(errorCode)),
      });
    }

    console.error('[analyzeGoogleContent] Exception caught:', err instanceof Error ? err.message : err);
    return res.status(500).json({
      success: false,
      error: 'GOOGLE_EXTRACTION_FAILED',
      message: getGoogleExtractionUserMessage('GOOGLE_EXTRACTION_FAILED'),
    });
  }
}

/**
 * GET /api/content-builder/supported-sources
 * Returns the list of supported content source types.
 */
export async function getSupportedSources(_req: AuthRequest, res: Response) {
  res.json({
    success: true,
    data: {
      sources: [
        { id: 'file_pdf',      label: 'PDF',          formats: '.pdf',                         v: 1 },
        { id: 'file_docx',     label: 'Word Document', formats: '.docx, .doc',                 v: 1 },
        { id: 'file_txt',      label: 'Plain Text',    formats: '.txt',                         v: 1 },
        { id: 'file_markdown', label: 'Markdown',      formats: '.md, .markdown',               v: 1 },
        { id: 'paste',         label: 'Paste Text',    formats: 'plain text',                   v: 1 },
        { id: 'file_pptx',     label: 'PowerPoint',    formats: '.pptx, .ppt',                 v: 1 },
        { id: 'file_csv',      label: 'CSV / Excel',   formats: '.csv, .xls, .xlsx',            v: 1 },
        { id: 'file_image',    label: 'Image',         formats: 'PNG, JPEG, GIF, BMP, TIFF',   v: 1 },
        { id: 'google_docs',   label: 'Google Docs',   formats: 'Google Documents',            v: 1 },
        { id: 'google_forms',  label: 'Google Forms',  formats: 'Google Forms',                 v: 1 },
      ],
    },
  });
}
