/**
 * Classroom Studio Routes
 * HTTP routes for the Interactive Classroom Studio
 */

import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middlewares/auth.js';
import * as classroomStudioController from '../controllers/classroomStudioController.js';

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

/** Middleware wrapper: only invoke multer for multipart/form-data requests.
 *  This prevents multer from interfering with application/json bodies. */
const handleUploadMiddleware = (req: any, res: any, next: any) => {
  if (req.is('multipart/form-data')) {
    return upload.single('file')(req, res, next);
  }
  next();
};

const router = Router();

// All routes require authentication
router.use(authenticate);

// Presentation routes
router.post('/presentations', classroomStudioController.createPresentation);
router.get('/presentations', classroomStudioController.getPresentations);
router.get('/presentations/stats', classroomStudioController.getPresentationStats);
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