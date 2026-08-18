/**
 * Classroom Studio Controller
 * HTTP endpoints for the Interactive Classroom Studio
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';
import * as presentationService from '../services/classroomStudio/presentationService.js';
import * as slideService from '../services/classroomStudio/slideService.js';
import * as interactionService from '../services/classroomStudio/interactionService.js';
import * as sessionService from '../services/classroomStudio/sessionService.js';
import * as participantService from '../services/classroomStudio/participantService.js';
import * as responseService from '../services/classroomStudio/responseService.js';
import * as qrCodeService from '../services/classroomStudio/qrCodeService.js';
import * as analyticsService from '../services/classroomStudio/analyticsService.js';
import * as pollService from '../services/classroomStudio/pollService.js';
import * as aiRecommendationService from '../services/classroomStudio/aiRecommendationService.js';
import * as presentationImportService from '../services/classroomStudio/presentationImportService.js';
import * as googleSlidesPublicService from '../services/classroomStudio/googleSlidesPublicService.js';
import * as sessionTokenService from '../services/classroomStudio/sessionTokenService.js';
import {
  assertCanAccessClassroomPresentation,
  streamClassroomPresentationAsset,
} from '../services/classroomStudio/classroomAssetService.js';
import { parseClassroomAssetFilename } from '../services/classroomStudio/classroomAssetPath.js';
import {
  inspectPresentationVisuals,
  regeneratePresentationVisuals as regeneratePresentationVisualsService,
} from '../services/classroomStudio/presentationVisualRepairService.js';
import { analyzeSlideContent as parseSlideInteraction } from '../services/classroomStudio/slideParserEngine.js';
import { enrichInteractionSettings } from '../services/classroomStudio/slideContentParser.js';
import { broadcastToSessionId, updateSessionRuntimeState } from '../ws/classroomStudioServer.js';
import { toPublicPollSummary, getPollSettings } from '../services/classroomStudio/pollUtils.js';

function getUserId(req: Request): string {
  return (req as any).user?.id || '';
}

// Presentation endpoints
export async function createPresentation(req: Request, res: Response, next: NextFunction) {
  try {
    const instructorId = getUserId(req);
    const data = req.body;

    const presentation = await presentationService.createPresentation(instructorId, data);

    res.status(201).json(presentation);
  } catch (error) {
    next(error);
  }
}

export async function getPresentations(req: Request, res: Response, next: NextFunction) {
  try {
    const instructorId = getUserId(req);
    const filters = {
      status: req.query.status as any,
      courseId: req.query.courseId as string,
      search: req.query.search as string,
    };

    const presentations = await presentationService.getPresentationsByInstructor(instructorId, filters);

    res.json(presentations);
  } catch (error) {
    next(error);
  }
}

export async function getPresentation(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const instructorId = getUserId(req);

    const presentation = await presentationService.getPresentationById(id, instructorId);

    res.json(presentation);
  } catch (error) {
    next(error);
  }
}

export async function servePresentationAsset(req: Request, res: Response, next: NextFunction) {
  try {
    const { id, kind, filename } = req.params;
    const parsed = parseClassroomAssetFilename(kind, filename);
    if (!id || !parsed) {
      throw new AppError(400, "Invalid presentation asset path", true, {
        code: "CLASSROOM_ASSET_PATH_INVALID",
        stage: "routing",
      });
    }

    const userId = getUserId(req);
    const role = (req as any).user?.role as string | undefined;
    await assertCanAccessClassroomPresentation(userId, role, id);

    const streamed = await streamClassroomPresentationAsset(res, id, parsed.rest, {
      method: req.method,
      origin: typeof req.headers.origin === "string" ? req.headers.origin : undefined,
      range: typeof req.headers.range === "string" ? req.headers.range : undefined,
    });
    if (streamed) return;
    res.status(404).json({
      success: false,
      error: {
        code: "CLASSROOM_ASSET_NOT_FOUND",
        message: "Presentation asset not found",
        stage: "storage",
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getPresentationVisualHealth(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const instructorId = getUserId(req);
    await assertCanAccessClassroomPresentation(instructorId, (req as any).user?.role, id);
    const health = await inspectPresentationVisuals(id);
    res.json(health);
  } catch (error) {
    next(error);
  }
}

export async function regeneratePresentationVisuals(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const instructorId = getUserId(req);
    const result = await regeneratePresentationVisualsService(
      id,
      instructorId,
      (req as any).user?.role as string | undefined,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function updatePresentation(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const instructorId = getUserId(req);
    const data = req.body;

    const presentation = await presentationService.updatePresentation(id, instructorId, data);

    res.json(presentation);
  } catch (error) {
    next(error);
  }
}

export async function deletePresentation(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const instructorId = getUserId(req);

    await presentationService.deletePresentation(id, instructorId);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function duplicatePresentation(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const instructorId = getUserId(req);

    const presentation = await presentationService.duplicatePresentation(id, instructorId);

    res.status(201).json(presentation);
  } catch (error) {
    next(error);
  }
}

export async function getPresentationStats(req: Request, res: Response, next: NextFunction) {
  try {
    const instructorId = getUserId(req);

    const stats = await presentationService.getPresentationStats(instructorId);

    res.json(stats);
  } catch (error) {
    next(error);
  }
}

// Slide endpoints
export async function createSlide(req: Request, res: Response, next: NextFunction) {
  try {
    const data = req.body;

    const slide = await slideService.createSlide(data);

    res.status(201).json(slide);
  } catch (error) {
    next(error);
  }
}

export async function getSlides(req: Request, res: Response, next: NextFunction) {
  try {
    const { presentationId } = req.params;
    const includeHidden = req.query.includeHidden === 'true';

    const slides = await slideService.getSlidesByPresentation(presentationId, includeHidden);

    res.json(slides);
  } catch (error) {
    next(error);
  }
}

export async function getSlide(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const slide = await slideService.getSlideById(id);

    res.json(slide);
  } catch (error) {
    next(error);
  }
}

export async function updateSlide(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = req.body;

    const slide = await slideService.updateSlide(id, data);
    const activeSessions = await prisma.classroomSession.findMany({ where: { presentationId: slide.presentationId, status: 'active' }, select: { id: true } });
    activeSessions.forEach((session) => broadcastToSessionId(session.id, { type: 'slide:update', data: { slide, timestamp: new Date().toISOString() } }));

    res.json(slide);
  } catch (error) {
    next(error);
  }
}

export async function deleteSlide(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    await slideService.deleteSlide(id);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function reorderSlides(req: Request, res: Response, next: NextFunction) {
  try {
    const { presentationId } = req.params;
    const { slides } = req.body;

    const updatedSlides = await slideService.reorderSlides(presentationId, slides);

    res.json(updatedSlides);
  } catch (error) {
    next(error);
  }
}

export async function duplicateSlide(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const slide = await slideService.duplicateSlide(id);

    res.status(201).json(slide);
  } catch (error) {
    next(error);
  }
}

// Interaction endpoints
export async function createInteraction(req: Request, res: Response, next: NextFunction) {
  try {
    const data = req.body;

    const interaction = await interactionService.createInteraction(data);

    res.status(201).json(interaction);
  } catch (error) {
    next(error);
  }
}

export async function getInteractions(req: Request, res: Response, next: NextFunction) {
  try {
    const { slideId } = req.params;

    const interactions = await interactionService.getInteractionsBySlide(slideId);

    res.json(interactions);
  } catch (error) {
    next(error);
  }
}

export async function updateInteraction(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = req.body;

    const interaction = await interactionService.updateInteraction(id, data);

    res.json(interaction);
  } catch (error) {
    next(error);
  }
}

export async function deleteInteraction(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    await interactionService.deleteInteraction(id);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function duplicateInteraction(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const interaction = await interactionService.duplicateInteraction(id);

    res.status(201).json(interaction);
  } catch (error) {
    next(error);
  }
}

// Session endpoints
export async function createSession(req: Request, res: Response, next: NextFunction) {
  try {
    const instructorId = getUserId(req);
    const data = req.body;

    const session = await sessionService.createSession(instructorId, data);

    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
}

export async function getSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const instructorId = getUserId(req);
    const filters = {
      status: req.query.status as any,
      presentationId: req.query.presentationId as string,
    };

    const sessions = await sessionService.getSessionsByInstructor(instructorId, filters);

    res.json(sessions);
  } catch (error) {
    next(error);
  }
}

export async function getSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const session = await sessionService.getSessionById(id);

    const userId = getUserId(req);
    const isInstructor = session.instructorId === userId;
    const isParticipant = (session.participants as any[])?.some((participant) => participant.userId === userId);

    // Allow authenticated users to fetch session data for joining purposes
    // Only restrict access if session is not active (scheduled/completed sessions)
    if (session.status !== 'active' && !isInstructor && !isParticipant) {
      throw new AppError(403, 'Join this session before viewing it');
    }

    res.json(session);
  } catch (error) {
    next(error);
  }
}

export async function getSessionByRoomCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { roomCode } = req.params;

    const session = await sessionService.getSessionByRoomCode(roomCode);

    res.json(session);
  } catch (error) {
    next(error);
  }
}

export async function updateSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const instructorId = getUserId(req);
    const data = req.body;

    const session = await sessionService.updateSession(id, instructorId, data);

    res.json(session);
  } catch (error) {
    next(error);
  }
}

export async function startSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const instructorId = getUserId(req);

    const session = await sessionService.startSession(id, instructorId);

    res.json(session);
  } catch (error) {
    next(error);
  }
}

export async function endSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const instructorId = getUserId(req);

    const session = await sessionService.endSession(id, instructorId);

    broadcastToSessionId(id, {
      type: 'session:end',
      data: { timestamp: new Date().toISOString() },
    });

    res.json(session);
  } catch (error) {
    next(error);
  }
}

export async function cancelSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const instructorId = getUserId(req);

    const session = await sessionService.cancelSession(id, instructorId);

    res.json(session);
  } catch (error) {
    next(error);
  }
}

export async function deleteSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const instructorId = getUserId(req);

    await sessionService.deleteSession(id, instructorId);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function updateCurrentSlide(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const instructorId = getUserId(req);
    const { slideId } = req.body;

    const existing = await prisma.classroomSession.findUnique({
      where: { id },
      select: { activeInteractionId: true, instructorId: true },
    });
    if (existing?.activeInteractionId) {
      try {
        await pollService.closePoll(id, instructorId, existing.activeInteractionId, { asInstructor: true });
      } catch {
        /* not a live poll or already closed */
      }
    }

    const session = await sessionService.updateCurrentSlide(id, slideId, instructorId);
    updateSessionRuntimeState(id, { currentSlideId: slideId, activeInteractionId: null });
    console.log(`[CLASSROOM_SLIDE] session=${id} slide=${slideId} instructor=${instructorId}`);

    broadcastToSessionId(id, {
      type: 'slide:change',
      data: {
        slideId,
        previousSlideId: req.body.previousSlideId ?? null,
        timestamp: new Date().toISOString(),
        version: session.updatedAt.getTime(),
      },
    });

    res.json(session);
  } catch (error) {
    next(error);
  }
}

export async function activateInteraction(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.sessionId || req.params.id;
    const { interactionId } = req.body;
    const instructorId = getUserId(req);

    const session = await sessionService.activateInteraction(id, interactionId, instructorId);
    updateSessionRuntimeState(id, { activeInteractionId: interactionId });

    const interaction = await prisma.interaction.findUnique({
      where: { id: interactionId },
      select: { id: true, type: true, title: true, question: true, options: true, settings: true, duration: true, points: true, slideId: true },
    });

    let broadcastInteraction = interaction ?? undefined;
    if (interaction?.slideId) {
      const slide = await prisma.slide.findUnique({
        where: { id: interaction.slideId },
        select: { title: true, content: true },
      });
      if (slide) {
        const enrichedSettings = enrichInteractionSettings(
          slide,
          interaction.type,
          (interaction.settings as Record<string, unknown>) ?? {},
        );
        broadcastInteraction = { ...interaction, settings: enrichedSettings as any };
        if (JSON.stringify(enrichedSettings) !== JSON.stringify(interaction.settings)) {
          await prisma.interaction.update({
            where: { id: interactionId },
            data: { settings: enrichedSettings as any },
          });
        }
      }
    }

    broadcastToSessionId(id, {
      type: 'interaction:activate',
      data: {
        interactionId,
        interaction: broadcastInteraction,
        slideId: interaction?.slideId ?? session.currentSlideId,
        timestamp: new Date().toISOString(),
      },
    });

    const summary = await responseService.getResponseSummary(id, interactionId);
    broadcastToSessionId(id, {
      type: 'analytics:update',
      data: { interactionId, summary, timestamp: new Date().toISOString() },
    });

    res.json(session);
  } catch (error) {
    next(error);
  }
}

export async function deactivateInteraction(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.sessionId || req.params.id;
    const instructorId = getUserId(req);

    const session = await sessionService.deactivateInteraction(id, instructorId);
    updateSessionRuntimeState(id, { activeInteractionId: null });

    broadcastToSessionId(id, {
      type: 'interaction:deactivate',
      data: {
        timestamp: new Date().toISOString(),
      },
    });

    res.json(session);
  } catch (error) {
    next(error);
  }
}

// Participant endpoints
export async function joinSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const userId = getUserId(req);

    const participant = await participantService.joinSession(sessionId, userId);

    const enriched = await prisma.classroomParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
    });

    broadcastToSessionId(sessionId, {
      type: 'participant:joined',
      data: {
        userId,
        role: 'student',
        participant: enriched,
      },
    });

    res.status(201).json(participant);
  } catch (error) {
    next(error);
  }
}

export async function leaveSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const userId = getUserId(req);

    await participantService.leaveSession(sessionId, userId);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function getParticipants(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;

    const participants = await participantService.getParticipantsBySession(sessionId);

    res.json(participants);
  } catch (error) {
    next(error);
  }
}

export async function toggleRaisedHand(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const userId = getUserId(req);

    const participant = await participantService.toggleRaisedHand(sessionId, userId);

    res.json(participant);
  } catch (error) {
    next(error);
  }
}

export async function clearRaisedHands(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const instructorId = getUserId(req);

    await participantService.clearRaisedHands(sessionId, instructorId);

    broadcastToSessionId(sessionId, {
      type: 'hands:cleared',
      data: { timestamp: new Date().toISOString() },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function getSessionRecoveryState(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.sessionId || req.params.id;
    const userId = getUserId(req);

    const session = await sessionService.getSessionById(sessionId);
    const isInstructor = session.instructorId === userId;
    const participant = await prisma.classroomParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
      include: {
        responses: {
          select: { interactionId: true, response: true, submittedAt: true },
        },
      },
    });
    if (!isInstructor && !participant) {
      throw new AppError(403, 'Not authorized to recover this session');
    }

    const submittedInteractions: Record<string, { response: unknown; submittedAt: string }> = {};
    for (const r of participant?.responses ?? []) {
      submittedInteractions[r.interactionId] = {
        response: r.response,
        submittedAt: r.submittedAt.toISOString(),
      };
    }

    const settings = (session.settings as Record<string, unknown>) ?? {};
    const pollSync = await pollService.getActivePollSync(
      sessionId,
      userId,
      session.instructorId === userId ? 'instructor' : 'student',
    );

    res.json({
      currentSlideId: session.currentSlideId ?? null,
      activeInteractionId: session.activeInteractionId ?? null,
      settings,
      navigation: (settings.navigation as string) ?? 'locked',
      submittedInteractions,
      status: session.status,
      activePoll: pollSync.activePoll,
      remainingSeconds: pollSync.remainingSeconds,
      serverTime: pollSync.serverTime,
    });
  } catch (error) {
    next(error);
  }
}

// Response endpoints
export async function submitResponse(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId, interactionId } = req.params;
    const userId = getUserId(req);
    const { response, timeSpent } = req.body;

    // Look up participant first
    const participant = await prisma.classroomParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (!participant) {
      throw new AppError(404, 'You are not a participant of this session. Join the session first.');
    }

    const responseRecord = await responseService.submitResponse(
      sessionId,
      interactionId,
      participant.id,
      response,
      timeSpent,
    );

    const interaction = await prisma.interaction.findUnique({
      where: { id: interactionId },
      select: { settings: true },
    });
    const anonymous = Boolean((interaction?.settings as Record<string, unknown> | null)?.anonymous);

    const participantUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, avatar: true },
    });

    // IMMEDIATELY broadcast analytics update - REAL-TIME NO POLLING
    const showResults = (interaction?.settings as Record<string, unknown> | null)?.showResults !== false;
    const summary = await responseService.getResponseSummary(sessionId, interactionId);
    broadcastToSessionId(sessionId, {
      type: 'analytics:update',
      data: {
        interactionId,
        summary,
        timestamp: new Date().toISOString(),
      },
    }, 'instructor');
    broadcastToSessionId(sessionId, {
      type: 'poll:results',
      data: {
        interactionId,
        summary: toPublicPollSummary(summary as any, showResults),
        timestamp: new Date().toISOString(),
      },
    }, 'student');

    broadcastToSessionId(sessionId, {
      type: 'participant:response',
      data: {
        userId: anonymous ? undefined : userId,
        anonymousId: anonymous ? `anon-${participant.id.slice(-6)}` : undefined,
        interactionId,
        response: anonymous ? undefined : response,
        firstName: anonymous ? 'Anonymous' : (participantUser?.firstName ?? 'Student'),
        lastName: anonymous ? '' : (participantUser?.lastName ?? ''),
        submittedAt: new Date().toISOString(),
      },
    }, 'instructor');
    broadcastToSessionId(sessionId, {
      type: 'poll:answer',
      data: {
        interactionId,
        participantId: anonymous ? undefined : participant.id,
        timestamp: new Date().toISOString(),
      },
    });

    res.status(201).json(responseRecord);
  } catch (error) {
    next(error);
  }
}

export async function getResponses(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const { interactionId } = req.query;
    const userId = getUserId(req);
    const session = await prisma.classroomSession.findUnique({
      where: { id: sessionId },
      select: { instructorId: true },
    });
    if (!session) throw new AppError(404, 'Session not found');
    if (session.instructorId !== userId) {
      throw new AppError(403, 'Only the instructor can view raw responses');
    }

    const responses = interactionId
      ? await responseService.getResponsesByInteraction(sessionId, interactionId as string)
      : await responseService.getResponsesBySession(sessionId);

    res.json(responses);
  } catch (error) {
    next(error);
  }
}

export async function getResponseSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId, interactionId } = req.params;
    const userId = getUserId(req);
    const session = await prisma.classroomSession.findUnique({
      where: { id: sessionId },
      select: { instructorId: true },
    });
    if (!session) throw new AppError(404, 'Session not found');
    const summary = await responseService.getResponseSummary(sessionId, interactionId);
    if (session.instructorId !== userId) {
      const interaction = await prisma.interaction.findUnique({ where: { id: interactionId } });
      const settings = getPollSettings(interaction ?? { settings: {} });
      res.json(toPublicPollSummary(summary as any, settings.showResults && settings.status === 'closed'));
      return;
    }
    res.json(summary);
  } catch (error) {
    next(error);
  }
}

// QR Code endpoints
export async function generateSessionQRCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const session = await prisma.classroomSession.findUnique({ 
      where: { id: sessionId }, 
      select: { roomCode: true, presentationId: true } 
    });
    const roomCode = session?.roomCode ?? sessionId;
    const presentationId = session?.presentationId;

    const qrCode = await qrCodeService.generateSessionQRCode(sessionId, roomCode);

    res.json({ qrCode });
  } catch (error) {
    next(error);
  }
}

export async function generateSlideQRCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId, slideId } = req.params;
    const { slideOrder } = req.body;

    const qrCode = await qrCodeService.generateSlideQRCode(sessionId, slideId, slideOrder);

    res.json({ qrCode });
  } catch (error) {
    next(error);
  }
}

export async function generateInteractionQRCode(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId, interactionId } = req.params;

    const qrCode = await qrCodeService.generateInteractionQRCode(sessionId, interactionId);

    res.json({ qrCode });
  } catch (error) {
    next(error);
  }
}

// Analytics endpoints
export async function getRealTimeAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;

    const analytics = await analyticsService.getRealTimeAnalytics(sessionId);

    res.json(analytics);
  } catch (error) {
    next(error);
  }
}

export async function getSlideAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;

    const analytics = await analyticsService.getSlideAnalytics(sessionId);

    res.json(analytics);
  } catch (error) {
    next(error);
  }
}

export async function getSessionReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;

    const report = await analyticsService.generateSessionReport(sessionId);

    res.json(report);
  } catch (error) {
    next(error);
  }
}

export async function exportSessionReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const { format } = req.query as { format: 'pdf' | 'excel' | 'json' };

    const buffer = await analyticsService.exportSessionReport(sessionId, format);

    const contentType = format === 'pdf' ? 'application/pdf' : 
                        format === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 
                        'application/json';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="session-report-${sessionId}.${format}"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
}

// AI Recommendation endpoints
export async function analyzeSlideContent(req: Request, res: Response, next: NextFunction) {
  try {
    const { slideId } = req.params;
    const { content } = req.body;

    const analysis = await aiRecommendationService.analyzeSlideContent(slideId, content);

    res.json(analysis);
  } catch (error) {
    next(error);
  }
}

export async function getTeachingInsights(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;

    const insights = await aiRecommendationService.generateTeachingInsights(sessionId);

    res.json(insights);
  } catch (error) {
    next(error);
  }
}

// Import endpoints
export async function importPresentation(req: Request, res: Response, next: NextFunction) {
  try {
    const instructorId = getUserId(req);
    const { title, description, sourceType, sourceUrl, options } = req.body;
    const file = req.file;
    console.info('[Classroom import] Upload received', { sourceType, title, fileName: file?.originalname, bytes: file?.size });

    if (sourceType === 'powerpoint') {
      if (!file) {
        return res.status(400).json({
          success: false,
          stage: 'validation',
          error: 'A .pptx file is required for PowerPoint import',
        });
      }
      if (!file.buffer || file.buffer.length < 4 || !/\.pptx$/i.test(file.originalname || '') || !file.buffer.subarray(0, 2).equals(Buffer.from('PK'))) {
        return res.status(400).json({
          success: false,
          stage: 'validation',
          error: 'Upload a valid .pptx PowerPoint Open XML file',
        });
      }
      console.info('[Classroom import] ZIP validated', { fileName: file.originalname });
    }

    const streamProgress = sourceType === 'powerpoint' && Boolean(file);
    let streaming = false;
    const writeLine = (payload: Record<string, unknown>) => {
      if (!streaming) {
        res.status(200);
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Accel-Buffering', 'no');
        streaming = true;
      }
      res.write(`${JSON.stringify(payload)}\n`);
      (res as any).flush?.();
    };

    const result = await presentationImportService.importPresentation({
      instructorId,
      title,
      description,
      sourceType,
      sourceUrl,
      file: file?.buffer,
      options,
      onProgress: streamProgress
        ? async (event) => {
            writeLine({ type: 'progress', ...event });
          }
        : undefined,
    });

    console.info('[Classroom import] Returning success response', {
      presentationId: result.presentationId,
      overallStatus: result.overallStatus,
      renderedCount: result.renderedCount,
    });
    if (streamProgress) {
      writeLine({ type: 'result', success: true, ...result });
      res.end();
      return;
    }
    return res.status(201).json({ success: true, ...result });
  } catch (error: any) {
    console.error('[Classroom import] Request failed', error);
    const statusCode = error.statusCode || error.status || 500;
    const details = error.details || {};
    const payload = {
      success: false,
      stage: details.stage || error.stage || 'server',
      error: details.code
        ? {
            code: details.code,
            message: error.message || 'Failed to import presentation',
            stage: details.stage,
            retryable: details.retryable ?? false,
            presentationId: details.presentationId,
            slidesSucceeded: details.slidesSucceeded,
            slidesFailed: details.slidesFailed,
            failedSlideNumbers: details.failedSlideNumbers,
            sourceKey: details.sourceKey,
            method: details.method,
          }
        : error.message || 'Failed to import presentation',
      slideNumber: error.slideNumber,
      presentationId: details.presentationId,
    };
    if (res.headersSent) {
      res.write(`${JSON.stringify({ type: 'result', ...payload })}\n`);
      res.end();
      return;
    }
    return res.status(statusCode).json(payload);
  }
}

export async function syncPresentation(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const instructorId = getUserId(req);

    const result = await presentationImportService.updatePresentationFromSource(id, instructorId);

    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getImportSources(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const { sourceType } = req.params;

    const sources = await presentationImportService.getImportSources(userId, sourceType as any);

    res.json(sources);
  } catch (error) {
    next(error);
  }
}

export async function importPublicGoogleSlides(req: Request, res: Response, next: NextFunction) {
  try {
    const instructorId = getUserId(req);
    const { url, title, description } = req.body;

    const result = await googleSlidesPublicService.importPublicGoogleSlides({
      instructorId,
      url,
      title,
      description,
    });

    if (!result.success && result.requiresAuthentication) {
      return res.status(200).json(result);
    }

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

// Secure token join endpoint
export async function joinSessionByToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.params;
    const userId = getUserId(req);

    // Validate the token
    const tokenPayload = sessionTokenService.validateSessionJoinToken(token);

    // Get the session to verify it exists and is accessible
    const session = await prisma.classroomSession.findUnique({
      where: { id: tokenPayload.sessionId },
      include: {
        presentation: true,
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    });

    if (!session) {
      throw new AppError(404, 'Session not found');
    }

    // Check if session is still joinable
    if (session.status === 'ended' || session.status === 'cancelled') {
      throw new AppError(400, 'This session has ended');
    }

    // Check if user is already a participant
    const existingParticipant = await prisma.classroomParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId: userId,
        },
      },
    });

    if (existingParticipant) {
      // User already joined, return session info
      return res.json({
        session: {
          id: session.id,
          title: session.title,
          roomCode: session.roomCode,
          status: session.status,
          instructorStarted: session.status === 'active',
        },
        presentation: session.presentation,
        instructor: session.instructor,
        alreadyJoined: true,
      });
    }

    // Join the session
    const participant = await participantService.joinSession(session.id, userId);

    res.json({
      session: {
        id: session.id,
        title: session.title,
        roomCode: session.roomCode,
        status: session.status,
        instructorStarted: session.status === 'active',
      },
      presentation: session.presentation,
      instructor: session.instructor,
      alreadyJoined: false,
      participant,
    });
  } catch (error) {
    next(error);
  }
}


// ============================================================================
// LIVE SESSION — Quick Create & Launch Interaction
// Creates an interaction on the current slide and immediately activates it.
// Powers the "Add Interaction" panel in the live instructor session view.
// ============================================================================

export async function quickCreateAndLaunchInteraction(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.sessionId || req.params.id;
    const instructorId = getUserId(req);
    const { type, settings, duration, points } = req.body;

    // 1. Get the session to find the current slide
    const session = await prisma.classroomSession.findUnique({
      where: { id: sessionId },
      select: { id: true, instructorId: true, currentSlideId: true, presentationId: true },
    });
    if (!session) throw new AppError(404, 'Session not found');
    if (session.instructorId !== instructorId) throw new AppError(403, 'Only the instructor can add interactions');
    if (!session.currentSlideId) throw new AppError(400, 'No slide is currently active');

    // 2. Validate the slide belongs to this session's presentation
    const slide = await prisma.slide.findFirst({
      where: { id: session.currentSlideId, presentationId: session.presentationId },
    });
    if (!slide) throw new AppError(400, 'Current slide does not belong to this session');

    // 3. Create minimal interaction - ONLY slideId + type + settings
    // NO question, NO options - slide content is source of truth
    const defaultSettings = enrichInteractionSettings(slide, type, {
      showResults: true,
      anonymous: false,
      ...settings,
    });
    if (type === 'rating' && !defaultSettings.maxRating) defaultSettings.maxRating = 5;

    const interaction = await prisma.interaction.create({
      data: {
        slideId: session.currentSlideId,
        type,
        settings: defaultSettings as any,
        duration: duration ?? null,
        points: points ?? 0,
        order: 999,
      },
    });

    // 4. Activate it on the session
    await prisma.classroomSession.update({
      where: { id: sessionId },
      data: { activeInteractionId: interaction.id },
    });
    updateSessionRuntimeState(sessionId, { activeInteractionId: interaction.id });

    // 5. Broadcast - interaction references slide, slide content is extracted client-side
    broadcastToSessionId(sessionId, {
      type: 'interaction:activate',
      data: {
        interactionId: interaction.id,
        interaction: {
          id: interaction.id,
          type: interaction.type,
          settings: defaultSettings,
          duration: interaction.duration,
          points: interaction.points,
          slideId: session.currentSlideId,
        },
        slideId: session.currentSlideId,
        timestamp: new Date().toISOString(),
      },
    });

    const summary = await responseService.getResponseSummary(sessionId, interaction.id);
    broadcastToSessionId(sessionId, {
      type: 'analytics:update',
      data: { interactionId: interaction.id, summary, timestamp: new Date().toISOString() },
    });

    res.status(201).json({ interaction: { ...interaction, settings: defaultSettings }, sessionId, activated: true });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// LIVE SESSION — Reopen Interaction
// Clears all existing responses for an interaction so students can re-vote.
// ============================================================================

export async function reopenInteraction(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.sessionId || req.params.id;
    const { interactionId } = req.params;
    const instructorId = getUserId(req);

    const session = await prisma.classroomSession.findUnique({
      where: { id: sessionId },
      select: { id: true, instructorId: true },
    });
    if (!session) throw new AppError(404, 'Session not found');
    if (session.instructorId !== instructorId) throw new AppError(403, 'Only the instructor can reopen interactions');

    // Delete all existing responses for this interaction in this session
    await prisma.interactionResponse.deleteMany({
      where: { sessionId, interactionId },
    });

    // Re-activate the interaction
    await prisma.classroomSession.update({
      where: { id: sessionId },
      data: { activeInteractionId: interactionId },
    });
    updateSessionRuntimeState(sessionId, { activeInteractionId: interactionId });

    // Broadcast reopen event — students clear their submission state
    broadcastToSessionId(sessionId, {
      type: 'interaction:reopen',
      data: {
        interactionId,
        timestamp: new Date().toISOString(),
      },
    });

    // Send empty analytics immediately so instructor dashboard resets
    broadcastToSessionId(sessionId, {
      type: 'analytics:update',
      data: {
        interactionId,
        summary: {
          totalResponses: 0,
          correctResponses: 0,
          incorrectResponses: 0,
          averageDuration: 0,
          responseRate: 0,
          optionCounts: {},
          respondents: {},
        },
        timestamp: new Date().toISOString(),
      },
    });

    res.json({ success: true, interactionId, responsesCleared: true });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// STUDENT CLASSROOM — Questions API
// ============================================================================

export async function submitStudentQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const { sessionId } = req.params;
    const { text } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new AppError(400, 'Question text is required');
    }

    const participant = await prisma.classroomParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (!participant) {
      throw new AppError(403, 'You are not a participant of this session');
    }

    const question = await prisma.studentQuestion.create({
      data: { sessionId, userId, text: text.trim() },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
    });

    broadcastToSessionId(sessionId, { type: 'question:new', data: question });

    res.status(201).json(question);
  } catch (error) {
    next(error);
  }
}

export async function getStudentQuestions(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const { sessionId } = req.params;

    const session = await prisma.classroomSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new AppError(404, 'Session not found');

    if (session.instructorId !== userId) {
      const participant = await prisma.classroomParticipant.findUnique({
        where: { sessionId_userId: { sessionId, userId } },
      });
      if (!participant) throw new AppError(403, 'Access denied');
    }

    const questions = await prisma.studentQuestion.findMany({
      where: { sessionId },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'asc' }],
    });

    res.json(questions);
  } catch (error) {
    next(error);
  }
}

export async function updateStudentQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const { sessionId, questionId } = req.params;
    const { isResolved, isPinned } = req.body;

    const session = await prisma.classroomSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new AppError(404, 'Session not found');
    if (session.instructorId !== userId) throw new AppError(403, 'Only the instructor can update questions');

    const updated = await prisma.studentQuestion.update({
      where: { id: questionId },
      data: { isResolved, isPinned },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
    });

    broadcastToSessionId(sessionId, { type: 'question:updated', data: updated });

    res.json(updated);
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// STUDENT CLASSROOM — Chat History API
// ============================================================================

export async function getChatMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = getUserId(req);
    const { sessionId } = req.params;

    const session = await prisma.classroomSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new AppError(404, 'Session not found');

    if (session.instructorId !== userId) {
      const participant = await prisma.classroomParticipant.findUnique({
        where: { sessionId_userId: { sessionId, userId } },
      });
      if (!participant) throw new AppError(403, 'Access denied');
    }

    const messages = await prisma.studentChatMessage.findMany({
      where: { sessionId },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    res.json(messages);
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// AUTOMATED SLIDE INTERACTION PARSER & REVEAL & EXPORT API
// ============================================================================

export async function detectSlideInteraction(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params; // slideId
    const slide = await slideService.getSlideById(id);
    if (!slide) throw new AppError(404, 'Slide not found');

    const analysis = parseSlideInteraction({
      title: slide.title,
      content: slide.content,
      notes: slide.notes ?? undefined,
    });

    res.json(analysis);
  } catch (error) {
    next(error);
  }
}

export async function launchAutoInteraction(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.sessionId || req.params.id;
    const instructorId = getUserId(req);
    const { slideId, type } = req.body;

    const session = await prisma.classroomSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new AppError(404, 'Session not found');
    if (session.instructorId !== instructorId) throw new AppError(403, 'Only the instructor can launch interactions');

    const targetSlideId = slideId || session.currentSlideId;
    if (!targetSlideId) throw new AppError(400, 'Slide ID is required');

    const { interaction, analysis } = await interactionService.autoLaunchSlideInteraction(targetSlideId, type);

    // Update active interaction on session
    await prisma.classroomSession.update({
      where: { id: sessionId },
      data: {
        activeInteractionId: interaction.id,
        currentSlideId: targetSlideId,
      },
    });

    updateSessionRuntimeState(sessionId, {
      activeInteractionId: interaction.id,
      currentSlideId: targetSlideId,
    });

    broadcastToSessionId(sessionId, {
      type: 'interaction:started',
      data: {
        sessionId,
        slideId: targetSlideId,
        interaction,
        analysis,
        timestamp: new Date().toISOString(),
      },
    });

    res.json({ success: true, interaction, analysis });
  } catch (error) {
    next(error);
  }
}

export async function revealInteractionAnswer(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.sessionId || req.params.id;
    const instructorId = getUserId(req);
    const { interactionId } = req.body;

    const session = await prisma.classroomSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new AppError(404, 'Session not found');
    if (session.instructorId !== instructorId) throw new AppError(403, 'Only the instructor can reveal answers');

    const targetInteractionId = interactionId || session.activeInteractionId;
    if (!targetInteractionId) throw new AppError(400, 'Interaction ID is required');

    const interaction = await prisma.interaction.findUnique({
      where: { id: targetInteractionId },
    });
    if (!interaction) throw new AppError(404, 'Interaction not found');

    const settings = (interaction.settings as any) || {};

    broadcastToSessionId(sessionId, {
      type: 'interaction:reveal',
      data: {
        interactionId: targetInteractionId,
        correctAnswer: settings.correctAnswer,
        correctAnswerIndex: settings.correctAnswerIndex,
        options: interaction.options,
        timestamp: new Date().toISOString(),
      },
    });

    res.json({
      success: true,
      interactionId: targetInteractionId,
      correctAnswer: settings.correctAnswer,
      correctAnswerIndex: settings.correctAnswerIndex,
    });
  } catch (error) {
    next(error);
  }
}

export async function exportSessionCsv(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const instructorId = getUserId(req);
    const session = await prisma.classroomSession.findUnique({
      where: { id },
      select: { instructorId: true },
    });
    if (!session) throw new AppError(404, 'Session not found');
    if (session.instructorId !== instructorId) {
      throw new AppError(403, 'Only the instructor can export this session');
    }
    const csvData = await analyticsService.exportSessionCSV(id);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="classroom_session_${id}.csv"`);
    res.status(200).send(csvData);
  } catch (error) {
    next(error);
  }
}

export async function exportSessionPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const instructorId = getUserId(req);
    const session = await prisma.classroomSession.findUnique({
      where: { id },
      select: { instructorId: true },
    });
    if (!session) throw new AppError(404, 'Session not found');
    if (session.instructorId !== instructorId) {
      throw new AppError(403, 'Only the instructor can export this session');
    }
    const pdfBuffer = await analyticsService.generateDetailedSessionPDF(id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="classroom_session_${id}.pdf"`);
    res.status(200).send(pdfBuffer);
  } catch (error) {
    next(error);
  }
}

export async function createSessionPoll(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.sessionId || req.params.id;
    const instructorId = getUserId(req);
    const launch = Boolean(req.body?.launch);
    const result = await pollService.createAndMaybeLaunch(sessionId, instructorId, {
      ...req.body,
      launch,
    });
    res.status(launch ? 201 : 201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listSessionPolls(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.sessionId || req.params.id;
    const instructorId = getUserId(req);
    const polls = await pollService.listSessionPolls(sessionId, instructorId);
    res.json(polls);
  } catch (error) {
    next(error);
  }
}

export async function getSessionPoll(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.sessionId || req.params.id;
    const { pollId } = req.params;
    const instructorId = getUserId(req);
    const poll = await pollService.getPollForInstructor(sessionId, instructorId, pollId);
    res.json(poll);
  } catch (error) {
    next(error);
  }
}

export async function updateSessionPoll(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.sessionId || req.params.id;
    const { pollId } = req.params;
    const instructorId = getUserId(req);
    const poll = await pollService.updatePollDraft(sessionId, instructorId, pollId, req.body);
    res.json(poll);
  } catch (error) {
    next(error);
  }
}

export async function launchSessionPoll(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.sessionId || req.params.id;
    const { pollId } = req.params;
    const instructorId = getUserId(req);
    const result = await pollService.launchPoll(sessionId, instructorId, pollId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function closeSessionPoll(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.sessionId || req.params.id;
    const { pollId } = req.params;
    const instructorId = getUserId(req);
    const result = await pollService.closePoll(sessionId, instructorId, pollId, { asInstructor: true, reason: 'instructor' });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function duplicateSessionPoll(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.sessionId || req.params.id;
    const { pollId } = req.params;
    const instructorId = getUserId(req);
    const poll = await pollService.duplicatePoll(sessionId, instructorId, pollId);
    res.status(201).json(poll);
  } catch (error) {
    next(error);
  }
}

export async function deleteSessionPoll(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.sessionId || req.params.id;
    const { pollId } = req.params;
    const instructorId = getUserId(req);
    const result = await pollService.deletePoll(sessionId, instructorId, pollId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}


