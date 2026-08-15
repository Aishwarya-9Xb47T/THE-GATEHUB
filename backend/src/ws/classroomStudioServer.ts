/**
 * Classroom Studio WebSocket Server
 * Real-time synchronization for Interactive Classroom Studio
 */

import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/jwt.js';
import { prisma } from '../utils/prisma.js';
import * as pollService from '../services/classroomStudio/pollService.js';
import type {
  SlideChangeEvent,
  AnnotationEvent,
  InteractionActivateEvent,
  ResponseSubmitEvent,
  ParticipantStateEvent,
} from '../services/classroomStudio/types.js';

interface ClassroomClient extends WebSocket {
  sessionId?: string;
  userId?: string;
  role?: 'instructor' | 'student';
  isAlive?: boolean;
}

interface ClassroomSession {
  id: string;
  instructorId: string;
  clients: Map<string, ClassroomClient>;
  currentSlideId?: string | null;
  activeInteractionId?: string | null;
  liveSettings: Record<string, any>;
  version: number;
}

const wss = new WebSocketServer({ noServer: true });
const activeSessions = new Map<string, ClassroomSession>();

export function handleClassroomStudioUpgrade(
  request: any,
  socket: any,
  head: Buffer
) {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
}

wss.on('connection', (ws: ClassroomClient, request: any) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');
  const requestedUserId = url.searchParams.get('userId');
  const role = url.searchParams.get('role') as 'instructor' | 'student';
  const token = url.searchParams.get('token');

  console.log('[WS] Connection attempt', { sessionId, userId: requestedUserId, role });

  if (!sessionId || !requestedUserId || !role || !token) {
    console.error('[WS] Missing required parameters', { sessionId, userId: requestedUserId, role, hasToken: !!token });
    ws.close(1008, 'Missing required parameters');
    return;
  }

  let userId: string;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId?: string };
    if (!payload.userId || payload.userId !== requestedUserId) {
      console.error('[WS] JWT verification failed', { payloadUserId: payload.userId, requestedUserId });
      ws.close(1008, 'Unauthorized');
      return;
    }
    userId = payload.userId;
    console.log('[WS] JWT verified successfully', { userId });
  } catch (error) {
    console.error('[WS] JWT verification error', error);
    ws.close(1008, 'Unauthorized');
    return;
  }

  // Verify session exists and user has access
  verifySessionAccess(sessionId, userId, role)
    .then((session) => {
      console.log('[WS] Session access verified, adding client', { sessionId, userId, role, instructorId: session.instructorId });
      
      ws.sessionId = sessionId;
      ws.userId = userId;
      ws.role = role;
      ws.isAlive = true;

      // Add to session
      let classroomSession = activeSessions.get(sessionId);
      if (!classroomSession) {
        console.log('[WS] Creating new classroom session', { sessionId });
        classroomSession = {
          id: sessionId,
          instructorId: session.instructorId,
          clients: new Map(),
          currentSlideId: session.currentSlideId || undefined,
          activeInteractionId: session.activeInteractionId || undefined,
          liveSettings: (session.settings as Record<string, any>) || {},
          version: 1,
        };
        activeSessions.set(sessionId, classroomSession);
      }

      // Always refresh authoritative state from DB on connect/reconnect
      classroomSession.currentSlideId = session.currentSlideId || undefined;
      classroomSession.activeInteractionId = session.activeInteractionId || undefined;
      classroomSession.liveSettings = (session.settings as Record<string, any>) || {};

      classroomSession.clients.set(userId, ws);
      console.log('[WS] Client added to session', { sessionId, userId, totalClients: classroomSession.clients.size });

      // Send welcome message with current state
      const welcomeMessage = {
        type: 'connected',
        data: {
          sessionId,
          currentSlideId: classroomSession.currentSlideId,
          activeInteractionId: classroomSession.activeInteractionId,
          settings: classroomSession.liveSettings,
          version: classroomSession.version,
        },
      };
      ws.send(JSON.stringify(welcomeMessage));
      console.log('[WS] Welcome message sent', { sessionId, userId });

      void pollService.resumePollTimer(sessionId, classroomSession.activeInteractionId);
      void pollService.getActivePollSync(sessionId, userId, role).then((sync) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({
          type: 'poll:sync',
          data: {
            ...sync,
            interactionId: sync.activePoll?.id ?? null,
            interaction: sync.activePoll,
          },
        }));
      }).catch((error) => {
        console.error('[WS] Failed to sync active poll', { sessionId, userId, error });
      });

      // Notify others that user joined
      broadcastToSession(sessionId, {
        type: 'participant:joined',
        data: {
          userId,
          role,
        },
      }, userId);
      console.log('[WS] Participant join broadcast sent', { sessionId, userId });

      // Set up heartbeat
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Handle messages
      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('[WS] Message received', { sessionId, userId, type: message.type });
          await handleMessage(ws, sessionId, userId, role, message);
          ws.send(JSON.stringify({ type: 'ack', data: { eventId: message.eventId ?? null, version: activeSessions.get(sessionId)?.version } }));
        } catch (error) {
          console.error('[WS] Error handling message:', error);
          ws.send(
            JSON.stringify({
              type: 'error',
              data: {
                message: 'Failed to process message',
              },
            })
          );
        }
      });

      // Handle close
      ws.on('close', () => {
        console.log('[WS] Client disconnected', { sessionId, userId, role });
        const session = activeSessions.get(sessionId);
        if (session) {
          session.clients.delete(userId);
          console.log('[WS] Client removed from session', { sessionId, userId, remainingClients: session.clients.size });
          
          // Notify others that user left
          broadcastToSession(sessionId, {
            type: 'participant:left',
            data: {
              userId,
              role,
            },
          });

          // Clean up empty sessions
          if (session.clients.size === 0) {
            console.log('[WS] Session empty, removing from active sessions', { sessionId });
            activeSessions.delete(sessionId);
          }
        }
      });
    })
    .catch((error) => {
      console.error('[WS] Session verification failed:', error);
      ws.close(1008, 'Session verification failed');
    });
});

async function verifySessionAccess(
  sessionId: string,
  userId: string,
  role: string
) {
  console.log('[WS] Verifying session access', { sessionId, userId, role });
  
  const session = await prisma.classroomSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    console.error('[WS] Session not found', { sessionId });
    throw new Error('Session not found');
  }

  console.log('[WS] Session found', { sessionId, status: session.status, instructorId: session.instructorId });

  if (role === 'instructor' && session.instructorId !== userId) {
    console.error('[WS] Not authorized as instructor', { userId, instructorId: session.instructorId });
    throw new Error('Not authorized as instructor');
  }

  // For students, verify they are participants OR allow connection if session is active
  // (They will become participants via the HTTP join request - this fixes race condition)
  if (role === 'student') {
    const participant = await prisma.classroomParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
          userId,
        },
      },
    });

    if (!participant) {
      console.warn('[WS] Student not yet a participant, allowing connection (will join via HTTP)', { sessionId, userId });
      // Don't throw - allow connection. They'll join via HTTP request
    } else {
      console.log('[WS] Student participant verified', { sessionId, userId, status: participant.status });
    }
  }

  console.log('[WS] Session access verified successfully', { sessionId, userId, role });
  return session;
}

async function handleMessage(
  ws: ClassroomClient,
  sessionId: string,
  userId: string,
  role: string,
  message: any
) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  switch (message.type) {
    case 'slide:change':
      await handleSlideChange(session, userId, role, message);
      break;

    case 'annotation:add':
    case 'annotation:remove':
    case 'annotation:clear':
      await handleAnnotation(session, userId, role, message);
      break;

    case 'interaction:launch':
    case 'interaction:activate':
    case 'interaction:deactivate':
    case 'interaction:close':
    case 'interaction:reopen':
    case 'interaction:reveal':
      await handleInteractionLifecycle(session, userId, role, message);
      break;

    case 'response:submit':
      await handleResponseSubmit(session, userId, role, message);
      break;

    case 'interaction:update':
      await handleInteractionUpdate(session, userId, role, message);
      break;

    case 'interaction:results':
      await handleInteractionResults(session, userId, role, message);
      break;

    case 'participant:state':
      await handleParticipantState(session, userId, role, message);
      break;

    case 'pointer:move':
      if (role === 'instructor' && session.instructorId === userId) {
        await persistLiveSettings(session, { pointer: message.data });
        broadcastToSession(session.id, { type: 'pointer:move', data: message.data, version: session.version }, userId);
      }
      break;

    case 'timer:start':
    case 'timer:stop':
      if (role === 'instructor' && session.instructorId === userId) {
        await persistLiveSettings(session, { timer: { ...(session.liveSettings.timer ?? {}), ...message.data, running: message.type === 'timer:start' } });
        broadcastToSession(session.id, { type: message.type, data: session.liveSettings.timer, version: session.version });
      }
      break;

    case 'navigation:change':
      if (role === 'instructor' && session.instructorId === userId) {
        await persistLiveSettings(session, { navigation: message.data.navigation });
        broadcastToSession(session.id, { type: 'navigation:change', data: message.data, version: session.version }, userId);
      }
      break;

    case 'chat:message':
      await handleChatMessage(session, userId, role, message);
      break;

    case 'announcement:broadcast':
      if (role === 'instructor' && session.instructorId === userId) {
        broadcastToSession(session.id, { type: 'announcement:broadcast', data: message.data, version: session.version });
      }
      break;

    case 'participant:kick':
      if (role === 'instructor' && session.instructorId === userId && message.data?.userId) {
        const kickedUserId = message.data.userId;
        const targetWs = session.clients.get(kickedUserId);
        if (targetWs) {
          targetWs.send(JSON.stringify({ type: 'session:kicked', data: { message: 'You have been removed from the session by the instructor.' } }));
          targetWs.close(4001, 'Kicked by instructor');
        }
        session.clients.delete(kickedUserId);
        broadcastToSession(session.id, { type: 'participant:left', data: { userId: kickedUserId, role: 'student', kicked: true } });
      }
      break;

    case 'participant:mute':
      if (role === 'instructor' && session.instructorId === userId && message.data?.userId) {
        broadcastToSession(session.id, { type: 'participant:muted', data: message.data });
      }
      break;

    case 'session:pause':
    case 'session:resume':
      if (role === 'instructor' && session.instructorId === userId) {
        const isPaused = message.type === 'session:pause';
        await persistLiveSettings(session, { isPaused });
        broadcastToSession(session.id, { type: message.type, data: { isPaused, timestamp: new Date().toISOString() } });
      }
      break;

    case 'session:end':
      if (role === 'instructor' && session.instructorId === userId) {
        broadcastToSession(session.id, { type: 'session:end', data: { timestamp: new Date().toISOString() } });
      }
      break;

    case 'emoji:react':
      // Broadcast emoji reactions to all (students and instructor)
      broadcastToSession(session.id, { type: 'emoji:react', data: { ...message.data, userId } });
      break;

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;

    default:
      console.warn('Unknown message type:', message.type);
  }
}

async function handleSlideChange(
  session: ClassroomSession,
  userId: string,
  role: string,
  message: SlideChangeEvent
) {
  // Only instructors can change slides
  if (role !== 'instructor') {
    return;
  }

  // Verify instructor owns the session
  if (session.instructorId !== userId) {
    return;
  }

  // Update session state
  session.currentSlideId = message.data.slideId;
  session.version += 1;

  // Update database
  await prisma.classroomSession.update({
    where: { id: session.id },
    data: { currentSlideId: message.data.slideId },
  });

  // Broadcast to all clients
  broadcastToSession(session.id, { ...message, data: { ...message.data, version: session.version, timestamp: new Date().toISOString() } });
}

async function handleAnnotation(
  session: ClassroomSession,
  userId: string,
  role: string,
  message: AnnotationEvent
) {
  // Instructors can add annotations, students can only see them
  if (role !== 'instructor') {
    return;
  }

  // Verify instructor owns the session
  if (session.instructorId !== userId) {
    return;
  }

  const annotations = (session.liveSettings.annotations ?? {}) as Record<string, unknown[]>;
  const slideId = message.data.slideId;
  if (message.type === 'annotation:clear') annotations[slideId] = [];
  else if (message.type === 'annotation:add') annotations[slideId] = [...(annotations[slideId] ?? []), message.data.annotation];
  else if (message.type === 'annotation:remove') annotations[slideId] = (annotations[slideId] ?? []).filter((annotation: any) => annotation?.id !== message.data.annotation?.id);
  await persistLiveSettings(session, { annotations });
  broadcastToSession(session.id, { ...message, data: { ...message.data, version: session.version } });
}

async function handleInteractionLifecycle(
  session: ClassroomSession,
  userId: string,
  role: string,
  message: any
) {
  // Only instructors can control interaction lifecycle
  if (role !== 'instructor') {
    return;
  }

  // Verify instructor owns the session
  if (session.instructorId !== userId) {
    return;
  }

  const interactionId = message.data.interactionId;

  switch (message.type) {
    case 'interaction:launch':
    case 'interaction:activate':
      session.activeInteractionId = interactionId;
      session.version += 1;
      await prisma.classroomSession.update({
        where: { id: session.id },
        data: { activeInteractionId: interactionId },
      });
      break;

    case 'interaction:deactivate':
    case 'interaction:close':
      session.activeInteractionId = null;
      session.version += 1;
      await prisma.classroomSession.update({
        where: { id: session.id },
        data: { activeInteractionId: null },
      });
      break;

    case 'interaction:reopen':
      session.activeInteractionId = interactionId;
      session.version += 1;
      await prisma.classroomSession.update({
        where: { id: session.id },
        data: { activeInteractionId: interactionId },
      });
      break;

    case 'interaction:reveal':
      // Broadcast reveal event - doesn't change activeInteractionId
      session.version += 1;
      broadcastToSession(session.id, { type: 'interaction:reveal', data: { interactionId, version: session.version, timestamp: new Date().toISOString() } }, userId);
      break;
  }

  // BUG 3 FIX: For activate/launch events, fetch the full interaction from DB
  // and include it in the broadcast so students don't need to look it up from
  // potentially stale session data fetched at join time.
  let enrichedData: any = { interactionId, version: session.version, timestamp: new Date().toISOString() };
  if (message.type === 'interaction:activate' || message.type === 'interaction:launch' || message.type === 'interaction:reopen') {
    try {
      const interaction = await prisma.interaction.findUnique({
        where: { id: interactionId },
        select: { id: true, type: true, settings: true, duration: true, points: true, slideId: true },
      });
      if (interaction) {
        enrichedData = { ...enrichedData, interaction, slideId: interaction.slideId };
      }
    } catch (err) {
      console.warn('[WS] Could not fetch interaction details for enriched broadcast:', err);
    }
  }

  // Broadcast to all clients
  broadcastToSession(session.id, {
    type: message.type,
    data: enrichedData,
  });
}

async function handleInteractionUpdate(
  session: ClassroomSession,
  userId: string,
  role: string,
  message: any
) {
  // Only instructors can update interactions
  if (role !== 'instructor') {
    return;
  }

  if (session.instructorId !== userId) {
    return;
  }

  session.version += 1;
  broadcastToSession(session.id, { 
    ...message, 
    data: { 
      ...message.data, 
      version: session.version, 
      timestamp: new Date().toISOString() 
    } 
  });
}

async function handleInteractionResults(
  session: ClassroomSession,
  userId: string,
  role: string,
  message: any
) {
  // Only instructors can request results
  if (role !== 'instructor') {
    return;
  }

  if (session.instructorId !== userId) {
    return;
  }

  // Fetch live results and broadcast to instructor
  const interactionId = message.data.interactionId;
  const responses = await prisma.interactionResponse.findMany({
    where: {
      sessionId: session.id,
      interactionId,
    },
    include: {
      participant: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
        },
      },
    },
  });

  const instructorClient = session.clients.get(session.instructorId);
  if (instructorClient && instructorClient.readyState === WebSocket.OPEN) {
    instructorClient.send(JSON.stringify({
      type: 'interaction:results',
      data: {
        interactionId,
        responses,
        timestamp: new Date().toISOString(),
      },
    }));
  }
}

async function persistLiveSettings(session: ClassroomSession, patch: Record<string, unknown>) {
  session.liveSettings = { ...session.liveSettings, ...patch };
  session.version += 1;
  await prisma.classroomSession.update({ where: { id: session.id }, data: { settings: session.liveSettings } });
}

async function handleResponseSubmit(
  session: ClassroomSession,
  userId: string,
  role: string,
  message: any
) {
  // Students submit responses
  if (role !== 'student') {
    return;
  }

  // Store response in database
  const participant = await prisma.classroomParticipant.findUnique({
    where: {
      sessionId_userId: {
        sessionId: session.id,
        userId,
      },
    },
  });

  if (!participant) {
    return;
  }

  // Broadcast to instructor only with participant info
  const instructorClient = session.clients.get(session.instructorId);
  if (instructorClient && instructorClient.readyState === WebSocket.OPEN) {
    instructorClient.send(JSON.stringify({
      type: 'response:submit',
      data: {
        ...message.data,
        participantId: participant.id,
        userId,
        firstName: participant.userId, // This would need to be fetched from user table
        timestamp: new Date().toISOString(),
      },
    }));
  }

  // Broadcast participant update to all clients for response tracking
  broadcastToSession(session.id, {
    type: 'participant:response',
    data: {
      participantId: participant.id,
      userId,
      interactionId: message.data.interactionId,
      hasResponded: true,
      timestamp: new Date().toISOString(),
    },
  });
}

async function handleParticipantState(
  session: ClassroomSession,
  userId: string,
  role: string,
  message: ParticipantStateEvent
) {
  const participant = await prisma.classroomParticipant.findUnique({
    where: { sessionId_userId: { sessionId: session.id, userId } },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
    },
  });

  if (message.data.raisedHand !== undefined && participant) {
    await prisma.classroomParticipant.update({
      where: { id: participant.id },
      data: { raisedHand: message.data.raisedHand },
    });
  }

  const payload = {
    type: 'participant:state',
    data: {
      userId,
      participantId: userId,
      raisedHand: message.data.raisedHand,
      firstName: participant?.user?.firstName ?? 'Student',
      lastName: participant?.user?.lastName ?? '',
    },
  };

  // Notify instructor
  const instructorClient = session.clients.get(session.instructorId);
  if (instructorClient && instructorClient.readyState === WebSocket.OPEN) {
    instructorClient.send(JSON.stringify(payload));
  }

  // Broadcast hand count sync to all clients
  if (message.data.raisedHand !== undefined) {
    const raisedCount = await prisma.classroomParticipant.count({
      where: { sessionId: session.id, raisedHand: true },
    });
    broadcastToSession(session.id, {
      type: 'participants:stats',
      data: { raisedHands: raisedCount },
    });
  }
}

async function handleChatMessage(
  session: ClassroomSession,
  userId: string,
  role: string,
  message: any
) {
  const text = message.data?.text;
  if (!text || typeof text !== 'string' || !text.trim()) return;

  // Persist chat message
  const saved = await prisma.studentChatMessage.create({
    data: {
      sessionId: session.id,
      userId,
      message: text.trim(),
      role: role === 'instructor' ? 'instructor' : 'student',
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
    },
  });

  // Broadcast to all clients
  broadcastToSession(session.id, { type: 'chat:message', data: saved });
}

function broadcastToSession(
  sessionId: string,
  message: any,
  excludeUserId?: string,
  role?: 'instructor' | 'student'
) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  const messageStr = JSON.stringify(message);

  session.clients.forEach((client, userId) => {
    if (excludeUserId && userId === excludeUserId) return;
    if (role && client.role !== role) return;
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

// Heartbeat interval to detect dead connections
const interval = setInterval(() => {
  wss.clients.forEach((ws: ClassroomClient) => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }

    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

export function broadcastToSessionId(sessionId: string, message: any, role?: 'instructor' | 'student') {
  broadcastToSession(sessionId, message, undefined, role);
}

pollService.setPollBroadcaster((sessionId, message, role) => {
  broadcastToSession(sessionId, message, undefined, role);
});
pollService.setPollRuntimeUpdater((sessionId, patch) => {
  updateSessionRuntimeState(sessionId, patch);
});

/** Keeps reconnecting clients in sync when an authoritative HTTP mutation is
 * used (the same mutation path used by the instructor UI). */
export function updateSessionRuntimeState(sessionId: string, patch: { currentSlideId?: string | null; activeInteractionId?: string | null; settings?: Record<string, unknown> }) {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  if (patch.currentSlideId !== undefined) session.currentSlideId = patch.currentSlideId ?? undefined;
  if (patch.activeInteractionId !== undefined) session.activeInteractionId = patch.activeInteractionId ?? undefined;
  if (patch.settings) session.liveSettings = { ...session.liveSettings, ...patch.settings };
  session.version += 1;
}

export function getSessionClientCount(sessionId: string): number {
  const session = activeSessions.get(sessionId);
  return session ? session.clients.size : 0;
}
