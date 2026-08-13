import { Response } from 'express';
import multer from 'multer';
import { AuthRequest } from '../middlewares/auth.js';
import { AppError } from '../middlewares/errorHandler.js';
import { AntiGravityV2Engine } from '../services/antigravityV2/AntiGravityV2Engine.js';
import { UiMapper } from '../services/antigravityV2/13_UiMapper.js';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export const v2Upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

/**
 * POST /api/antigravity-v2/extract
 * Extracts ANY educational document through the 14-stage AntiGravity V2 Document Intelligence Engine
 */
export async function extractDocumentV2(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');

  const file = req.file;
  const { url, title, language } = req.body;

  if (!file && !url) {
    throw new AppError(400, 'Either file upload or URL is required');
  }

  console.log('[antigravityV2Controller.extractDocumentV2] Processing file:', file?.originalname || title || url);

  const result = await AntiGravityV2Engine.processDocument(
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
      error: result.error || 'AntiGravity V2 Document Intelligence Extraction failed',
    });
  }

  const quizBuilderView = UiMapper.mapToQuizBuilder(result);

  res.json({
    success: true,
    data: {
      result,
      quizBuilderView,
    },
  });
}

/**
 * GET /api/antigravity-v2/supported-formats
 */
export async function getSupportedFormatsV2(_req: AuthRequest, res: Response) {
  res.json({
    success: true,
    data: {
      documents: ['pdf', 'scanned_pdf', 'native_pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt', 'rtf', 'html', 'markdown', 'epub', 'odt', 'ods', 'odp'],
      workspace: ['google_docs', 'google_slides', 'google_drive'],
      images: ['png', 'jpg', 'jpeg', 'tiff', 'bmp', 'webp', 'svg', 'heic', 'screenshots', 'camera_images', 'whiteboards', 'handwritten_notes'],
      archives: ['zip'],
    },
  });
}
