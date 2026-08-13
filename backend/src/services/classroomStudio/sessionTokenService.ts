/**
 * Session Token Service
 * Generate and validate secure tokens for session joins
 */

import jwt from 'jsonwebtoken';
import { AppError } from '../../middlewares/errorHandler.js';
import { JWT_SECRET } from '../../config/jwt.js';

const TOKEN_EXPIRY = '15m'; // Tokens expire in 15 minutes

export interface SessionJoinTokenPayload {
  sessionId: string;
  roomCode: string;
  presentationId?: string;
  type: 'session' | 'slide' | 'interaction';
  iat?: number;
  exp?: number;
}

/**
 * Generate a secure token for session join
 */
export function generateSessionJoinToken(payload: Omit<SessionJoinTokenPayload, 'iat' | 'exp'>): string {
  try {
    const token = jwt.sign(payload, JWT_SECRET, { 
      expiresIn: TOKEN_EXPIRY,
      issuer: 'gatehub-classroom',
      audience: 'gatehub-students'
    });
    return token;
  } catch (error) {
    throw new AppError(500, 'Failed to generate session token');
  }
}

/**
 * Validate a session join token
 */
export function validateSessionJoinToken(token: string): SessionJoinTokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'gatehub-classroom',
      audience: 'gatehub-students'
    }) as SessionJoinTokenPayload;
    
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(400, 'Session token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError(400, 'Invalid session token');
    }
    throw new AppError(500, 'Token validation failed');
  }
}

/**
 * Generate a secure join URL with token
 */
export function generateSecureJoinURL(
  sessionId: string,
  roomCode: string,
  baseUrl?: string,
  presentationId?: string
): string {
  const payload: Omit<SessionJoinTokenPayload, 'iat' | 'exp'> = {
    sessionId,
    roomCode,
    presentationId,
    type: 'session'
  };
  
  const token = generateSessionJoinToken(payload);
  const base = baseUrl || process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${base}/student/classroom/join-token/${token}`;
}

/**
 * Extract and validate token from URL
 */
export function extractTokenFromURL(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const tokenIndex = pathParts.indexOf('join-token');
    
    if (tokenIndex !== -1 && tokenIndex + 1 < pathParts.length) {
      return pathParts[tokenIndex + 1];
    }
    
    return null;
  } catch {
    return null;
  }
}
