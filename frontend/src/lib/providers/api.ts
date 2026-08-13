/**
 * Provider API (Frontend)
 * 
 * API functions for interacting with cloud providers.
 */

import axios from 'axios';
import type { ProviderFile, ListFilesResult, ProviderStatus } from './types.js';
import { apiUrl } from '@/lib/api';

const API_BASE = apiUrl('/api/providers');

/**
 * Get all available providers
 */
export async function getAvailableProviders(): Promise<Array<{ id: string; name: string; configured: boolean }>> {
  const res = await axios.get(`${API_BASE}`);
  return res.data.data;
}

/**
 * Check status of a specific provider
 */
export async function checkProviderStatus(providerId: string): Promise<ProviderStatus> {
  const res = await axios.get(`${API_BASE}/${providerId}/status`);
  return res.data.data;
}

/**
 * Initiate authentication for a provider
 */
export async function initiateAuth(providerId: string, redirectUrl?: string): Promise<{
  authUrl?: string;
  configured?: boolean;
  error?: string;
}> {
  const res = await axios.post(`${API_BASE}/${providerId}/auth/initiate`, { redirectUrl });
  return res.data.data;
}

/**
 * List files from a provider
 */
export async function listFiles(
  providerId: string,
  filter: string = 'recent',
  pageToken?: string,
  pageSize?: number
): Promise<ListFilesResult> {
  const params = new URLSearchParams();
  params.append('filter', filter);
  if (pageToken) params.append('pageToken', pageToken);
  if (pageSize) params.append('pageSize', pageSize.toString());
  
  const res = await axios.get(`${API_BASE}/${providerId}/files?${params.toString()}`);
  return res.data.data;
}

/**
 * Search files in a provider
 */
export async function searchFiles(
  providerId: string,
  query: string,
  pageToken?: string,
  pageSize?: number
): Promise<ListFilesResult> {
  const params = new URLSearchParams();
  params.append('query', query);
  if (pageToken) params.append('pageToken', pageToken);
  if (pageSize) params.append('pageSize', pageSize.toString());
  
  const res = await axios.get(`${API_BASE}/${providerId}/files/search?${params.toString()}`);
  return res.data.data;
}

/**
 * Download a file from a provider
 */
export async function downloadFile(providerId: string, fileId: string): Promise<{
  content: string;
  fileType: string;
  metadata: ProviderFile;
}> {
  const res = await axios.get(`${API_BASE}/${providerId}/files/${fileId}`);
  return res.data.data;
}

/**
 * Get file metadata from a provider
 */
export async function getFileMetadata(providerId: string, fileId: string): Promise<ProviderFile> {
  const res = await axios.get(`${API_BASE}/${providerId}/files/${fileId}/metadata`);
  return res.data.data;
}
