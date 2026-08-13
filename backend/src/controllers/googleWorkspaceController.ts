/**
 * Google Workspace Controller
 * Handles API endpoints for Google Workspace integration
 */

import type { Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import type { AuthRequest } from '../middlewares/auth.js';
import {
  generateAuthUrl,
  exchangeCodeForTokens,
  decodeState,
  getValidAccessToken,
  getGoogleClientId,
  getGoogleClientSecret,
} from '../services/googleWorkspace/googleOAuth.js';
import {
  listDriveFiles,
  searchDriveFiles,
  getRecentFiles,
  getSharedFiles,
  getStarredFiles,
  getFolders,
  getFilesInFolder,
  getFileMetadata,
  GOOGLE_MIME_TYPES,
} from '../services/googleWorkspace/googleDriveAPI.js';
import {
  exportDocsToText,
  extractTextFromDocs,
} from '../services/googleWorkspace/googleDocsAPI.js';
import {
  exportFormsToText,
  parseGoogleFormToDrafts,
} from '../services/googleWorkspace/googleFormsAPI.js';

/**
 * Initiate Google OAuth authentication
 */
export async function initiateAuth(req: AuthRequest, res: Response) {
  console.log('[STAGE 2] initiateAuth called', { userId: req.user?.id, body: req.body });
  if (!req.user) throw new AppError(401, 'Unauthorized');

  const { redirectUrl } = req.body;
  console.log('[STAGE 2] Generating OAuth URL with redirectUrl:', redirectUrl);
  
  const authUrl = generateAuthUrl(req.user.id, redirectUrl);
  console.log('[STAGE 2] OAuth URL generated:', authUrl);
  console.log('[STAGE 2] Returning auth URL to frontend');

  res.json({ success: true, data: { authUrl } });
}

/**
 * Handle Google OAuth callback
 */
export async function handleCallback(req: Request, res: Response) {
  console.log('[STAGE 5] handleCallback called', { query: req.query });
  const { code, state } = req.query;

  if (!code || typeof code !== 'string') {
    console.error('[STAGE 5] Missing authorization code');
    throw new AppError(400, 'Missing authorization code');
  }

  if (!state || typeof state !== 'string') {
    console.error('[STAGE 5] Missing state parameter');
    throw new AppError(400, 'Missing state parameter');
  }

  console.log('[STAGE 5] Decoding state');
  const { userId, redirectUrl } = decodeState(state);
  console.log('[STAGE 5] State decoded', { userId, redirectUrl });

  console.log('[STAGE 5] Exchanging code for tokens');
  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(code);
  console.log('[STAGE 5] Tokens received', {
    hasAccessToken: !!tokens.access_token,
    hasRefreshToken: !!tokens.refresh_token,
    expiryDate: new Date(tokens.expiry_date)
  });

  // Fetch user email from Google
  let googleEmail: string | null = null;
  try {
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });
    if (userInfoResponse.ok) {
      const userInfo = await userInfoResponse.json() as { email?: string };
      googleEmail = userInfo.email || null;
      console.log('[STAGE 5] Google email fetched:', googleEmail);
    }
  } catch (error) {
    console.error('[STAGE 5] Failed to fetch Google email:', error);
  }

  console.log('[STAGE 5] Storing tokens in database');
  // Store tokens in database (encrypted in production)
  await prisma.user.update({
    where: { id: userId },
    data: {
      googleAccessToken: tokens.access_token,
      googleRefreshToken: tokens.refresh_token,
      googleTokenExpiry: new Date(tokens.expiry_date),
      googleEmail: googleEmail,
    },
  } as any);
  console.log('[STAGE 5] Tokens stored successfully');

  // Return HTML that closes popup and notifies parent window
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Authentication Successful</title>
    </head>
    <body>
      <script>
        // Notify parent window that authentication succeeded
        if (window.opener) {
          window.opener.postMessage({ type: 'google-auth-success' }, '*');
        }
        // Close the popup
        window.close();
      </script>
      <p>Authentication successful. You can close this window.</p>
    </body>
    </html>
  `;
  
  console.log('[STAGE 5] Returning close popup HTML');
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}

/**
 * List Google Drive files
 */
export async function listFiles(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      googleAccessToken: true,
      googleRefreshToken: true,
      googleTokenExpiry: true,
    },
  });

  if (!user?.googleAccessToken || !user.googleRefreshToken) {
    throw new AppError(401, 'Google not authenticated');
  }

  const tokens = {
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
    expiry_date: user.googleTokenExpiry?.getTime() || 0,
  };

  const validTokens = await getValidAccessToken(tokens);

  // Update tokens if refreshed
  if (validTokens.access_token !== tokens.access_token) {
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        googleAccessToken: validTokens.access_token,
        googleTokenExpiry: new Date(validTokens.expiry_date),
      },
    });
  }

  const { filter, pageToken, pageSize } = req.query;

  let result;
  switch (filter) {
    case 'recent':
      result = await getRecentFiles(validTokens, { pageToken: pageToken as string, pageSize: Number(pageSize) || 20 });
      break;
    case 'shared':
      result = await getSharedFiles(validTokens, { pageToken: pageToken as string, pageSize: Number(pageSize) || 20 });
      break;
    case 'starred':
      result = await getStarredFiles(validTokens, { pageToken: pageToken as string, pageSize: Number(pageSize) || 20 });
      break;
    case 'folders':
      result = await getFolders(validTokens, { pageToken: pageToken as string, pageSize: Number(pageSize) || 20 });
      break;
    default:
      result = await listDriveFiles(validTokens, { pageToken: pageToken as string, pageSize: Number(pageSize) || 20 });
  }

  res.json({ success: true, data: result });
}

/**
 * Search Google Drive files
 */
export async function searchFiles(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      googleAccessToken: true,
      googleRefreshToken: true,
      googleTokenExpiry: true,
    },
  });

  if (!user?.googleAccessToken || !user.googleRefreshToken) {
    throw new AppError(401, 'Google not authenticated');
  }

  const tokens = {
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
    expiry_date: user.googleTokenExpiry?.getTime() || 0,
  };

  const validTokens = await getValidAccessToken(tokens);

  const { query, pageToken, pageSize } = req.query;

  if (!query || typeof query !== 'string') {
    throw new AppError(400, 'Missing search query');
  }

  const result = await searchDriveFiles(validTokens, query, {
    pageToken: pageToken as string,
    pageSize: Number(pageSize) || 20,
  });

  res.json({ success: true, data: result });
}

/**
 * Get files in a folder
 */
export async function getFolderFiles(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');

  const { folderId } = req.params;

  if (!folderId) {
    throw new AppError(400, 'Missing folder ID');
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      googleAccessToken: true,
      googleRefreshToken: true,
      googleTokenExpiry: true,
    },
  });

  if (!user?.googleAccessToken || !user.googleRefreshToken) {
    throw new AppError(401, 'Google not authenticated');
  }

  const tokens = {
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
    expiry_date: user.googleTokenExpiry?.getTime() || 0,
  };

  const validTokens = await getValidAccessToken(tokens);

  const { pageToken, pageSize } = req.query;

  const result = await getFilesInFolder(validTokens, folderId, {
    pageToken: pageToken as string,
    pageSize: Number(pageSize) || 20,
  });

  res.json({ success: true, data: result });
}

/**
 * Get file content for analysis
 */
export async function getFileContent(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');

  const { fileId } = req.params;

  if (!fileId) {
    throw new AppError(400, 'Missing file ID');
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      googleAccessToken: true,
      googleRefreshToken: true,
      googleTokenExpiry: true,
    },
  });

  if (!user?.googleAccessToken || !user.googleRefreshToken) {
    throw new AppError(401, 'Google not authenticated');
  }

  const tokens = {
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
    expiry_date: user.googleTokenExpiry?.getTime() || 0,
  };

  const validTokens = await getValidAccessToken(tokens);

  // Get file metadata to determine type
  const metadata = await getFileMetadata(validTokens, fileId);

  let content: string;
  let fileType: string;

  switch (metadata.mimeType) {
    case GOOGLE_MIME_TYPES.DOCS:
      content = await exportDocsToText(validTokens, fileId);
      fileType = 'docs';
      break;
    case GOOGLE_MIME_TYPES.FORMS:
      content = await exportFormsToText(validTokens, fileId);
      fileType = 'forms';
      break;
    case GOOGLE_MIME_TYPES.SHEETS:
      // For now, export as text (can be enhanced later)
      content = `Google Sheets file: ${metadata.name}`;
      fileType = 'sheets';
      break;
    case GOOGLE_MIME_TYPES.SLIDES:
      // For now, export as text (can be enhanced later)
      content = `Google Slides file: ${metadata.name}`;
      fileType = 'slides';
      break;
    default:
      throw new AppError(400, 'Unsupported file type');
  }

  res.json({
    success: true,
    data: {
      content,
      fileType,
      metadata: {
        id: metadata.id,
        name: metadata.name,
        mimeType: metadata.mimeType,
        modifiedTime: metadata.modifiedTime,
      },
    },
  });
}

/**
 * Check authentication status
 *
 * Also exposes whether Google OAuth is configured (env vars present).
 * When not configured, returns { configured: false, authenticated: false }
 * so the frontend can gracefully hide the Google Workspace option.
 * This endpoint NEVER throws — it always returns a 200 response.
 */
export async function checkAuthStatus(req: AuthRequest, res: Response) {
  if (!req.user) throw new AppError(401, 'Unauthorized');

  // Check if OAuth credentials are configured
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  const isConfigured = Boolean(clientId && clientSecret);

  if (!isConfigured) {
    return res.json({
      success: true,
      data: {
        configured: false,
        authenticated: false,
      },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      googleAccessToken: true,
      googleRefreshToken: true,
      googleTokenExpiry: true,
      googleEmail: true,
    },
  } as any);

  const isAuthenticated = !!(user?.googleAccessToken && user.googleRefreshToken);

  res.json({
    success: true,
    data: {
      configured: true,
      authenticated: isAuthenticated,
      email: (user as any)?.googleEmail || null,
    },
  });
}
