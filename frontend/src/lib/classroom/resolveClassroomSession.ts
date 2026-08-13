/**
 * Resolve an Interactive Classroom session for join navigation.
 * Single handler used by code entry, QR, paste-link, and deep links.
 */

export type ResolvedClassroomSession = {
  id: string;
  roomCode: string;
  title?: string;
  status: string;
  instructorStarted?: boolean;
};

export type ResolveClassroomErrorCode =
  | 'not_found'
  | 'ended'
  | 'unauthorized'
  | 'network'
  | 'unknown';

export class ResolveClassroomError extends Error {
  code: ResolveClassroomErrorCode;
  constructor(code: ResolveClassroomErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('lms_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data.message || data.error || '';
  } catch {
    return '';
  }
}

export async function fetchClassroomSessionByRoomCode(
  roomCode: string,
): Promise<ResolvedClassroomSession> {
  const code = roomCode.trim();
  const res = await fetch(`/api/classroom-studio/sessions/room/${encodeURIComponent(code)}`, {
    headers: authHeaders(),
  });
  if (res.status === 401 || res.status === 403) {
    throw new ResolveClassroomError('unauthorized', 'Please sign in to join this classroom.');
  }
  if (res.status === 404) {
    throw new ResolveClassroomError(
      'not_found',
      'Classroom session not found. Please check the link or session code.',
    );
  }
  if (!res.ok) {
    const msg = await parseError(res);
    throw new ResolveClassroomError('unknown', msg || 'Unable to join classroom. Please try again.');
  }
  const data = await res.json();
  return {
    id: data.id,
    roomCode: data.roomCode,
    title: data.title || data.presentation?.title,
    status: data.status,
    instructorStarted: data.instructorStarted,
  };
}

export async function fetchClassroomSessionById(
  sessionId: string,
): Promise<ResolvedClassroomSession> {
  const res = await fetch(`/api/classroom-studio/sessions/${encodeURIComponent(sessionId)}`, {
    headers: authHeaders(),
  });
  if (res.status === 401 || res.status === 403) {
    throw new ResolveClassroomError('unauthorized', 'Please sign in to join this classroom.');
  }
  if (res.status === 404) {
    throw new ResolveClassroomError(
      'not_found',
      'Classroom session not found. Please check the link or session code.',
    );
  }
  if (!res.ok) {
    const msg = await parseError(res);
    throw new ResolveClassroomError('unknown', msg || 'Unable to join classroom. Please try again.');
  }
  const data = await res.json();
  return {
    id: data.id,
    roomCode: data.roomCode,
    title: data.title || data.presentation?.title,
    status: data.status,
    instructorStarted: data.instructorStarted,
  };
}

export function studentDestinationForSession(session: ResolvedClassroomSession): string {
  const status = String(session.status || '').toLowerCase();
  if (status === 'ended' || status === 'cancelled' || status === 'canceled') {
    throw new ResolveClassroomError('ended', 'This classroom session has ended.');
  }
  if (status === 'active' || session.instructorStarted) {
    return `/student/classroom/session/${session.id}`;
  }
  // scheduled / waiting / draft-like → waiting room
  return `/student/classroom/waiting/${session.id}`;
}

export async function resolveClassroomJoinTarget(input: {
  roomCode?: string;
  sessionId?: string;
}): Promise<{ session: ResolvedClassroomSession; destination: string }> {
  try {
    const session = input.roomCode
      ? await fetchClassroomSessionByRoomCode(input.roomCode)
      : await fetchClassroomSessionById(input.sessionId!);
    const destination = studentDestinationForSession(session);
    return { session, destination };
  } catch (err) {
    if (err instanceof ResolveClassroomError) throw err;
    throw new ResolveClassroomError('network', 'Network connection lost. Please try again.');
  }
}
