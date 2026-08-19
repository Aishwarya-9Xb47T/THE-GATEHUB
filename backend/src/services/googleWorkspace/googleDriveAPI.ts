/**
 * Google Drive API Service
 * Handles Drive API calls for listing, searching, and fetching file metadata
 */

import { google } from 'googleapis';
import type { GoogleOAuthTokens } from './googleOAuth.js';

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  thumbnailLink?: string;
  modifiedTime: string;
  owners: Array<{ displayName: string; emailAddress?: string }>;
  size?: string;
  shared?: boolean;
  starred?: boolean;
  parents?: string[];
}

export interface GoogleDriveListOptions {
  pageSize?: number;
  pageToken?: string;
  query?: string;
  orderBy?: string;
}

export interface GoogleDriveListResult {
  files: GoogleDriveFile[];
  nextPageToken?: string;
}

/**
 * Create Drive API client with OAuth tokens
 */
export function createDriveClient(tokens: GoogleOAuthTokens) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });
  
  return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * List files from Google Drive
 */
export async function listDriveFiles(
  tokens: GoogleOAuthTokens,
  options: GoogleDriveListOptions = {}
): Promise<GoogleDriveListResult> {
  const drive = createDriveClient(tokens);
  
  let q = "trashed = false";
  if (options.query) {
    q += ` and (${options.query})`;
  } else {
    q += ` and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.google-apps.form')`;
  }
  
  const response = await drive.files.list({
    pageSize: options.pageSize || 50,
    pageToken: options.pageToken,
    q,
    orderBy: options.orderBy || 'modifiedTime desc',
    fields: 'nextPageToken,files(id,name,mimeType,webViewLink,thumbnailLink,modifiedTime,createdTime,owners,size,shared,starred,parents)',
  });
  
  return {
    files: (response.data.files || []) as GoogleDriveFile[],
    nextPageToken: response.data.nextPageToken || undefined,
  };
}

/**
 * Search files in Google Drive
 */
export async function searchDriveFiles(
  tokens: GoogleOAuthTokens,
  query: string,
  options: Omit<GoogleDriveListOptions, 'query'> = {}
): Promise<GoogleDriveListResult> {
  const drive = createDriveClient(tokens);
  
  const searchQuery = `name contains '${query}' or fullText contains '${query}'`;
  
  const response = await drive.files.list({
    pageSize: options.pageSize || 20,
    pageToken: options.pageToken,
    q: searchQuery,
    orderBy: options.orderBy || 'modifiedTime desc',
    fields: 'nextPageToken,files(id,name,mimeType,webViewLink,thumbnailLink,modifiedTime,owners,size,shared,starred,parents)',
  });
  
  return {
    files: (response.data.files || []) as GoogleDriveFile[],
    nextPageToken: response.data.nextPageToken || undefined,
  };
}

/**
 * Get recent files
 */
export async function getRecentFiles(
  tokens: GoogleOAuthTokens,
  options: Omit<GoogleDriveListOptions, 'query' | 'orderBy'> = {}
): Promise<GoogleDriveListResult> {
  return listDriveFiles(tokens, {
    ...options,
    orderBy: 'modifiedTime desc',
  });
}

/**
 * Get shared files
 */
export async function getSharedFiles(
  tokens: GoogleOAuthTokens,
  options: Omit<GoogleDriveListOptions, 'query'> = {}
): Promise<GoogleDriveListResult> {
  const drive = createDriveClient(tokens);
  
  const response = await drive.files.list({
    pageSize: options.pageSize || 50,
    pageToken: options.pageToken,
    q: "sharedWithMe = true and trashed = false and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.google-apps.form')",
    orderBy: options.orderBy || 'modifiedTime desc',
    fields: 'nextPageToken,files(id,name,mimeType,webViewLink,thumbnailLink,modifiedTime,createdTime,owners,size,shared,starred,parents)',
  });
  
  return {
    files: (response.data.files || []) as GoogleDriveFile[],
    nextPageToken: response.data.nextPageToken || undefined,
  };
}

/**
 * Get starred files
 */
export async function getStarredFiles(
  tokens: GoogleOAuthTokens,
  options: Omit<GoogleDriveListOptions, 'query'> = {}
): Promise<GoogleDriveListResult> {
  const drive = createDriveClient(tokens);
  
  const response = await drive.files.list({
    pageSize: options.pageSize || 50,
    pageToken: options.pageToken,
    q: "starred = true and trashed = false and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.google-apps.form')",
    orderBy: options.orderBy || 'modifiedTime desc',
    fields: 'nextPageToken,files(id,name,mimeType,webViewLink,thumbnailLink,modifiedTime,createdTime,owners,size,shared,starred,parents)',
  });
  
  return {
    files: (response.data.files || []) as GoogleDriveFile[],
    nextPageToken: response.data.nextPageToken || undefined,
  };
}

/**
 * Get folders
 */
export async function getFolders(
  tokens: GoogleOAuthTokens,
  options: Omit<GoogleDriveListOptions, 'query'> = {}
): Promise<GoogleDriveListResult> {
  const drive = createDriveClient(tokens);
  
  const response = await drive.files.list({
    pageSize: options.pageSize || 20,
    pageToken: options.pageToken,
    q: "mimeType = 'application/vnd.google-apps.folder'",
    orderBy: options.orderBy || 'name asc',
    fields: 'nextPageToken,files(id,name,mimeType,webViewLink,thumbnailLink,modifiedTime,owners,size,shared,starred,parents)',
  });
  
  return {
    files: (response.data.files || []) as GoogleDriveFile[],
    nextPageToken: response.data.nextPageToken || undefined,
  };
}

/**
 * Get files in a specific folder
 */
export async function getFilesInFolder(
  tokens: GoogleOAuthTokens,
  folderId: string,
  options: Omit<GoogleDriveListOptions, 'query'> = {}
): Promise<GoogleDriveListResult> {
  const drive = createDriveClient(tokens);
  
  const response = await drive.files.list({
    pageSize: options.pageSize || 20,
    pageToken: options.pageToken,
    q: `'${folderId}' in parents`,
    orderBy: options.orderBy || 'name asc',
    fields: 'nextPageToken,files(id,name,mimeType,webViewLink,thumbnailLink,modifiedTime,owners,size,shared,starred,parents)',
  });
  
  return {
    files: (response.data.files || []) as GoogleDriveFile[],
    nextPageToken: response.data.nextPageToken || undefined,
  };
}

/**
 * Get file metadata
 */
export async function getFileMetadata(
  tokens: GoogleOAuthTokens,
  fileId: string
): Promise<GoogleDriveFile> {
  const drive = createDriveClient(tokens);
  
  const response = await drive.files.get({
    fileId,
    fields: 'id,name,mimeType,webViewLink,thumbnailLink,modifiedTime,owners,size,shared,starred,parents',
  });
  
  return response.data as GoogleDriveFile;
}

/**
 * Filter files by MIME type
 */
export function filterFilesByMimeType(
  files: GoogleDriveFile[],
  mimeType: string
): GoogleDriveFile[] {
  return files.filter(file => file.mimeType === mimeType);
}

/**
 * Export Google Doc directly as binary DOCX Buffer
 */
export async function exportDocsToBuffer(
  tokens: GoogleOAuthTokens,
  fileId: string
): Promise<Buffer> {
  const drive = createDriveClient(tokens);
  const response = await drive.files.export(
    {
      fileId,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(response.data as ArrayBuffer);
}

/**
 * Export Google Slides directly as binary PPTX Buffer
 */
export async function exportSlidesToPptxBuffer(
  tokens: GoogleOAuthTokens,
  fileId: string,
): Promise<Buffer> {
  const drive = createDriveClient(tokens);
  const response = await drive.files.export(
    {
      fileId,
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    },
    { responseType: 'arraybuffer' },
  );
  return Buffer.from(response.data as ArrayBuffer);
}

/**
 * Export Google Slides directly as high-fidelity vector PDF Buffer
 */
export async function exportSlidesToPdfBuffer(
  tokens: GoogleOAuthTokens,
  fileId: string,
): Promise<Buffer> {
  const drive = createDriveClient(tokens);
  const response = await drive.files.export(
    {
      fileId,
      mimeType: 'application/pdf',
    },
    { responseType: 'arraybuffer' },
  );
  return Buffer.from(response.data as ArrayBuffer);
}

/**
 * Google Workspace MIME types
 */
export const GOOGLE_MIME_TYPES = {
  DOCS: 'application/vnd.google-apps.document',
  FORMS: 'application/vnd.google-apps.form',
  SHEETS: 'application/vnd.google-apps.spreadsheet',
  SLIDES: 'application/vnd.google-apps.presentation',
  FOLDER: 'application/vnd.google-apps.folder',
} as const;

