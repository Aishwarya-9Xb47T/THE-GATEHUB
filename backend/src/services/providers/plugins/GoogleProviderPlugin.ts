/**
 * GoogleProviderPlugin
 * 
 * Implements the ProviderAdapter interface for Google Workspace.
 * This plugin handles Google OAuth, Drive API, and file operations.
 */

import { google } from 'googleapis';
import { prisma } from '../../../utils/prisma.js';
import { AppError } from '../../../middlewares/errorHandler.js';
import {
  ProviderAdapter,
  ProviderTokens,
  FileMetadata,
  FileContent,
  ProviderFile,
  ListFilesResult,
} from '../ProviderAdapter.js';

// OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = `${process.env.API_BASE_URL || 'http://localhost:5000'}/api/providers/google/callback`;

// Scopes for Google Workspace
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/forms.body.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/presentations.readonly',
];

// Google MIME types
const GOOGLE_MIME_TYPES = {
  DOCS: 'application/vnd.google-apps.document',
  FORMS: 'application/vnd.google-apps.form',
  SHEETS: 'application/vnd.google-apps.spreadsheet',
  SLIDES: 'application/vnd.google-apps.presentation',
} as const;

interface GoogleAuthState {
  userId: string;
  redirectUrl?: string;
}

export class GoogleProviderPlugin implements ProviderAdapter {
  readonly providerId = 'google';
  readonly providerName = 'Google Workspace';
  
  /**
   * Check if Google OAuth is configured
   */
  isConfigured(): boolean {
    return !!(
      GOOGLE_CLIENT_ID &&
      GOOGLE_CLIENT_SECRET &&
      GOOGLE_CLIENT_ID.trim() !== '' &&
      GOOGLE_CLIENT_SECRET.trim() !== ''
    );
  }
  
  /**
   * Create OAuth2 client
   */
  private createOAuth2Client() {
    return new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );
  }
  
  /**
   * Generate OAuth authorization URL
   */
  private generateAuthUrl(userId: string, redirectUrl?: string): string {
    const oauth2Client = this.createOAuth2Client();
    
    const state: GoogleAuthState = { userId, redirectUrl };
    const encodedState = Buffer.from(JSON.stringify(state)).toString('base64');
    
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: GOOGLE_SCOPES,
      state: encodedState,
      prompt: 'consent',
    });
  }
  
  /**
   * Decode OAuth state
   */
  private decodeState(encodedState: string): GoogleAuthState {
    try {
      return JSON.parse(Buffer.from(encodedState, 'base64').toString());
    } catch (error) {
      throw new AppError(400, 'Invalid OAuth state');
    }
  }
  
  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(code: string): Promise<ProviderTokens> {
    const oauth2Client = this.createOAuth2Client();
    
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new AppError(400, 'Failed to obtain tokens from Google');
    }
    
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date || Date.now() + ((tokens as any).expires_in || 3600) * 1000,
    };
  }
  
  /**
   * Check if token is expired
   */
  private isTokenExpired(tokens: ProviderTokens): boolean {
    return Date.now() >= tokens.expiry_date - 60000; // Refresh 1 minute before expiry
  }
  
  /**
   * Initiate authentication
   */
  async initiateAuth(userId: string, redirectUrl?: string): Promise<{ authUrl: string } | { error: string }> {
    if (!this.isConfigured()) {
      return { error: 'Google OAuth not configured' };
    }
    
    const authUrl = this.generateAuthUrl(userId, redirectUrl);
    return { authUrl };
  }
  
  /**
   * Handle OAuth callback
   */
  async handleCallback(code: string, state: string): Promise<{ userId: string; redirectUrl?: string }> {
    const { userId, redirectUrl } = this.decodeState(state);
    
    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(code);
    
    // Store tokens in database
    await prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token,
        googleTokenExpiry: new Date(tokens.expiry_date),
      },
    });
    
    return { userId, redirectUrl };
  }
  
  /**
   * Get valid access token (refresh if needed)
   */
  async getValidTokens(userId: string): Promise<ProviderTokens> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        googleAccessToken: true,
        googleRefreshToken: true,
        googleTokenExpiry: true,
      },
    });
    
    if (!user?.googleAccessToken || !user.googleRefreshToken) {
      throw new AppError(401, 'Google not authenticated');
    }
    
    const tokens: ProviderTokens = {
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken,
      expiry_date: user.googleTokenExpiry?.getTime() || 0,
    };
    
    // Refresh if expired
    if (this.isTokenExpired(tokens)) {
      const newTokens = await this.refreshTokens(tokens.refresh_token);
      
      // Update database
      await prisma.user.update({
        where: { id: userId },
        data: {
          googleAccessToken: newTokens.access_token,
          googleTokenExpiry: new Date(newTokens.expiry_date),
        },
      });
      
      return newTokens;
    }
    
    return tokens;
  }
  
  /**
   * Refresh access token
   */
  async refreshTokens(refreshToken: string): Promise<ProviderTokens> {
    const oauth2Client = this.createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    if (!credentials.access_token) {
      throw new AppError(400, 'Failed to refresh access token');
    }
    
    return {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token || refreshToken,
      expiry_date: credentials.expiry_date || Date.now() + ((credentials as any).expires_in || 3600) * 1000,
    };
  }
  
  /**
   * Create Drive API client
   */
  private createDriveClient(tokens: ProviderTokens) {
    const oauth2Client = this.createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    });
    
    return google.drive({ version: 'v3', auth: oauth2Client });
  }
  
  /**
   * Create Docs API client
   */
  private createDocsClient(tokens: ProviderTokens) {
    const oauth2Client = this.createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    });
    
    return google.docs({ version: 'v1', auth: oauth2Client });
  }
  
  /**
   * List files from Google Drive
   */
  async listFiles(
    userId: string,
    filter: string,
    pageToken?: string,
    pageSize: number = 20
  ): Promise<ListFilesResult> {
    const tokens = await this.getValidTokens(userId);
    const drive = this.createDriveClient(tokens);
    
    let query = '';
    
    switch (filter) {
      case 'recent':
        query = 'trashed = false';
        break;
      case 'shared':
        query = 'trashed = false and sharedWithMe = true';
        break;
      case 'starred':
        query = 'trashed = false and starred = true';
        break;
      case 'folders':
        query = 'trashed = false and mimeType = "application/vnd.google-apps.folder"';
        break;
      case 'docs':
        query = 'trashed = false and mimeType = "application/vnd.google-apps.document"';
        break;
      case 'forms':
        query = 'trashed = false and mimeType = "application/vnd.google-apps.form"';
        break;
      case 'slides':
        query = 'trashed = false and mimeType = "application/vnd.google-apps.presentation"';
        break;
      default:
        query = 'trashed = false';
    }
    
    const response = await drive.files.list({
      q: query,
      pageSize,
      pageToken,
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,owners,starred,shared)',
      orderBy: filter === 'recent' ? 'modifiedTime desc' : 'name',
    });
    
    const files: ProviderFile[] = (response.data.files || []).map((file: any) => ({
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType!,
      modifiedTime: file.modifiedTime || file.modifiedDate!,
      owners: file.owners?.map((owner: any) => ({ displayName: owner.displayName || '' })),
      starred: file.starred,
      shared: file.shared,
    }));
    
    return {
      files,
      nextPageToken: response.data.nextPageToken || undefined,
    };
  }
  
  /**
   * Search files in Google Drive
   */
  async searchFiles(
    userId: string,
    query: string,
    pageToken?: string,
    pageSize: number = 20
  ): Promise<ListFilesResult> {
    const tokens = await this.getValidTokens(userId);
    const drive = this.createDriveClient(tokens);
    
    const response = await drive.files.list({
      q: `trashed = false and name contains '${query.replace(/'/g, "\\'")}'`,
      pageSize,
      pageToken,
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,owners)',
    });
    
    const files: ProviderFile[] = (response.data.files || []).map((file: any) => ({
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType!,
      modifiedTime: file.modifiedTime || file.modifiedDate!,
      owners: file.owners?.map((owner: any) => ({ displayName: owner.displayName || '' })),
    }));
    
    return {
      files,
      nextPageToken: response.data.nextPageToken || undefined,
    };
  }
  
  /**
   * Get file metadata
   */
  async getFileMetadata(userId: string, fileId: string): Promise<FileMetadata> {
    const tokens = await this.getValidTokens(userId);
    const drive = this.createDriveClient(tokens);
    
    const response = await drive.files.get({
      fileId,
      fields: 'id,name,mimeType,modifiedTime,modifiedDate,owners',
    });
    
    const data = response.data as any;
    return {
      id: data.id!,
      name: data.name!,
      mimeType: data.mimeType!,
      modifiedTime: data.modifiedTime || data.modifiedDate!,
      owners: data.owners?.map((owner: any) => ({ displayName: owner.displayName || '' })),
    };
  }
  
  /**
   * Download file content
   */
  async downloadFile(userId: string, fileId: string): Promise<FileContent> {
    const tokens = await this.getValidTokens(userId);
    const metadata = await this.getFileMetadata(userId, fileId);
    
    let content: string;
    
    switch (metadata.mimeType) {
      case GOOGLE_MIME_TYPES.DOCS:
        content = await this.exportDocsToText(tokens, fileId);
        break;
      case GOOGLE_MIME_TYPES.FORMS:
        content = await this.exportFormsToText(tokens, fileId);
        break;
      case GOOGLE_MIME_TYPES.SHEETS:
        content = `[Google Sheets file: ${metadata.name}]`;
        break;
      case GOOGLE_MIME_TYPES.SLIDES:
        content = `[Google Slides file: ${metadata.name}]`;
        break;
      default:
        throw new AppError(400, 'Unsupported file type');
    }
    
    return {
      content,
      mimeType: metadata.mimeType,
      metadata,
    };
  }
  
  /**
   * Export Google Docs to text
   */
  private async exportDocsToText(tokens: ProviderTokens, fileId: string): Promise<string> {
    const drive = this.createDriveClient(tokens);
    
    const response = await drive.files.export({
      fileId,
      mimeType: 'text/plain',
    });
    
    return response.data as string;
  }
  
  /**
   * Export Google Forms to text
   */
  private async exportFormsToText(tokens: ProviderTokens, fileId: string): Promise<string> {
    const oauth2Client = this.createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    });
    
    const forms = google.forms({ version: 'v1', auth: oauth2Client });
    
    const form = await forms.forms.get({ formId: fileId });
    
    // Extract form structure as text
    let text = `Form: ${form.data.info?.title || 'Untitled'}\n\n`;
    
    if (form.data.items) {
      for (const item of form.data.items) {
        const itemData = item as any;
        if (itemData.questionItem) {
          const question = itemData.questionItem.question;
          text += `Q: ${question?.questionItem?.question?.text || 'Unknown'}\n`;
          if (question?.questionItem?.options) {
            for (const option of question.questionItem.options) {
              text += `- ${option.value || 'Unknown'}\n`;
            }
          }
          text += '\n';
        }
      }
    }
    
    return text;
  }
}
