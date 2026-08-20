/**
 * Classroom Studio Routes
 * HTTP routes for the Interactive Classroom Studio
 */

import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middlewares/auth.js';
import * as classroomStudioController from '../controllers/classroomStudioController.js';

// Configure multer for file uploads
const CLASSROOM_PPTX_MAX_BYTES = 100 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: CLASSROOM_PPTX_MAX_BYTES,
  },
});

/** Middleware wrapper: only invoke multer for multipart/form-data requests.
 *  This prevents multer from interfering with application/json bodies. */
const handleUploadMiddleware = (req: any, res: any, next: any) => {
  if (!req.is('multipart/form-data')) {
    next();
    return;
  }
  upload.single('file')(req, res, (err: any) => {
    if (!err) {
      next();
      return;
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      const actualBytes = Number(req.headers['content-length'] || 0) || undefined;
      console.warn('[CLASSROOM_SOURCE] fileBytes=' + (actualBytes ?? 'unknown') + ' maxBytes=' + CLASSROOM_PPTX_MAX_BYTES);
      return res.status(413).json({
        success: false,
        stage: 'validation',
        code: 'CLASSROOM_PPTX_TOO_LARGE',
        maxBytes: CLASSROOM_PPTX_MAX_BYTES,
        actualBytes,
        error: {
          code: 'CLASSROOM_PPTX_TOO_LARGE',
          message: `PowerPoint files must be 100 MB or smaller (maxBytes=${CLASSROOM_PPTX_MAX_BYTES}${actualBytes ? ` actualBytes=${actualBytes}` : ''}). Compress images in the deck, then upload the .pptx again.`,
        },
      });
    }
    return res.status(400).json({
      success: false,
      stage: 'validation',
      error: err.message || 'The PowerPoint file could not be uploaded',
    });
  });
};

const router = Router();

const regenerateVisualsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'CLASSROOM_ASSET_RATE_LIMITED', message: 'Too many regenerate requests. Please wait.' } },
});

// All routes require authentication
router.use(authenticate);

// Presentation routes
router.post('/presentations', classroomStudioController.createPresentation);
router.get('/presentations', classroomStudioController.getPresentations);
router.get('/presentations/stats', classroomStudioController.getPresentationStats);
router.get('/presentations/:id/assets/source/:filename', classroomStudioController.servePresentationAsset);
router.get('/presentations/:id/assets/renders/:filename', classroomStudioController.servePresentationAsset);
router.get('/presentations/:id/assets/visuals/:filename', classroomStudioController.servePresentationAsset);
router.get('/presentations/:id/assets/:kind/:filename', classroomStudioController.servePresentationAsset);
router.get('/presentations/:id/visual-health', classroomStudioController.getPresentationVisualHealth);
router.post('/presentations/:id/regenerate-visuals', regenerateVisualsLimiter, classroomStudioController.regeneratePresentationVisuals);
router.post('/presentations/:id/slides/:slideId/retry-visual', regenerateVisualsLimiter, classroomStudioController.retrySlideVisual);
router.get('/presentations/:id', classroomStudioController.getPresentation);
router.put('/presentations/:id', classroomStudioController.updatePresentation);
router.delete('/presentations/:id', classroomStudioController.deletePresentation);
router.post('/presentations/:id/duplicate', classroomStudioController.duplicatePresentation);

// Slide routes
router.post('/slides', classroomStudioController.createSlide);
router.get('/presentations/:presentationId/slides', classroomStudioController.getSlides);
router.get('/slides/:id', classroomStudioController.getSlide);
router.put('/slides/:id', classroomStudioController.updateSlide);
router.delete('/slides/:id', classroomStudioController.deleteSlide);
router.post('/presentations/:presentationId/slides/reorder', classroomStudioController.reorderSlides);
router.post('/slides/:id/duplicate', classroomStudioController.duplicateSlide);

// Interaction routes
router.post('/interactions', classroomStudioController.createInteraction);
router.get('/slides/:slideId/interactions', classroomStudioController.getInteractions);
router.put('/interactions/:id', classroomStudioController.updateInteraction);
router.delete('/interactions/:id', classroomStudioController.deleteInteraction);
router.post('/interactions/:id/duplicate', classroomStudioController.duplicateInteraction);

// Session routes
router.post('/sessions', classroomStudioController.createSession);
router.get('/sessions', classroomStudioController.getSessions);
router.get('/sessions/room/:roomCode', classroomStudioController.getSessionByRoomCode);
router.get('/sessions/:sessionId/recovery-state', classroomStudioController.getSessionRecoveryState);
router.get('/sessions/:id', classroomStudioController.getSession);
router.put('/sessions/:id', classroomStudioController.updateSession);
router.post('/sessions/:id/start', classroomStudioController.startSession);
router.post('/sessions/:id/end', classroomStudioController.endSession);
router.post('/sessions/:id/cancel', classroomStudioController.cancelSession);
router.delete('/sessions/:id', classroomStudioController.deleteSession);
router.post('/sessions/:id/current-slide', classroomStudioController.updateCurrentSlide);
router.post('/sessions/:id/activate-interaction', classroomStudioController.activateInteraction);
router.post('/sessions/:id/deactivate-interaction', classroomStudioController.deactivateInteraction);
router.post('/sessions/:id/quick-interaction', classroomStudioController.quickCreateAndLaunchInteraction);
router.post('/sessions/join-token/:token', classroomStudioController.joinSessionByToken);

// Interaction reopen route (clears responses, re-activates for re-vote)
router.post('/sessions/:sessionId/interactions/:interactionId/reopen', classroomStudioController.reopenInteraction);

// Participant routes
router.post('/sessions/:sessionId/join', classroomStudioController.joinSession);
router.post('/sessions/:sessionId/leave', classroomStudioController.leaveSession);
router.get('/sessions/:sessionId/participants', classroomStudioController.getParticipants);
router.post('/sessions/:sessionId/raise-hand', classroomStudioController.toggleRaisedHand);
router.post('/sessions/:sessionId/clear-hands', classroomStudioController.clearRaisedHands);

// Response routes
router.post('/sessions/:sessionId/interactions/:interactionId/responses', classroomStudioController.submitResponse);
router.get('/sessions/:sessionId/responses', classroomStudioController.getResponses);
router.get('/sessions/:sessionId/interactions/:interactionId/summary', classroomStudioController.getResponseSummary);

// QR Code routes
router.post('/sessions/:sessionId/qr', classroomStudioController.generateSessionQRCode);
router.post('/sessions/:sessionId/slides/:slideId/qr', classroomStudioController.generateSlideQRCode);
router.post('/sessions/:sessionId/interactions/:interactionId/qr', classroomStudioController.generateInteractionQRCode);

// Analytics routes
router.get('/sessions/:sessionId/analytics/realtime', classroomStudioController.getRealTimeAnalytics);
router.get('/sessions/:sessionId/analytics/slides', classroomStudioController.getSlideAnalytics);
router.get('/sessions/:sessionId/analytics/report', classroomStudioController.getSessionReport);
router.get('/sessions/:sessionId/analytics/export', classroomStudioController.exportSessionReport);

// AI Recommendation routes
router.post('/slides/:slideId/analyze', classroomStudioController.analyzeSlideContent);
router.get('/sessions/:sessionId/insights', classroomStudioController.getTeachingInsights);

// Import routes
router.post('/import', handleUploadMiddleware, classroomStudioController.importPresentation);
router.post('/google-slides/import-public', classroomStudioController.importPublicGoogleSlides);
router.post('/presentations/:id/sync', classroomStudioController.syncPresentation);
router.get('/import/sources/:sourceType', classroomStudioController.getImportSources);

// Student Question routes (new)
router.post('/sessions/:sessionId/questions', classroomStudioController.submitStudentQuestion);
router.get('/sessions/:sessionId/questions', classroomStudioController.getStudentQuestions);
router.put('/sessions/:sessionId/questions/:questionId', classroomStudioController.updateStudentQuestion);

// Chat history route (new)
router.get('/sessions/:sessionId/chat', classroomStudioController.getChatMessages);

// Automated slide interaction parser, reveal, and export routes
router.get('/slides/:id/detect-interaction', classroomStudioController.detectSlideInteraction);
router.post('/sessions/:id/launch-auto-interaction', classroomStudioController.launchAutoInteraction);
router.post('/sessions/:id/reveal-answer', classroomStudioController.revealInteractionAnswer);
router.get('/sessions/:id/export/csv', classroomStudioController.exportSessionCsv);
router.get('/sessions/:id/export/pdf', classroomStudioController.exportSessionPdf);

router.post('/sessions/:id/polls', classroomStudioController.createSessionPoll);
router.get('/sessions/:id/polls', classroomStudioController.listSessionPolls);
router.get('/sessions/:id/polls/:pollId', classroomStudioController.getSessionPoll);
router.patch('/sessions/:id/polls/:pollId', classroomStudioController.updateSessionPoll);
router.post('/sessions/:id/polls/:pollId/launch', classroomStudioController.launchSessionPoll);
router.post('/sessions/:id/polls/:pollId/close', classroomStudioController.closeSessionPoll);
router.post('/sessions/:id/polls/:pollId/duplicate', classroomStudioController.duplicateSessionPoll);
router.delete('/sessions/:id/polls/:pollId', classroomStudioController.deleteSessionPoll);

export default router;