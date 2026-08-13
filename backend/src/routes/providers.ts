/**
 * Providers Routes
 * 
 * Routes for cloud provider operations (Google, OneDrive, Dropbox, etc.)
 */

import express from 'express';
import {
  getAvailableProviders,
  checkProviderStatus,
  initiateAuth,
  handleCallback,
  listFiles,
  searchFiles,
  downloadFile,
  getFileMetadata,
} from '../controllers/providersController.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

// Get all available providers
router.get('/', authenticate, getAvailableProviders as any);

// Check status of a specific provider
router.get('/:providerId/status', authenticate, checkProviderStatus as any);

// Initiate authentication for a provider
router.post('/:providerId/auth/initiate', authenticate, initiateAuth as any);

// Handle OAuth callback from a provider (no auth required - this is the callback endpoint)
router.get('/:providerId/callback', handleCallback as any);

// List files from a provider
router.get('/:providerId/files', authenticate, listFiles as any);

// Search files in a provider
router.get('/:providerId/files/search', authenticate, searchFiles as any);

// Download a file from a provider
router.get('/:providerId/files/:fileId', authenticate, downloadFile as any);

// Get file metadata from a provider
router.get('/:providerId/files/:fileId/metadata', authenticate, getFileMetadata as any);

export default router;
