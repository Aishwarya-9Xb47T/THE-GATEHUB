/**
 * Google Workspace Routes
 * API endpoints for Google Workspace integration
 */

import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import * as ctrl from '../controllers/googleWorkspaceController.js';

export const googleWorkspaceRouter = Router();

// OAuth endpoints
googleWorkspaceRouter.post('/auth', authenticate, ctrl.initiateAuth as any);
googleWorkspaceRouter.get('/callback', ctrl.handleCallback as any);

// File listing endpoints
googleWorkspaceRouter.get('/files', authenticate, ctrl.listFiles as any);
googleWorkspaceRouter.get('/search', authenticate, ctrl.searchFiles as any);
googleWorkspaceRouter.get('/folder/:folderId/files', authenticate, ctrl.getFolderFiles as any);

// File content endpoint
googleWorkspaceRouter.get('/file/:fileId/content', authenticate, ctrl.getFileContent as any);

// Auth status endpoint
googleWorkspaceRouter.get('/auth/status', authenticate, ctrl.checkAuthStatus as any);
