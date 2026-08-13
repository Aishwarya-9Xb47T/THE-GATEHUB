/**
 * Classroom Participant Service
 * Core service for managing student participation in sessions
 */

import { prisma } from '../../utils/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import type {
  ClassroomParticipant,
  ParticipantStatus,
} from './types.js';

export async function joinSession(
  sessionId: string,
  userId: string,
  deviceInfo?: { device?: string; browser?: string }
): Promise<ClassroomParticipant> {
  console.log('[ParticipantService] Join session request', { sessionId, userId, deviceInfo });
  
  // Verify session exists and is active
  const session = await prisma.classroomSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    console.error('[ParticipantService] Session not found', { sessionId });
    throw new AppError(404, 'Session not found');
  }

  console.log('[ParticipantService] Session found', { sessionId, status: session.status });

  if (session.status !== 'active') {
    console.error('[ParticipantService] Session is not active', { sessionId, status: session.status });
    throw new AppError(400, 'Session is not active');
  }

  // Check if user is already a participant
  let participant = await prisma.classroomParticipant.findUnique({
    where: {
      sessionId_userId: {
        sessionId,
        userId,
      },
    },
  });

  if (participant) {
    console.log('[ParticipantService] Existing participant found, updating', { sessionId, userId, participantId: participant.id });
    // Update existing participant
    participant = await prisma.classroomParticipant.update({
      where: { id: participant.id },
      data: {
        lastSeenAt: new Date(),
        status: 'online',
        device: deviceInfo?.device,
        browser: deviceInfo?.browser,
      },
    });
  } else {
    console.log('[ParticipantService] Creating new participant', { sessionId, userId });
    // Create new participant
    participant = await prisma.classroomParticipant.create({
      data: {
        sessionId,
        userId,
        status: 'online',
        device: deviceInfo?.device,
        browser: deviceInfo?.browser,
      },
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
    });

    console.log('[ParticipantService] New participant created', { sessionId, userId, participantId: participant.id });
    // Update analytics
    await updateParticipantCount(sessionId);
  }

  console.log('[ParticipantService] Join session successful', { sessionId, userId, participantId: participant.id });
  return participant as unknown as ClassroomParticipant;
}

export async function leaveSession(
  sessionId: string,
  userId: string
): Promise<void> {
  const participant = await prisma.classroomParticipant.findUnique({
    where: {
      sessionId_userId: {
        sessionId,
        userId,
      },
    },
  });

  if (!participant) {
    throw new AppError(404, 'Participant not found');
  }

  await prisma.classroomParticipant.update({
    where: { id: participant.id },
    data: {
      status: 'left',
      lastSeenAt: new Date(),
    },
  });

  // Update analytics
  await updateParticipantCount(sessionId);
}

export async function updateParticipantStatus(
  sessionId: string,
  userId: string,
  status: ParticipantStatus
): Promise<ClassroomParticipant> {
  const participant = await prisma.classroomParticipant.findUnique({
    where: {
      sessionId_userId: {
        sessionId,
        userId,
      },
    },
  });

  if (!participant) {
    throw new AppError(404, 'Participant not found');
  }

  const updated = await prisma.classroomParticipant.update({
    where: { id: participant.id },
    data: {
      status,
      lastSeenAt: new Date(),
    },
  });

  // Update analytics if status changed to/from online
  if (status === 'online' || participant.status === 'online') {
    await updateParticipantCount(sessionId);
  }

  return updated as unknown as ClassroomParticipant;
}

export async function toggleRaisedHand(
  sessionId: string,
  userId: string
): Promise<ClassroomParticipant> {
  const participant = await prisma.classroomParticipant.findUnique({
    where: {
      sessionId_userId: {
        sessionId,
        userId,
      },
    },
  });

  if (!participant) {
    throw new AppError(404, 'Participant not found');
  }

  const updated = await prisma.classroomParticipant.update({
    where: { id: participant.id },
    data: {
      raisedHand: !participant.raisedHand,
    },
  });

  return updated as unknown as ClassroomParticipant;
}

export async function getParticipantsBySession(
  sessionId: string,
  status?: ParticipantStatus
): Promise<ClassroomParticipant[]> {
  const where: any = {
    sessionId,
  };

  if (status) {
    where.status = status;
  }

  const participants = await prisma.classroomParticipant.findMany({
    where,
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
    orderBy: { joinedAt: 'asc' },
  });

  return participants as unknown as ClassroomParticipant[];
}

export async function getParticipantById(id: string): Promise<ClassroomParticipant> {
  const participant = await prisma.classroomParticipant.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
        },
      },
      session: {
        select: {
          id: true,
          title: true,
          roomCode: true,
        },
      },
    },
  });

  if (!participant) {
    throw new AppError(404, 'Participant not found');
  }

  return participant as unknown as ClassroomParticipant;
}

export async function removeParticipant(
  sessionId: string,
  participantId: string,
  instructorId: string
): Promise<void> {
  // Verify instructor owns the session
  const session = await prisma.classroomSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  if (session.instructorId !== instructorId) {
    throw new AppError(403, 'You do not have permission to remove participants');
  }

  await prisma.classroomParticipant.update({
    where: { id: participantId },
    data: {
      status: 'left',
      lastSeenAt: new Date(),
    },
  });

  // Update analytics
  await updateParticipantCount(sessionId);
}

export async function getRaisedHands(sessionId: string): Promise<ClassroomParticipant[]> {
  const participants = await prisma.classroomParticipant.findMany({
    where: {
      sessionId,
      raisedHand: true,
      status: 'online',
    },
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
    orderBy: { joinedAt: 'asc' },
  });

  return participants as unknown as ClassroomParticipant[];
}

export async function clearRaisedHands(sessionId: string, instructorId: string): Promise<void> {
  // Verify instructor owns the session
  const session = await prisma.classroomSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  if (session.instructorId !== instructorId) {
    throw new AppError(403, 'You do not have permission to clear raised hands');
  }

  await prisma.classroomParticipant.updateMany({
    where: {
      sessionId,
      raisedHand: true,
    },
    data: {
      raisedHand: false,
    },
  });
}

export async function updateLastSeen(
  sessionId: string,
  userId: string
): Promise<void> {
  const participant = await prisma.classroomParticipant.findUnique({
    where: {
      sessionId_userId: {
        sessionId,
        userId,
      },
    },
  });

  if (participant) {
    await prisma.classroomParticipant.update({
      where: { id: participant.id },
      data: {
        lastSeenAt: new Date(),
      },
    });
  }
}

// Helper function to update participant count in analytics
async function updateParticipantCount(sessionId: string): Promise<void> {
  const totalParticipants = await prisma.classroomParticipant.count({
    where: { sessionId },
  });

  const activeParticipants = await prisma.classroomParticipant.count({
    where: {
      sessionId,
      status: 'online',
    },
  });

  await prisma.classroomSessionAnalytics.update({
    where: { sessionId },
    data: {
      totalParticipants,
      activeParticipants,
    },
  });
}

export async function getParticipantStats(sessionId: string): Promise<{
  totalParticipants: number;
  onlineParticipants: number;
  offlineParticipants: number;
  leftParticipants: number;
  raisedHands: number;
}> {
  const participants = await prisma.classroomParticipant.findMany({
    where: { sessionId },
  });

  const stats = {
    totalParticipants: participants.length,
    onlineParticipants: participants.filter((p) => p.status === 'online').length,
    offlineParticipants: participants.filter((p) => p.status === 'offline').length,
    leftParticipants: participants.filter((p) => p.status === 'left').length,
    raisedHands: participants.filter((p) => p.raisedHand).length,
  };

  return stats;
}