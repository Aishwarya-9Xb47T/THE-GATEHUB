/**
 * Canonical Interactive Classroom join URL helpers.
 * QR + Paste Link + Manual code all converge here.
 */

const JOIN_PATH_RE = /\/student\/classroom\/join\/([^/?#]+)/i;
const JOIN_TOKEN_PATH_RE = /\/student\/classroom\/join-token\/([^/?#]+)/i;
const ROOM_CODE_RE = /^\d{4,8}$/;
const CUID_RE = /^c[a-z0-9]{20,}$/i;

export type ClassroomJoinParseResult =
  | { ok: true; kind: 'roomCode'; roomCode: string }
  | { ok: true; kind: 'token'; token: string }
  | { ok: true; kind: 'sessionId'; sessionId: string }
  | { ok: false; reason: string };

function stripNoise(raw: string): string {
  return String(raw || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
}

export function normalizeRoomCode(input: string): string {
  return stripNoise(input).replace(/\s+/g, '').replace(/[^0-9]/g, '');
}

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_RE.test(normalizeRoomCode(code));
}

export function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
}

export function isPrivateLanHostname(hostname: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
}

/** Origin used in QR / Copy Link / Share — never prefer bare localhost for cross-device. */
export function getShareableAppOrigin(): string {
  const fromEnv = String(import.meta.env.VITE_PUBLIC_APP_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      /* fall through */
    }
  }

  if (typeof window === 'undefined') return 'http://localhost:5173';

  const { protocol, hostname, port, origin } = window.location;
  if (!isLocalHostname(hostname)) return origin;

  // Already on a LAN IP in the address bar — good for phone scanning.
  if (isPrivateLanHostname(hostname)) return origin;

  // localhost without VITE_PUBLIC_APP_URL: return origin for same-device only.
  // Callers should warn when isCrossDeviceShareUnsafe().
  void protocol;
  void port;
  return origin;
}

export function isCrossDeviceShareUnsafe(): boolean {
  try {
    const origin = getShareableAppOrigin();
    const host = new URL(origin).hostname;
    if (!isLocalHostname(host)) return false;
    const env = String(import.meta.env.VITE_PUBLIC_APP_URL || '').trim();
    return !env;
  } catch {
    return true;
  }
}

export function buildClassroomJoinPath(roomCode: string): string {
  const code = normalizeRoomCode(roomCode);
  return `/student/classroom/join/${code}`;
}

export function buildClassroomJoinUrl(roomCode: string, origin = getShareableAppOrigin()): string {
  const base = origin.replace(/\/$/, '');
  return `${base}${buildClassroomJoinPath(roomCode)}`;
}

function allowedHosts(): Set<string> {
  const hosts = new Set<string>();
  if (typeof window !== 'undefined') {
    hosts.add(window.location.hostname.toLowerCase());
  }
  hosts.add('localhost');
  hosts.add('127.0.0.1');
  const env = String(import.meta.env.VITE_PUBLIC_APP_URL || '').trim();
  if (env) {
    try {
      hosts.add(new URL(env).hostname.toLowerCase());
    } catch {
      /* ignore */
    }
  }
  return hosts;
}

function isAllowedJoinHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (allowedHosts().has(h)) return true;
  if (isPrivateLanHostname(h)) return true;
  return false;
}

/**
 * Parse pasted text or QR payload into a classroom join target.
 * Accepts full URLs, relative paths, or bare room codes.
 */
export function parseClassroomJoinInput(raw: string): ClassroomJoinParseResult {
  const text = stripNoise(raw);
  if (!text) return { ok: false, reason: 'Empty input' };

  const lower = text.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return { ok: false, reason: 'Invalid classroom QR code.' };
  }

  // Bare room code
  const asCode = normalizeRoomCode(text);
  if (ROOM_CODE_RE.test(asCode) && !/[a-z]/i.test(text.replace(/\s/g, ''))) {
    return { ok: true, kind: 'roomCode', roomCode: asCode };
  }

  // Relative join path
  if (text.startsWith('/') && JOIN_PATH_RE.test(text)) {
    const m = text.match(JOIN_PATH_RE);
    const code = normalizeRoomCode(m?.[1] || '');
    if (!isValidRoomCode(code)) return { ok: false, reason: 'Invalid session code in link.' };
    return { ok: true, kind: 'roomCode', roomCode: code };
  }
  if (text.startsWith('/') && JOIN_TOKEN_PATH_RE.test(text)) {
    const m = text.match(JOIN_TOKEN_PATH_RE);
    const token = decodeURIComponent(m?.[1] || '').trim();
    if (!token) return { ok: false, reason: 'Invalid classroom link.' };
    return { ok: true, kind: 'token', token };
  }

  // Absolute URL
  let url: URL | null = null;
  try {
    url = new URL(text);
  } catch {
    // Maybe missing scheme but looks like host/path
    try {
      url = new URL(`http://${text}`);
    } catch {
      url = null;
    }
  }

  if (url) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, reason: 'Invalid classroom QR code.' };
    }
    if (!isAllowedJoinHost(url.hostname)) {
      return { ok: false, reason: 'Invalid classroom QR code.' };
    }

    const tokenMatch = url.pathname.match(JOIN_TOKEN_PATH_RE);
    if (tokenMatch?.[1]) {
      return { ok: true, kind: 'token', token: decodeURIComponent(tokenMatch[1]) };
    }

    const joinMatch = url.pathname.match(JOIN_PATH_RE);
    if (joinMatch?.[1]) {
      const segment = decodeURIComponent(joinMatch[1]).trim();
      const code = normalizeRoomCode(segment);
      if (isValidRoomCode(code)) {
        return { ok: true, kind: 'roomCode', roomCode: code };
      }
      if (CUID_RE.test(segment)) {
        return { ok: true, kind: 'sessionId', sessionId: segment };
      }
      return { ok: false, reason: 'Invalid session code in link.' };
    }

    // Query fallbacks: ?code= / ?roomCode=
    const q = url.searchParams.get('code') || url.searchParams.get('roomCode');
    if (q && isValidRoomCode(q)) {
      return { ok: true, kind: 'roomCode', roomCode: normalizeRoomCode(q) };
    }

    return { ok: false, reason: 'Invalid classroom QR code.' };
  }

  // Session cuid pasted directly
  if (CUID_RE.test(text)) {
    return { ok: true, kind: 'sessionId', sessionId: text };
  }

  return { ok: false, reason: 'Invalid classroom QR code.' };
}

export function classroomJoinTargetPath(result: Extract<ClassroomJoinParseResult, { ok: true }>): string {
  if (result.kind === 'roomCode') return buildClassroomJoinPath(result.roomCode);
  if (result.kind === 'token') return `/student/classroom/join-token/${encodeURIComponent(result.token)}`;
  return `/student/classroom/join/${result.sessionId}`;
}
