/**
 * ProviderIntegrationService
 * 
 * Orchestrates provider operations and provides a unified interface
 * for the rest of the system to interact with cloud providers.
 */

import { providerRegistry } from './ProviderRegistry.js';
import { ProviderAdapter, ProviderTokens, FileContent, ListFilesResult, FileMetadata } from './ProviderAdapter.js';
import { AppError } from '../../middlewares/errorHandler.js';

export class ProviderIntegrationService {
  /**
   * Check if a provider is configured and available
   */
  async checkProviderStatus(providerId: string, userId: string): Promise<{
    configured: boolean;
    authenticated: boolean;
  }> {
    const provider = providerRegistry.get(providerId);
    
    if (!provider) {
      return { configured: false, authenticated: false };
    }
    
    if (!provider.isConfigured()) {
      return { configured: false, authenticated: false };
    }
    
    try {
      // Try to get valid tokens to check authentication
      await provider.getValidTokens(userId);
      return { configured: true, authenticated: true };
    } catch (error) {
      // If we can't get tokens, user is not authenticated
      return { configured: true, authenticated: false };
    }
  }
  
  /**
   * Initiate authentication for a provider
   */
  async initiateAuth(providerId: string, userId: string, redirectUrl?: string): Promise<{
    authUrl?: string;
    error?: string;
  }> {
    const provider = providerRegistry.get(providerId);
    
    if (!provider) {
      throw new AppError(404, `Provider ${providerId} not found`);
    }
    
    if (!provider.isConfigured()) {
      return { error: 'Provider not configured' };
    }
    
    const result = await provider.initiateAuth(userId, redirectUrl);
    
    if ('error' in result) {
      return { error: result.error };
    }
    
    return { authUrl: result.authUrl };
  }
  
  /**
   * Handle OAuth callback from a provider
   */
  async handleCallback(providerId: string, code: string, state: string): Promise<{
    userId: string;
    redirectUrl?: string;
  }> {
    const provider = providerRegistry.get(providerId);
    
    if (!provider) {
      throw new AppError(404, `Provider ${providerId} not found`);
    }
    
    return await provider.handleCallback(code, state);
  }
  
  /**
   * List files from a provider
   */
  async listFiles(
    providerId: string,
    userId: string,
    filter: string,
    pageToken?: string,
    pageSize?: number
  ): Promise<ListFilesResult> {
    const provider = providerRegistry.get(providerId);
    
    if (!provider) {
      throw new AppError(404, `Provider ${providerId} not found`);
    }
    
    return await provider.listFiles(userId, filter, pageToken, pageSize);
  }
  
  /**
   * Search files in a provider
   */
  async searchFiles(
    providerId: string,
    userId: string,
    query: string,
    pageToken?: string,
    pageSize?: number
  ): Promise<ListFilesResult> {
    const provider = providerRegistry.get(providerId);
    
    if (!provider) {
      throw new AppError(404, `Provider ${providerId} not found`);
    }
    
    return await provider.searchFiles(userId, query, pageToken, pageSize);
  }
  
  /**
   * Download a file from a provider
   */
  async downloadFile(providerId: string, userId: string, fileId: string): Promise<FileContent> {
    const provider = providerRegistry.get(providerId);
    
    if (!provider) {
      throw new AppError(404, `Provider ${providerId} not found`);
    }
    
    return await provider.downloadFile(userId, fileId);
  }
  
  /**
   * Get file metadata from a provider
   */
  async getFileMetadata(providerId: string, userId: string, fileId: string): Promise<FileMetadata> {
    const provider = providerRegistry.get(providerId);
    
    if (!provider) {
      throw new AppError(404, `Provider ${providerId} not found`);
    }
    
    return await provider.getFileMetadata(userId, fileId);
  }
  
  /**
   * Get all available providers
   */
  getAvailableProviders(): Array<{ id: string; name: string; configured: boolean }> {
    return providerRegistry.getAll().map(provider => ({
      id: provider.providerId,
      name: provider.providerName,
      configured: provider.isConfigured(),
    }));
  }
}

// Export singleton instance
export const providerIntegrationService = new ProviderIntegrationService();
