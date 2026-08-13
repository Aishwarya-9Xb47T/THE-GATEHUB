/**
 * QR Code Service
 * Generate and manage QR codes for sessions, presentations, and slides
 */

import QRCode from 'qrcode';
import { AppError } from '../../middlewares/errorHandler.js';
import * as sessionTokenService from './sessionTokenService.js';

export interface QRCodeOptions {
  width?: number;
  margin?: number;
  color?: {
    dark?: string;
    light?: string;
  };
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

export interface SessionQRCodeData {
  type: 'session';
  sessionId: string;
  roomCode: string;
}

export interface SlideQRCodeData {
  type: 'slide';
  sessionId: string;
  slideId: string;
  slideOrder: number;
}

export interface InteractionQRCodeData {
  type: 'interaction';
  sessionId: string;
  interactionId: string;
}

export type QRCodeData = SessionQRCodeData | SlideQRCodeData | InteractionQRCodeData;

export async function generateSessionQRCode(
  sessionId: string,
  roomCode: string,
  options?: QRCodeOptions
): Promise<string> {
  return generateSessionQRCodeWithURL(sessionId, roomCode, undefined, options);
}

export async function generateSlideQRCode(
  sessionId: string,
  slideId: string,
  slideOrder: number,
  options?: QRCodeOptions
): Promise<string> {
  const data: SlideQRCodeData = {
    type: 'slide',
    sessionId,
    slideId,
    slideOrder,
  };

  return generateQRCode(JSON.stringify(data), options);
}

export async function generateInteractionQRCode(
  sessionId: string,
  interactionId: string,
  options?: QRCodeOptions
): Promise<string> {
  const data: InteractionQRCodeData = {
    type: 'interaction',
    sessionId,
    interactionId,
  };

  return generateQRCode(JSON.stringify(data), options);
}

export async function generateQRCode(
  data: string,
  options?: QRCodeOptions
): Promise<string> {
  const defaultOptions: QRCodeOptions = {
    width: 300,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
  };

  const mergedOptions = { ...defaultOptions, ...options };

  try {
    const qrCodeDataURL = await QRCode.toDataURL(data, mergedOptions);
    return qrCodeDataURL;
  } catch (error) {
    throw new AppError(500, 'Failed to generate QR code');
  }
}

export async function generateQRCodeSVG(
  data: string,
  options?: QRCodeOptions
): Promise<string> {
  const defaultOptions: QRCodeOptions = {
    width: 300,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
  };

  const mergedOptions = { ...defaultOptions, ...options };

  try {
    const qrCodeSVG = await QRCode.toString(data, { ...mergedOptions, type: 'svg' });
    return qrCodeSVG;
  } catch (error) {
    throw new AppError(500, 'Failed to generate QR code SVG');
  }
}

export function parseQRCodeData(data: string): QRCodeData {
  try {
    const parsed = JSON.parse(data) as QRCodeData;

    // Validate the structure
    if (!parsed.type) {
      throw new AppError(400, 'Invalid QR code data: missing type');
    }

    if (parsed.type === 'session') {
      if (!parsed.sessionId || !parsed.roomCode) {
        throw new AppError(400, 'Invalid session QR code data');
      }
    } else if (parsed.type === 'slide') {
      if (!parsed.sessionId || !parsed.slideId || parsed.slideOrder === undefined) {
        throw new AppError(400, 'Invalid slide QR code data');
      }
    } else if (parsed.type === 'interaction') {
      if (!parsed.sessionId || !parsed.interactionId) {
        throw new AppError(400, 'Invalid interaction QR code data');
      }
    } else {
      throw new AppError(400, `Unknown QR code type: ${(parsed as any)?.type}`);
    }

    return parsed;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(400, 'Invalid QR code data format');
  }
}

export async function generatePresentationJoinURL(
  roomCode: string,
  baseUrl?: string
): Promise<string> {
  const base = baseUrl || process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${base}/student/classroom/join/${roomCode}`;
}

export async function generateSessionQRCodeWithURL(
  sessionId: string,
  roomCode: string,
  baseUrl?: string,
  options?: QRCodeOptions,
  presentationId?: string
): Promise<string> {
  // Generate secure join URL with token instead of exposing raw room code
  const url = sessionTokenService.generateSecureJoinURL(sessionId, roomCode, baseUrl, presentationId);
  return generateQRCode(url, options);
}

export async function generateBulkSessionQRCodes(
  sessions: Array<{ sessionId: string; roomCode: string }>,
  options?: QRCodeOptions
): Promise<Array<{ sessionId: string; roomCode: string; qrCode: string }>> {
  const results = await Promise.all(
    sessions.map(async (session) => ({
      sessionId: session.sessionId,
      roomCode: session.roomCode,
      qrCode: await generateSessionQRCode(session.sessionId, session.roomCode, options),
    }))
  );

  return results;
}

export async function generateCustomQRCode(
  text: string,
  options?: QRCodeOptions
): Promise<string> {
  return generateQRCode(text, options);
}

export async function generateQRCodeWithLogo(
  data: string,
  logoUrl: string,
  options?: QRCodeOptions
): Promise<string> {
  // This would require image manipulation to overlay a logo
  // For now, we'll generate a standard QR code
  // TODO: Implement logo overlay using sharp or similar library
  return generateQRCode(data, options);
}
