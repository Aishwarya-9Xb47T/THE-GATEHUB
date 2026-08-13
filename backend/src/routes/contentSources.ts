/**
 * Content Sources Routes
 * 
 * Routes for processing content from various sources (PDF, DOCX, Google Docs, etc.)
 */

import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import * as ctrl from '../controllers/contentSourcesController.js';

const router = express.Router();

// Process content from a source
router.post('/process', authenticate, ctrl.processContent as any);

// Get available content source types
router.get('/types', authenticate, ctrl.getSourceTypes as any);

export default router;
