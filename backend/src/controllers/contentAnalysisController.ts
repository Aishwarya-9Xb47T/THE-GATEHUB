/**
 * Content Analysis Controller
 * Handles API endpoints for the content analysis pipeline
 */

import { Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import { ContentAnalysisEngine } from '../services/assessmentStudio/import/ContentAnalysisEngine.js';
import { AntiGravityV2Engine } from '../services/antigravityV2/AntiGravityV2Engine.js';
import { DocumentIntelligenceAdapter } from '../services/assessmentStudio/import/extractors/DocumentIntelligenceAdapter.js';
import { ContentInput, ContentSource, SourceType } from '../services/assessmentStudio/import/unifiedTypes.js';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const contentAnalysisUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowedExtensions = ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.md', '.markdown', '.txt', '.html', '.htm', '.csv', '.xls', '.xlsx', '.xml'];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    const ok = allowedExtensions.includes(ext);
    cb(null, ok);
  },
});

const contentInputSchema = z.object({
  source: z.enum(['file', 'url', 'google_docs', 'google_forms']),
  url: z.string().url().optional(),
  googleAccessToken: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
});

/**
 * POST /api/assessment-studio/content/analyze
 * Analyzes content and extracts questions
 */
export async function analyzeContent(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');

  const body = contentInputSchema.parse(req.body);
  const file = req.file;

  // Build content input
  const contentInput: ContentInput = {
    source: body.source as ContentSource,
    url: body.url,
    googleAccessToken: body.googleAccessToken,
    file: file ? {
      name: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
      size: file.size,
    } : undefined,
  };

  // Validate input
  ContentAnalysisEngine.validateInput(contentInput);

  // Run content analysis pipeline with progress tracking
  const progressUpdates: any[] = [];

  const result = await ContentAnalysisEngine.analyze(contentInput, {
    title: body.title,
    description: body.description,
    onProgress: (update) => {
      progressUpdates.push(update);
    },
  });

  if (!result.success) {
    // Return structured error from ContentAnalysisEngine
    return res.status(500).json({
      success: false,
      error: result.error,
    });
  }

  res.json({
    success: true,
    data: {
      quizId: result.quizId,
      statistics: result.statistics,
      progress: progressUpdates,
    },
  });
}

/**
 * POST /api/assessment-studio/content/analyze-with-document-intelligence
 * Analyzes content using DocumentIntelligenceEngine and returns quizBuilderModel
 * This endpoint preserves rich content like tables, code blocks, etc.
 */
export async function analyzeWithDocumentIntelligence(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');

  const file = req.file;
  if (!file) throw new AppError(400, 'File required');

  console.log('[analyzeWithDocumentIntelligence] Processing file:', file.originalname);

  try {
    // Delegate directly to the master AntiGravity V2 Document Intelligence Engine
    const result = await AntiGravityV2Engine.processDocument({
      buffer: file.buffer,
      name: file.originalname,
      mimeType: file.mimetype,
    });

    if (!result.success) {
      throw new AppError(500, `AntiGravity V2 document extraction failed: ${result.error || 'Unknown error'}`);
    }

    console.log('[analyzeWithDocumentIntelligence] AntiGravity V2 engine extracted questions:', result.questions.length);

    res.json({
      success: true,
      data: {
        questions: result.questions,
        knowledgeObject: result,
        validation: result.validation,
        statistics: {
          totalQuestions: result.questions.length,
          questionsWithTables: result.tables.length,
          questionsWithCode: result.codeBlocks.length,
          questionsWithImages: result.images.length,
        },
      },
    });
  } catch (error) {
    console.error('[analyzeWithDocumentIntelligence] Error:', error);
    throw new AppError(500, `Document intelligence analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * GET /api/assessment-studio/content/supported-sources
 * Returns list of supported source types
 */
export async function getSupportedSources(_req: AuthRequest, res: Response) {
  const sources = ContentAnalysisEngine.getSupportedSourceTypes();
  res.json({
    success: true,
    data: {
      sources,
    },
  });
}
