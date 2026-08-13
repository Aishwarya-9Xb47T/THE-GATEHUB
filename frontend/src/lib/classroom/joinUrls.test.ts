import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildClassroomJoinPath,
  buildClassroomJoinUrl,
  classroomJoinTargetPath,
  isValidRoomCode,
  normalizeRoomCode,
  parseClassroomJoinInput,
} from './joinUrls';

describe('classroom joinUrls', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.stubEnv('VITE_PUBLIC_APP_URL', '');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        protocol: 'http:',
        hostname: '192.168.1.25',
        port: '5173',
        origin: 'http://192.168.1.25:5173',
        host: '192.168.1.25:5173',
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    vi.unstubAllEnvs();
  });

  it('normalizes room codes and whitespace', () => {
    expect(normalizeRoomCode(' 833 366 ')).toBe('833366');
    expect(isValidRoomCode('833366')).toBe(true);
    expect(isValidRoomCode('ABC')).toBe(false);
  });

  it('builds canonical join path/url', () => {
    expect(buildClassroomJoinPath('833366')).toBe('/student/classroom/join/833366');
    expect(buildClassroomJoinUrl('833366')).toBe('http://192.168.1.25:5173/student/classroom/join/833366');
  });

  it('parses valid QR URL', () => {
    const parsed = parseClassroomJoinInput(
      'http://192.168.1.25:5173/student/classroom/join/833366/',
    );
    expect(parsed).toEqual({ ok: true, kind: 'roomCode', roomCode: '833366' });
  });

  it('parses bare session code', () => {
    expect(parseClassroomJoinInput('833366')).toEqual({
      ok: true,
      kind: 'roomCode',
      roomCode: '833366',
    });
  });

  it('rejects javascript and data URLs', () => {
    expect(parseClassroomJoinInput('javascript:alert(1)').ok).toBe(false);
    expect(parseClassroomJoinInput('data:text/html,hi').ok).toBe(false);
  });

  it('rejects unknown domains', () => {
    const parsed = parseClassroomJoinInput('https://evil.example/student/classroom/join/833366');
    expect(parsed.ok).toBe(false);
  });

  it('rejects malformed join path', () => {
    const parsed = parseClassroomJoinInput('http://192.168.1.25:5173/student/classroom/join/not-a-code');
    expect(parsed.ok).toBe(false);
  });

  it('uses VITE_PUBLIC_APP_URL for shareable origin', () => {
    vi.stubEnv('VITE_PUBLIC_APP_URL', 'https://app.example.com');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        protocol: 'http:',
        hostname: 'localhost',
        port: '5173',
        origin: 'http://localhost:5173',
        host: 'localhost:5173',
      },
    });
    expect(buildClassroomJoinUrl('123456')).toBe('https://app.example.com/student/classroom/join/123456');
  });

  it('maps parse result to navigation path', () => {
    const parsed = parseClassroomJoinInput('833366');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(classroomJoinTargetPath(parsed)).toBe('/student/classroom/join/833366');
    }
  });
});
