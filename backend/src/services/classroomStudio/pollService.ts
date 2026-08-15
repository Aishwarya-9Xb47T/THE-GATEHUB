/**
 * Live Classroom polls — persist on existing Interaction / InteractionResponse models.
 * Server is authoritative for launch, close, timer, and response aggregation.
 */

import { prisma } from '../../utils/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import {
  validatePollDraft,
  getPollSettings,
  parsePollOptions,
  sanitizePollForStudent,
  remainingSeconds,
  isTimerExpired,
  toPublicPollSummary,
  type PollDraftInput,
  type LivePollSettings,
} from './pollUtils.js';
import * as responseService from './responseService.js';

type Broadcaster = (sessionId: string, message: unknown, role?: 'instructor' | 'student') => void;
type RuntimeUpdater = (sessionId: string, patch: { activeInteractionId?: string | null }) => void;

let broadcaster: Broadcaster = () => {};
let runtimeUpdater: RuntimeUpdater = () => {};
const closeTimers = new Map<string, NodeJS.Timeout>();

export function setPollBroadcaster(fn: Broadcaster) {
  broadcaster = fn;
}

export function setPollRuntimeUpdater(fn: RuntimeUpdater) {
  runtimeUpdater = fn;
}

function timerKey(sessionId: string, interactionId: string) {
  return `${sessionId}:${interactionId}`;
}

function clearPollTimer(sessionId: string, interactionId?: string) {
  if (interactionId) {
    const key = timerKey(sessionId, interactionId);
    const handle = closeTimers.get(key);
    if (handle) clearTimeout(handle);
    closeTimers.delete(key);
    return;
  }
  for (const [key, handle] of closeTimers) {
    if (key.startsWith(`${sessionId}:`)) {
      clearTimeout(handle);
      closeTimers.delete(key);
    }
  }
}

async function requireInstructorSession(sessionId: string, instructorId: string) {
  const session = await prisma.classroomSession.findUnique({
    where: { id: sessionId },
    include: {
      presentation: {
        select: { id: true, title: true, instructorId: true, courseId: true },
      },
    },
  });
  if (!session) throw new AppError(404, 'Session not found');
  if (session.instructorId !== instructorId) {
    throw new AppError(403, 'Only the instructor can manage polls');
  }
  if (session.status === 'completed' || session.status === 'cancelled') {
    throw new AppError(400, 'This session has ended');
  }
  return session;
}

async function requirePollOnSession(sessionId: string, pollId: string) {
  const session = await prisma.classroomSession.findUnique({
    where: { id: sessionId },
    select: { id: true, presentationId: true, instructorId: true, currentSlideId: true, status: true },
  });
  if (!session) throw new AppError(404, 'Session not found');
  const interaction = await prisma.interaction.findUnique({ where: { id: pollId } });
  if (!interaction) throw new AppError(404, 'Poll not found');
  const slide = await prisma.slide.findFirst({
    where: { id: interaction.slideId, presentationId: session.presentationId },
  });
  if (!slide) throw new AppError(400, 'Poll does not belong to this session');
  return { session, interaction, slide };
}

function mergeSettings(existing: unknown, patch: Partial<LivePollSettings>): LivePollSettings {
  const current = getPollSettings({ settings: existing });
  return { ...current, ...patch, livePoll: true };
}

export async function createPoll(
  sessionId: string,
  instructorId: string,
  input: PollDraftInput,
) {
  const session = await requireInstructorSession(sessionId, instructorId);
  const { errors, normalized } = validatePollDraft(input);
  if (errors.length > 0 || !normalized) {
    throw new AppError(400, errors[0] || 'Invalid poll');
  }
  const slideId = session.currentSlideId;
  if (!slideId) throw new AppError(400, 'Select a slide before creating a poll');
  const slide = await prisma.slide.findFirst({
    where: { id: slideId, presentationId: session.presentationId },
  });
  if (!slide) throw new AppError(400, 'Current slide does not belong to this session');

  const maxOrder = await prisma.interaction.findFirst({
    where: { slideId },
    orderBy: { order: 'desc' },
    select: { order: true },
  });

  return prisma.interaction.create({
    data: {
      slideId,
      type: normalized.interactionType,
      title: normalized.title,
      question: normalized.question,
      options: normalized.options as any,
      settings: normalized.settings as any,
      duration: normalized.duration,
      points: 0,
      order: (maxOrder?.order ?? 0) + 1,
    },
  });
}

export async function updatePollDraft(
  sessionId: string,
  instructorId: string,
  pollId: string,
  input: PollDraftInput,
) {
  await requireInstructorSession(sessionId, instructorId);
  const { interaction } = await requirePollOnSession(sessionId, pollId);
  const settings = getPollSettings(interaction);
  const { errors, normalized } = validatePollDraft(input);
  if (errors.length > 0 || !normalized) {
    throw new AppError(400, errors[0] || 'Invalid poll');
  }

  if (settings.status === 'active' || settings.status === 'closed') {
    return createVersionFrom(interaction.slideId, normalized);
  }

  return prisma.interaction.update({
    where: { id: pollId },
    data: {
      type: normalized.interactionType,
      title: normalized.title,
      question: normalized.question,
      options: normalized.options as any,
      settings: { ...normalized.settings, status: 'draft' } as any,
      duration: normalized.duration,
    },
  });
}

async function createVersionFrom(slideId: string, normalized: NonNullable<ReturnType<typeof validatePollDraft>['normalized']>) {
  const maxOrder = await prisma.interaction.findFirst({
    where: { slideId },
    orderBy: { order: 'desc' },
    select: { order: true },
  });
  return prisma.interaction.create({
    data: {
      slideId,
      type: normalized.interactionType,
      title: normalized.title,
      question: normalized.question,
      options: normalized.options as any,
      settings: { ...normalized.settings, status: 'draft', launchedAt: undefined, closedAt: undefined, timerEndsAt: null } as any,
      duration: normalized.duration,
      points: 0,
      order: (maxOrder?.order ?? 0) + 1,
    },
  });
}

export async function duplicatePoll(sessionId: string, instructorId: string, pollId: string) {
  await requireInstructorSession(sessionId, instructorId);
  const { interaction } = await requirePollOnSession(sessionId, pollId);
  const settings = getPollSettings(interaction);
  const maxOrder = await prisma.interaction.findFirst({
    where: { slideId: interaction.slideId },
    orderBy: { order: 'desc' },
    select: { order: true },
  });
  return prisma.interaction.create({
    data: {
      slideId: interaction.slideId,
      type: interaction.type,
      title: interaction.title ? `${interaction.title} (copy)` : interaction.title,
      question: interaction.question,
      options: interaction.options as any,
      settings: {
        ...settings,
        status: 'draft',
        launchedAt: undefined,
        closedAt: undefined,
        timerEndsAt: null,
      } as any,
      duration: interaction.duration,
      points: interaction.points,
      order: (maxOrder?.order ?? 0) + 1,
    },
  });
}

export async function deletePoll(sessionId: string, instructorId: string, pollId: string) {
  await requireInstructorSession(sessionId, instructorId);
  const { session, interaction } = await requirePollOnSession(sessionId, pollId);
  const responseCount = await prisma.interactionResponse.count({
    where: { interactionId: pollId, sessionId },
  });
  if (session.activeInteractionId === pollId) {
    throw new AppError(400, 'Close the active poll before deleting it.');
  }
  if (responseCount > 0) {
    const settings = mergeSettings(interaction.settings, { status: 'archived' });
    await prisma.interaction.update({
      where: { id: pollId },
      data: { settings: settings as any },
    });
    return { archived: true, id: pollId };
  }
  await prisma.interaction.delete({ where: { id: pollId } });
  return { deleted: true, id: pollId };
}

export async function listSessionPolls(sessionId: string, instructorId: string) {
  const session = await requireInstructorSession(sessionId, instructorId);
  const slides = await prisma.slide.findMany({
    where: { presentationId: session.presentationId },
    include: { interactions: { orderBy: { createdAt: 'desc' } } },
    orderBy: { order: 'asc' },
  });
  const polls = slides.flatMap((slide) =>
    slide.interactions
      .filter((interaction) => {
        const settings = getPollSettings(interaction);
        return settings.livePoll && settings.status !== 'archived';
      })
      .map((interaction) => ({ interaction, slide })),
  );

  const results = await Promise.all(
    polls.map(async ({ interaction, slide }) => {
      const settings = getPollSettings(interaction);
      const responseCount = await prisma.interactionResponse.count({
        where: { sessionId, interactionId: interaction.id },
      });
      return {
        id: interaction.id,
        question: interaction.question || interaction.title || slide.title,
        type: interaction.type,
        pollKind: settings.pollKind,
        status: session.activeInteractionId === interaction.id ? 'active' : settings.status,
        responseCount,
        createdAt: interaction.createdAt,
        launchedAt: settings.launchedAt,
        closedAt: settings.closedAt,
        slideId: slide.id,
        options: parsePollOptions(interaction.options),
        settings,
      };
    }),
  );

  return results.sort((a, b) => {
    const aTime = new Date(a.launchedAt || a.createdAt).getTime();
    const bTime = new Date(b.launchedAt || b.createdAt).getTime();
    return bTime - aTime;
  });
}

export async function getPollForInstructor(sessionId: string, instructorId: string, pollId: string) {
  await requireInstructorSession(sessionId, instructorId);
  const { interaction } = await requirePollOnSession(sessionId, pollId);
  return {
    ...interaction,
    options: parsePollOptions(interaction.options),
    settings: getPollSettings(interaction),
  };
}

export async function launchPoll(
  sessionId: string,
  instructorId: string,
  pollId: string,
) {
  const session = await requireInstructorSession(sessionId, instructorId);
  const { interaction } = await requirePollOnSession(sessionId, pollId);
  const settings = getPollSettings(interaction);
  if (settings.status === 'archived') {
    throw new AppError(400, 'This poll was deleted.');
  }
  if (settings.status === 'closed') {
    throw new AppError(400, 'Create a new version or duplicate this poll before launching it again.');
  }

  const now = new Date();
  const timerEndsAt =
    settings.timerEnabled && settings.durationSeconds
      ? new Date(now.getTime() + settings.durationSeconds * 1000).toISOString()
      : null;
  const nextSettings = mergeSettings(interaction.settings, {
    status: 'active',
    launchedAt: now.toISOString(),
    closedAt: undefined,
    timerEndsAt,
  });

  const launched = await prisma.interaction.update({
    where: { id: pollId },
    data: {
      settings: nextSettings as any,
      duration: settings.durationSeconds,
    },
  });

  if (session.activeInteractionId && session.activeInteractionId !== pollId) {
    await markClosedIfActive(sessionId, session.activeInteractionId, now);
  }

  await prisma.classroomSession.update({
    where: { id: sessionId },
    data: { activeInteractionId: pollId },
  });
  runtimeUpdater(sessionId, { activeInteractionId: pollId });

  schedulePollClose(sessionId, pollId, timerEndsAt);

  const studentPoll = sanitizePollForStudent(launched);
  const summary = await responseService.getResponseSummary(sessionId, pollId);
  const payload = {
    interactionId: pollId,
    interaction: studentPoll,
    slideId: launched.slideId,
    remainingSeconds: remainingSeconds(timerEndsAt),
    serverTime: now.toISOString(),
    timestamp: now.toISOString(),
  };
  broadcaster(sessionId, { type: 'interaction:activate', data: payload });
  broadcaster(sessionId, { type: 'poll:launch', data: payload });
  broadcaster(sessionId, { type: 'analytics:update', data: { interactionId: pollId, summary, timestamp: now.toISOString() } }, 'instructor');
  broadcaster(sessionId, { type: 'poll:results', data: { interactionId: pollId, summary: toPublicPollSummary(summary as any, nextSettings.showResults), timestamp: now.toISOString() } }, 'student');
  if (timerEndsAt) {
    broadcaster(sessionId, {
      type: 'poll:timer',
      data: { interactionId: pollId, remainingSeconds: remainingSeconds(timerEndsAt), timerEndsAt, serverTime: now.toISOString() },
    });
  }

  return { interaction: launched, summary, remainingSeconds: remainingSeconds(timerEndsAt) };
}

async function markClosedIfActive(sessionId: string, interactionId: string, now: Date) {
  const previous = await prisma.interaction.findUnique({ where: { id: interactionId } });
  if (!previous) return;
  const settings = getPollSettings(previous);
  if (settings.status !== 'active') return;
  await prisma.interaction.update({
    where: { id: interactionId },
    data: {
      settings: mergeSettings(previous.settings, { status: 'closed', closedAt: now.toISOString() }) as any,
    },
  });
  clearPollTimer(sessionId, interactionId);
}

export async function closePoll(
  sessionId: string,
  actorId: string,
  pollId: string,
  opts?: { asInstructor?: boolean; reason?: 'instructor' | 'timer' },
) {
  const { session, interaction } = await requirePollOnSession(sessionId, pollId);
  if (opts?.asInstructor !== false && opts?.reason !== 'timer') {
    if (session.instructorId !== actorId) {
      throw new AppError(403, 'Only the instructor can close this poll');
    }
  }
  const settings = getPollSettings(interaction);
  if (settings.status === 'closed') {
    const summary = await responseService.getResponseSummary(sessionId, pollId);
    return { interaction, summary, alreadyClosed: true };
  }

  const now = new Date();
  const closed = await prisma.interaction.update({
    where: { id: pollId },
    data: {
      settings: mergeSettings(interaction.settings, {
        status: 'closed',
        closedAt: now.toISOString(),
      }) as any,
    },
  });

  if (session.activeInteractionId === pollId) {
    await prisma.classroomSession.update({
      where: { id: sessionId },
      data: { activeInteractionId: null },
    });
    runtimeUpdater(sessionId, { activeInteractionId: null });
  }
  clearPollTimer(sessionId, pollId);

  const summary = await responseService.getResponseSummary(sessionId, pollId);
  const studentPoll = sanitizePollForStudent(closed);
  const payload = {
    interactionId: pollId,
    interaction: studentPoll,
    summary,
    results: summary,
    reason: opts?.reason ?? 'instructor',
    timestamp: now.toISOString(),
  };
  broadcaster(sessionId, { type: 'interaction:close', data: { ...payload, summary: toPublicPollSummary(summary as any, settings.showResults), results: toPublicPollSummary(summary as any, settings.showResults) } }, 'student');
  broadcaster(sessionId, { type: 'poll:close', data: { ...payload, summary: toPublicPollSummary(summary as any, settings.showResults), results: toPublicPollSummary(summary as any, settings.showResults) } }, 'student');
  broadcaster(sessionId, { type: 'interaction:close', data: payload }, 'instructor');
  broadcaster(sessionId, { type: 'poll:close', data: payload }, 'instructor');
  broadcaster(sessionId, { type: 'analytics:update', data: { interactionId: pollId, summary, timestamp: now.toISOString() } }, 'instructor');

  return { interaction: closed, summary, alreadyClosed: false };
}

export function schedulePollClose(sessionId: string, pollId: string, timerEndsAt?: string | null) {
  clearPollTimer(sessionId, pollId);
  if (!timerEndsAt) return;
  const delay = new Date(timerEndsAt).getTime() - Date.now();
  if (delay <= 0) {
    void closePoll(sessionId, 'system', pollId, { reason: 'timer' }).catch((error) => {
      console.error('[Poll] Failed to auto-close expired poll', { sessionId, pollId, error });
    });
    return;
  }
  const handle = setTimeout(() => {
    void closePoll(sessionId, 'system', pollId, { reason: 'timer' }).catch((error) => {
      console.error('[Poll] Failed to auto-close poll', { sessionId, pollId, error });
    });
  }, delay);
  closeTimers.set(timerKey(sessionId, pollId), handle);
}

export async function resumePollTimer(sessionId: string, interactionId: string | null | undefined) {
  if (!interactionId) return;
  const interaction = await prisma.interaction.findUnique({ where: { id: interactionId } });
  if (!interaction) return;
  const settings = getPollSettings(interaction);
  if (settings.status !== 'active') return;
  if (settings.timerEnabled && settings.timerEndsAt) {
    if (isTimerExpired(settings.timerEndsAt)) {
      await closePoll(sessionId, 'system', interactionId, { reason: 'timer' });
      return;
    }
    schedulePollClose(sessionId, interactionId, settings.timerEndsAt);
  }
}

export async function getActivePollSync(sessionId: string, userId?: string, role?: string) {
  const session = await prisma.classroomSession.findUnique({
    where: { id: sessionId },
    select: { activeInteractionId: true, instructorId: true },
  });
  if (!session?.activeInteractionId) {
    return { activePoll: null, remainingSeconds: null, serverTime: new Date().toISOString() };
  }
  const interaction = await prisma.interaction.findUnique({
    where: { id: session.activeInteractionId },
  });
  if (!interaction) {
    return { activePoll: null, remainingSeconds: null, serverTime: new Date().toISOString() };
  }
  const settings = getPollSettings(interaction);
  if (settings.status === 'closed') {
    return { activePoll: null, remainingSeconds: null, serverTime: new Date().toISOString() };
  }
  const poll =
    role === 'instructor' || userId === session.instructorId
      ? {
          ...interaction,
          options: parsePollOptions(interaction.options),
          settings,
          timerEnabled: settings.timerEnabled,
          timerEndsAt: settings.timerEndsAt,
          status: settings.status,
        }
      : sanitizePollForStudent(interaction, { shuffleSeed: settings.shuffleOptions ? `${interaction.id}:${userId || ''}` : undefined });
  return {
    activePoll: poll,
    remainingSeconds: remainingSeconds(settings.timerEndsAt),
    timerEndsAt: settings.timerEndsAt,
    serverTime: new Date().toISOString(),
  };
}

export async function createAndMaybeLaunch(
  sessionId: string,
  instructorId: string,
  input: PollDraftInput & { launch?: boolean },
) {
  const poll = await createPoll(sessionId, instructorId, input);
  if (input.launch) {
    return launchPoll(sessionId, instructorId, poll.id);
  }
  return { interaction: poll, summary: null, remainingSeconds: null };
}
