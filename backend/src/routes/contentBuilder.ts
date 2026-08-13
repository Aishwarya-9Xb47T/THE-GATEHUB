import { Router } from 'express';
import { authenticate, requireRole } from '../middlewares/auth.js';
import {
  contentBuilderUpload,
  analyzeContent,
  analyzeGoogleContent,
  getJob,
  commitToQuiz,
  getSupportedSources,
  patchJobQuestions,
} from '../controllers/contentBuilderController.js';

export const contentBuilderRouter = Router();

// Test endpoint to verify router is working
contentBuilderRouter.get('/test', (req, res) => {
  console.log('[contentBuilderRouter] Test endpoint called');
  res.json({ success: true, message: 'Content builder router is working' });
});

// Analyze content and return draft questions for review
// Note: multer middleware must be applied BEFORE authentication for file parsing
contentBuilderRouter.post(
  '/analyze',
  (req, res, next) => {
    console.log('[contentBuilderRouter] /analyze POST request received');
    console.log('[contentBuilderRouter] Content-Type:', req.get('content-type'));
    console.log('[contentBuilderRouter] Body keys:', Object.keys(req.body));
    next();
  },
  contentBuilderUpload.single('file'),
  (req, res, next) => {
    console.log('[contentBuilderRouter] After multer - file:', req.file ? 'present' : 'missing');
    console.log('[contentBuilderRouter] After multer - body:', req.body);
    next();
  },
  authenticate,
  requireRole('instructor', 'admin', 'super_admin'),
  analyzeContent
);

// Analyze content from Google Workspace (Docs/Forms)
contentBuilderRouter.post('/analyze-google', authenticate, requireRole('instructor', 'admin', 'super_admin'), analyzeGoogleContent);

// Get job status
contentBuilderRouter.get('/jobs/:jobId', authenticate, requireRole('instructor', 'admin', 'super_admin'), getJob);

// Update reviewed/edited questions before commit
contentBuilderRouter.patch('/jobs/:jobId/questions', authenticate, requireRole('instructor', 'admin', 'super_admin'), patchJobQuestions);

// Commit reviewed questions to a new quiz
contentBuilderRouter.post('/jobs/:jobId/commit', authenticate, requireRole('instructor', 'admin', 'super_admin'), commitToQuiz);

// Supported content source types
contentBuilderRouter.get('/supported-sources', authenticate, requireRole('instructor', 'admin', 'super_admin'), getSupportedSources);
