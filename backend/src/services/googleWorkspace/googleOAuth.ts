/**
 * Google OAuth Service
 * Handles OAuth popup authentication, token storage, and token refresh
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

// Ensure environment variables are loaded
dotenv.config();
if (!process.env.GOOGLE_CLIENT_ID && fs.existsSync(path.resolve(process.cwd(), '.env'))) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

export function getGoogleClientId(): string {
  return (process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
}

export function getGoogleClientSecret(): string {
  return (process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
}

export function getGoogleRedirectUri(): string {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    process.env.GOOGLE_OAUTH_CALLBACK_URL ||
    `${process.env.API_BASE_URL || process.env.API_URL || 'http://localhost:5000'}/api/auth/google/callback`
  ).trim();
}

// Scopes for Google Workspace
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/forms.body.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/presentations.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
];

export interface GoogleOAuthTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

export interface GoogleAuthState {
  userId: string;
  redirectUrl?: string;
}

/**
 * Create OAuth2 client
 */
export function createOAuth2Client(): OAuth2Client {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  const redirectUri = getGoogleRedirectUri();

  if (!clientId || !clientSecret) {
    console.error('[GoogleOAuth] ERROR: Google Client ID or Client Secret is not configured!');
  }

  return new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri,
  });
}

/**
 * Generate OAuth authorization URL
 */
export function generateAuthUrl(userId: string, redirectUrl?: string): string {
  console.log('[STAGE 3] generateAuthUrl called', { userId, redirectUrl });
  
  const oauth2Client = createOAuth2Client();
  console.log('[STAGE 3] OAuth2Client created', {
    hasClientId: !!getGoogleClientId(),
    hasClientSecret: !!getGoogleClientSecret(),
    redirectUri: getGoogleRedirectUri()
  });
  
  const state: GoogleAuthState = { userId, redirectUrl };
  const encodedState = Buffer.from(JSON.stringify(state)).toString('base64');
  console.log('[STAGE 3] State encoded:', encodedState.substring(0, 20) + '...');
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_SCOPES,
    state: encodedState,
    prompt: 'consent',
  });
  
  console.log('[STAGE 3] Auth URL generated:', authUrl);
  console.log('[STAGE 3] Scopes:', GOOGLE_SCOPES);
  
  return authUrl;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleOAuthTokens> {
  const oauth2Client = createOAuth2Client();
  
  const { tokens } = await oauth2Client.getToken(code);
  
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to obtain tokens from Google');
  }
  
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date || Date.now() + (tokens.expires_in || 3600) * 1000,
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleOAuthTokens> {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token });
  
  const { credentials } = await oauth2Client.refreshAccessToken();
  
  if (!credentials.access_token) {
    throw new Error('Failed to refresh access token');
  }
  
  return {
    access_token: credentials.access_token,
    refresh_token: credentials.refresh_token || refreshToken,
    expiry_date: credentials.expiry_date || Date.now() + (credentials.expires_in || 3600) * 1000,
  };
}

/**
 * Check if token is expired
 */
export function isTokenExpired(tokens: GoogleOAuthTokens): boolean {
  return Date.now() >= tokens.expiry_date - 60000; // Refresh 1 minute before expiry
}

/**
 * Get valid access token (refresh if needed)
 */
export async function getValidAccessToken(tokens: GoogleOAuthTokens): Promise<GoogleOAuthTokens> {
  if (isTokenExpired(tokens)) {
    return refreshAccessToken(tokens.refresh_token);
  }
  return tokens;
}

/**
 * Decode OAuth state
 */
export function decodeState(encodedState: string): GoogleAuthState {
  try {
    return JSON.parse(Buffer.from(encodedState, 'base64').toString());
  } catch (error) {
    throw new Error('Invalid OAuth state');
  }
}
