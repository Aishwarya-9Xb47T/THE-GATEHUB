/**
 * Providers Controller
 * 
 * Generic controller for handling cloud provider operations.
 * This controller works with any provider registered in the ProviderRegistry.
 */

import type { Request, Response } from 'express';
import { AppError } from '../middlewares/errorHandler.js';
import type { AuthRequest } from '../middlewares/auth.js';
import { providerIntegrationService } from '../services/providers/ProviderIntegrationService.js';

/**
 * Get all available providers
 */
export async function getAvailableProviders(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');
  
  const providers = providerIntegrationService.getAvailableProviders();
  
  res.json({ success: true, data: providers });
}

/**
 * Check status of a specific provider
 */
export async function checkProviderStatus(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');
  
  const { providerId } = req.params;
  
  if (!providerId) {
    throw new AppError(400, 'Missing provider ID');
  }
  
  const status = await providerIntegrationService.checkProviderStatus(providerId, req.user.id);
  
  res.json({ success: true, data: status });
}

/**
 * Initiate authentication for a provider
 */
export async function initiateAuth(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');
  
  const { providerId } = req.params;
  const { redirectUrl } = req.body;
  
  if (!providerId) {
    throw new AppError(400, 'Missing provider ID');
  }
  
  const result = await providerIntegrationService.initiateAuth(
    providerId,
    req.user.id,
    redirectUrl
  );
  
  if (result.error) {
    // If provider is not configured, return a user-friendly message
    return res.json({ success: true, data: { configured: false, error: result.error } });
  }
  
  res.json({ success: true, data: { authUrl: result.authUrl } });
}

/**
 * Handle OAuth callback from a provider
 */
export async function handleCallback(req: Request, res: Response) {
  const { providerId } = req.params;
  const { code, state } = req.query;
  
  if (!providerId) {
    throw new AppError(400, 'Missing provider ID');
  }
  
  if (!code || typeof code !== 'string') {
    throw new AppError(400, 'Missing authorization code');
  }
  
  if (!state || typeof state !== 'string') {
    throw new AppError(400, 'Missing state parameter');
  }
  
  const { userId, redirectUrl } = await providerIntegrationService.handleCallback(
    providerId,
    code,
    state
  );
  
  // Redirect to frontend with success
  if (redirectUrl) {
    return res.redirect(`${redirectUrl}?success=true`);
  }
  
  res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/instructor/quiz-room/create?providerAuth=success`);
}

/**
 * List files from a provider
 */
export async function listFiles(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');
  
  const { providerId } = req.params;
  const { filter, pageToken, pageSize } = req.query;
  
  if (!providerId) {
    throw new AppError(400, 'Missing provider ID');
  }
  
  const result = await providerIntegrationService.listFiles(
    providerId,
    req.user.id,
    filter as string || 'recent',
    pageToken as string,
    pageSize ? Number(pageSize) : undefined
  );
  
  res.json({ success: true, data: result });
}

/**
 * Search files in a provider
 */
export async function searchFiles(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');
  
  const { providerId } = req.params;
  const { query, pageToken, pageSize } = req.query;
  
  if (!providerId) {
    throw new AppError(400, 'Missing provider ID');
  }
  
  if (!query || typeof query !== 'string') {
    throw new AppError(400, 'Missing search query');
  }
  
  const result = await providerIntegrationService.searchFiles(
    providerId,
    req.user.id,
    query,
    pageToken as string,
    pageSize ? Number(pageSize) : undefined
  );
  
  res.json({ success: true, data: result });
}

/**
 * Download a file from a provider
 */
export async function downloadFile(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');
  
  const { providerId } = req.params;
  const { fileId } = req.params;
  
  if (!providerId) {
    throw new AppError(400, 'Missing provider ID');
  }
  
  if (!fileId) {
    throw new AppError(400, 'Missing file ID');
  }
  
  const result = await providerIntegrationService.downloadFile(
    providerId,
    req.user.id,
    fileId
  );
  
  res.json({ success: true, data: result });
}

/**
 * Get file metadata from a provider
 */
export async function getFileMetadata(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');
  
  const { providerId } = req.params;
  const { fileId } = req.params;
  
  if (!providerId) {
    throw new AppError(400, 'Missing provider ID');
  }
  
  if (!fileId) {
    throw new AppError(400, 'Missing file ID');
  }
  
  const result = await providerIntegrationService.getFileMetadata(
    providerId,
    req.user.id,
    fileId
  );
  
  res.json({ success: true, data: result });
}
