/**
 * Classroom Session Service
 * Core service for managing live classroom sessions
 */

import crypto from 'crypto';
import { prisma } from '../../utils/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { rewriteClassroomAssetTree } from './classroomAssetUrls.js';
import { aggregatePresentationRenderStatus, isOriginalVisualSource, readSlideVisual } from './classroomAssetPath.js';
import { getClassroomRenderJob, isExclusiveVisualRenderRunning } from './presentationVisualRepairService.js';
import type {
  ClassroomSession,
  CreateSessionInput,
  UpdateSessionInput,
  SessionStatus,
  ClassroomParticipant,
} from './types.js';

const ROOM_CODE_CHARS = '0123456789';

function generateRoomCode(): string {
  let code = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[bytes[i]! % ROOM_CODE_CHARS.length];
  }
  return code;
}

function withRewrittenSlideAssets<T extends {
  presentation?: { id: string; status?: string; slides?: Array<{ content?: unknown }> };
}>(session: T): T {
  const presentationId = session.presentation?.id;
  const slides = session.presentation?.slides;
  if (!presentationId || !slides) return session;
  const rewrittenSlides = slides.map((slide) => ({
    ...slide,
    content: rewriteClassroomAssetTree(slide.content, presentationId),
  }));
  const hasVisualPipeline = rewrittenSlides.some((slide) => readSlideVisual(slide.content));
  const originalSourceReady = rewrittenSlides.length > 0
    && rewrittenSlides.every((slide) => isOriginalVisualSource(readSlideVisual(slide.content)));
  const status = originalSourceReady
    ? 'ready'
    : hasVisualPipeline
    ? aggregatePresentationRenderStatus({
      slides: rewrittenSlides,
      exclusiveRunning: isExclusiveVisualRenderRunning(presentationId),
      jobStatus: getClassroomRenderJob(presentationId)?.status ?? null,
    })
    : session.presentation?.status;
  return {
    ...session,
    presentation: {
      ...session.presentation,
      status,
      slides: rewrittenSlides,
    },
  };
}

async function uniqueRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRoomCode();
    const existing = await prisma.classroomSession.findUnique({ where: { roomCode: code } });
    if (!existing) return code;
  }
  throw new AppError(500, 'Failed to generate room code');
}

export async function createSession(
  instructorId: string,
  data: CreateSessionInput
): Promise<ClassroomSession> {
  console.log('[SessionService] Creating session', { instructorId, presentationId: data.presentationId });
  
  const presentation = await prisma.presentation.findUnique({
    where: { id: data.presentationId },
  });

  if (!presentation) {
    console.error('[SessionService] Presentation not found', { presentationId: data.presentationId });
    throw new AppError(404, 'Presentation not found');
  }

  if (presentation.instructorId !== instructorId) {
    console.error('[SessionService] Access denied to presentation', { instructorId, presentationInstructorId: presentation.instructorId });
    throw new AppError(403, 'You do not have access to this presentation');
  }

  const firstVisibleSlide = await prisma.slide.findFirst({
    where: { presentationId: data.presentationId, isHidden: false },
    orderBy: { order: 'asc' },
    select: { id: true },
  });
  if (!firstVisibleSlide) {
    console.error('[SessionService] No visible slides found');
    throw new AppError(400, 'Add at least one visible slide before starting a classroom session');
  }

  const roomCode = await uniqueRoomCode();
  const isScheduled = data.scheduledAt && data.scheduledAt > new Date();

  console.log('[SessionService] Session data prepared', { roomCode, isScheduled, status: isScheduled ? 'scheduled' : 'active' });

  const session = await prisma.classroomSession.create({
    data: {
      presentationId: data.presentationId,
      instructorId,
      title: data.title || presentation.title,
      roomCode,
      status: isScheduled ? 'scheduled' : 'active',
      scheduledAt: data.scheduledAt,
      startedAt: isScheduled ? null : new Date(),
      currentSlideId: firstVisibleSlide.id,
      settings: data.settings,
    },
    include: {
      presentation: {
        include: {
          slides: {
            orderBy: { order: 'asc' },
          },
        },
      },
    },
  });

  console.log('[SessionService] Session created', { sessionId: session.id, roomCode: session.roomCode, status: session.status });

  await prisma.classroomSessionAnalytics.create({
    data: {
      sessionId: session.id,
      totalParticipants: 0,
      activeParticipants: 0,
      totalResponses: 0,
    },
  });

  console.log('[SessionService] Session analytics initialized', { sessionId: session.id });
  return withRewrittenSlideAssets(session) as any;
}

export async function getSessionById(id: string): Promise<ClassroomSession> {
  const session = await prisma.classroomSession.findUnique({
    where: { id },
    include: {
      presentation: {
        include: {
          slides: {
            orderBy: { order: 'asc' },
            include: {
              interactions: {
                orderBy: { order: 'asc' },
              },
            },
          },
        },
      },
      instructor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
        },
      },
      participants: {
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
      analytics: true,
    },
  });

  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  return withRewrittenSlideAssets(session) as any;
}

export async function getSessionByRoomCode(roomCode: string): Promise<ClassroomSession> {
  const session = await prisma.classroomSession.findUnique({
    where: { roomCode },
    include: {
      presentation: {
        include: {
          slides: {
            orderBy: { order: 'asc' },
            include: {
              interactions: {
                orderBy: { order: 'asc' },
              },
            },
          },
        },
      },
      instructor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
        },
      },
      participants: {
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
      analytics: true,
    },
  });

  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  return withRewrittenSlideAssets(session) as any;
}

export async function getSessionsByInstructor(
  instructorId: string,
  filters?: {
    status?: SessionStatus;
    presentationId?: string;
  }
): Promise<ClassroomSession[]> {
  const where: any = {
    instructorId,
  };

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.presentationId) {
    where.presentationId = filters.presentationId;
  }

  const sessions = await prisma.classroomSession.findMany({
    where,
    include: {
      presentation: {
        select: {
          id: true,
          title: true,
          thumbnail: true,
        },
      },
      _count: {
        select: {
          participants: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return sessions as any;
}

export async function updateSession(
  id: string,
  instructorId: string,
  data: UpdateSessionInput
): Promise<ClassroomSession> {
  const existing = await prisma.classroomSession.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new AppError(404, 'Session not found');
  }

  if (existing.instructorId !== instructorId) {
    throw new AppError(403, 'You do not have permission to update this session');
  }

  const session = await prisma.classroomSession.update({
    where: { id },
    data: {
      title: data.title,
      scheduledAt: data.scheduledAt,
      settings: data.settings,
    },
  });

  return session as any;
}

export async function startSession(id: string, instructorId: string): Promise<ClassroomSession> {
  const session = await prisma.classroomSession.findUnique({
    where: { id },
  });

  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  if (session.instructorId !== instructorId) {
    throw new AppError(403, 'You do not have permission to start this session');
  }

  if (session.status !== 'scheduled') {
    throw new AppError(400, 'Only scheduled sessions can be started');
  }

  const firstVisibleSlide = session.currentSlideId ? null : await prisma.slide.findFirst({
    where: { presentationId: session.presentationId, isHidden: false },
    orderBy: { order: 'asc' },
    select: { id: true },
  });
  if (!session.currentSlideId && !firstVisibleSlide) {
    throw new AppError(400, 'Add at least one visible slide before starting a classroom session');
  }

  const updated = await prisma.classroomSession.update({
    where: { id },
    data: {
      status: 'active',
      startedAt: new Date(),
      currentSlideId: session.currentSlideId ?? firstVisibleSlide!.id,
    },
  });

  return updated as any;
}

export async function endSession(id: string, instructorId: string): Promise<ClassroomSession> {
  const session = await prisma.classroomSession.findUnique({
    where: { id },
  });

  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  if (session.instructorId !== instructorId) {
    throw new AppError(403, 'You do not have permission to end this session');
  }

  if (session.status !== 'active') {
    throw new AppError(400, 'Only active sessions can be ended');
  }

  const updated = await prisma.classroomSession.update({
    where: { id },
    data: {
      status: 'completed',
      endedAt: new Date(),
    },
  });

  return updated as any;
}

export async function cancelSession(id: string, instructorId: string): Promise<ClassroomSession> {
  const session = await prisma.classroomSession.findUnique({
    where: { id },
  });

  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  if (session.instructorId !== instructorId) {
    throw new AppError(403, 'You do not have permission to cancel this session');
  }

  if (session.status === 'completed') {
    throw new AppError(400, 'Cannot cancel a completed session');
  }

  const updated = await prisma.classroomSession.update({
    where: { id },
    data: {
      status: 'cancelled',
      endedAt: new Date(),
    },
  });

  return updated as any;
}

export async function deleteSession(id: string, instructorId: string): Promise<void> {
  const session = await prisma.classroomSession.findUnique({
    where: { id },
  });

  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  if (session.instructorId !== instructorId) {
    throw new AppError(403, 'You do not have permission to delete this session');
  }

  if (session.status === 'active') {
    throw new AppError(400, 'Cannot delete an active session');
  }

  await prisma.classroomSession.delete({
    where: { id },
  });
}

export async function updateCurrentSlide(
  sessionId: string,
  slideId: string,
  instructorId: string
): Promise<ClassroomSession> {
  const session = await prisma.classroomSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  if (session.instructorId !== instructorId) {
    throw new AppError(403, 'You do not have permission to update this session');
  }

  const slide = await prisma.slide.findFirst({
    where: {
      id: slideId,
      presentationId: session.presentationId,
    },
  });

  if (!slide) {
    throw new AppError(400, 'Slide does not belong to this presentation');
  }

  const updated = await prisma.classroomSession.update({
    where: { id: sessionId },
    data: {
      currentSlideId: slideId,
      activeInteractionId: null,
    },
  });

  console.log(`[CLASSROOM_SLIDE] session=${sessionId} slide=${slideId} previousActive=${session.activeInteractionId || "none"}`);

  return updated as any;
}

export async function activateInteraction(
  sessionId: string,
  interactionId: string,
  instructorId: string
): Promise<ClassroomSession> {
  const session = await prisma.classroomSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  if (session.instructorId !== instructorId) {
    throw new AppError(403, 'You do not have permission to update this session');
  }

  const interaction = await prisma.interaction.findUnique({
    where: { id: interactionId },
  });

  if (!interaction) {
    throw new AppError(404, 'Interaction not found');
  }

  const updated = await prisma.classroomSession.update({
    where: { id: sessionId },
    data: {
      activeInteractionId: interactionId,
    },
  });

  return updated as any;
}

export async function deactivateInteraction(
  sessionId: string,
  instructorId: string
): Promise<ClassroomSession> {
  const session = await prisma.classroomSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  if (session.instructorId !== instructorId) {
    throw new AppError(403, 'You do not have permission to update this session');
  }

  const updated = await prisma.classroomSession.update({
    where: { id: sessionId },
    data: {
      activeInteractionId: null,
    },
  });

  return updated as any;
}
