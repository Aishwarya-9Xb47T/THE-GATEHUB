import { Response } from 'express';
import multer from 'multer';
import { AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import { MultimodalKnowledgeEngine } from '../services/multimodalKnowledge/MultimodalKnowledgeEngine.js';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export const multimodalUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

/**
 * POST /api/multimodal-knowledge/extract
 * Extracts content from ANY uploaded document, image, or URL into a structured Knowledge Object
 */
export async function extractKnowledge(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');

  const file = req.file;
  const { url, title, language } = req.body;

  if (!file && !url) {
    throw new AppError(400, 'Either file upload or URL parameter is required');
  }

  console.log('[multimodalKnowledgeController.extractKnowledge] Processing request:', {
    fileName: file?.originalname,
    url,
  });

  const result = await MultimodalKnowledgeEngine.process(
    {
      name: file?.originalname || title || 'Document',
      mimeType: file?.mimetype,
      buffer: file?.buffer,
      url,
    },
    { language }
  );

  if (!result.success) {
    return res.status(500).json({
      success: false,
      error: result.error || 'Multimodal knowledge extraction failed',
    });
  }

  res.json({
    success: true,
    data: result,
  });
}

/**
 * GET /api/multimodal-knowledge/supported-formats
 */
export async function getSupportedFormats(_req: AuthRequest, res: Response) {
  res.json({
    success: true,
    data: {
      documents: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'odp', 'ods', 'csv', 'excel', 'markdown', 'html', 'epub'],
      workspace: ['google_docs', 'google_slides', 'google_drive'],
      images: ['png', 'jpeg', 'webp', 'tiff', 'bmp', 'svg', 'screenshots', 'scanned_docs', 'whiteboards', 'handwritten_notes'],
      archives: ['zip'],
    },
  });
}
