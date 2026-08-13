/**
 * Interaction Response Service
 * Core service for managing student responses to interactions
 */

import { prisma } from '../../utils/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import type {
  InteractionResponse,
  InteractionType,
} from './types.js';

export async function submitResponse(
  sessionId: string,
  interactionId: string,
  participantId: string,
  response: any,
  duration?: number
): Promise<InteractionResponse> {
  // Verify session and interaction exist
  const session = await prisma.classroomSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  const interaction = await prisma.interaction.findUnique({
    where: { id: interactionId },
  });

  if (!interaction) {
    throw new AppError(404, 'Interaction not found');
  }

  const interactionSlide = await prisma.slide.findFirst({
    where: {
      id: interaction.slideId,
      presentationId: session.presentationId,
    },
  });

  if (!interactionSlide) {
    throw new AppError(400, 'Interaction does not belong to this session');
  }


  // Verify participant exists
  const participant = await prisma.classroomParticipant.findUnique({
    where: { id: participantId },
  });

  if (!participant) {
    throw new AppError(404, 'Participant not found');
  }

  if (participant.sessionId !== sessionId) {
    throw new AppError(403, 'Participant does not belong to this session');
  }

  // Check if participant already responded
  const existingResponse = await prisma.interactionResponse.findFirst({
    where: {
      sessionId,
      interactionId,
      participantId,
    },
  });

  if (existingResponse) {
    // For polls and quizzes, don't allow re-submission unless explicitly reopened
    // The frontend should handle this, but we enforce it here too
    if (interaction.type === 'poll' || interaction.type === 'mcq' || interaction.type === 'true_false') {
      throw new AppError(400, 'You have already submitted your response. Wait for the instructor to reopen voting.');
    }

    // For other types, allow updating
    const updated = await prisma.interactionResponse.update({
      where: { id: existingResponse.id },
      data: {
        response,
        duration,
        submittedAt: new Date(),
      },
    });

    await updateResponseStats(sessionId);
    return updated;
  }

  // Calculate correctness if applicable
  let isCorrect: boolean | undefined;
  let pointsAwarded: number | undefined;

  if (interaction.type === 'mcq' || interaction.type === 'true_false') {
    const result = calculateCorrectness(interaction, response);
    isCorrect = result.isCorrect;
    pointsAwarded = result.isCorrect ? interaction.points : 0;
  } else if (interaction.type === 'multiple_select') {
    const result = calculateMultipleSelectCorrectness(interaction, response);
    isCorrect = result.isCorrect;
    pointsAwarded = result.isCorrect ? interaction.points : 0;
  }

  // Create new response
  const newResponse = await prisma.interactionResponse.create({
    data: {
      sessionId,
      interactionId,
      participantId,
      response,
      duration,
      isCorrect,
      pointsAwarded,
    },
  });

  await updateResponseStats(sessionId);
  return newResponse;
}

export async function getResponsesBySession(sessionId: string): Promise<InteractionResponse[]> {
  const responses = await prisma.interactionResponse.findMany({
    where: { sessionId },
    include: {
      interaction: {
        select: {
          id: true,
          type: true,
          title: true,
          question: true,
        },
      },
    },
    orderBy: { submittedAt: 'asc' },
  });

  return responses;
}

export async function getResponsesByInteraction(
  sessionId: string,
  interactionId: string
): Promise<InteractionResponse[]> {
  const responses = await prisma.interactionResponse.findMany({
    where: {
      sessionId,
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
    orderBy: { submittedAt: 'asc' },
  });

  return responses;
}

export async function getResponseById(id: string): Promise<InteractionResponse> {
  const response = await prisma.interactionResponse.findUnique({
    where: { id },
    include: {
      interaction: true,
      participant: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!response) {
    throw new AppError(404, 'Response not found');
  }

  return response;
}

export async function getParticipantResponses(
  sessionId: string,
  participantId: string
): Promise<InteractionResponse[]> {
  const responses = await prisma.interactionResponse.findMany({
    where: {
      sessionId,
      participantId,
    },
    include: {
      interaction: {
        select: {
          id: true,
          type: true,
          title: true,
          question: true,
          points: true,
        },
      },
    },
    orderBy: { submittedAt: 'asc' },
  });

  return responses;
}

export async function deleteResponse(id: string): Promise<void> {
  await prisma.interactionResponse.delete({
    where: { id },
  });
}

export async function getResponseSummary(
  sessionId: string,
  interactionId: string
): Promise<{
  totalResponses: number;
  correctResponses: number;
  incorrectResponses: number;
  averageDuration: number;
  responseRate: number;
  optionCounts: Record<string, number>;
  respondents: Record<string, Array<{ userId: string; firstName: string; lastName: string; avatar?: string }>>;
}> {
  const responses = await prisma.interactionResponse.findMany({
    where: {
      sessionId,
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

  const interaction = await prisma.interaction.findUnique({
    where: { id: interactionId },
  });

  if (!interaction) {
    throw new AppError(404, 'Interaction not found');
  }

  const totalResponses = responses.length;
  const correctResponses = responses.filter((r) => r.isCorrect === true).length;
  const incorrectResponses = responses.filter((r) => r.isCorrect === false).length;

  const durations = responses
    .map((r) => r.duration)
    .filter((d): d is number => d !== null && d !== undefined);
  const averageDuration =
    durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;

  const totalParticipants = await prisma.classroomParticipant.count({
    where: { sessionId },
  });

  const responseRate = totalParticipants > 0 ? (totalResponses / totalParticipants) * 100 : 0;

  // Count option selections and track respondents
  const optionCounts: Record<string, number> = {};
  const respondents: Record<string, Array<{ userId: string; firstName: string; lastName: string; avatar?: string }>> = {};

  for (const response of responses) {
    const user = response.participant.user;
    const respondentInfo = {
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar ?? undefined,
    };

    if (Array.isArray(response.response)) {
      for (const selection of response.response) {
        const key = String(selection);
        optionCounts[key] = (optionCounts[key] || 0) + 1;
        if (!respondents[key]) respondents[key] = [];
        respondents[key].push(respondentInfo);
      }
    } else if (typeof response.response === 'string') {
      optionCounts[response.response] = (optionCounts[response.response] || 0) + 1;
      if (!respondents[response.response]) respondents[response.response] = [];
      respondents[response.response].push(respondentInfo);
    }
  }

  return {
    totalResponses,
    correctResponses,
    incorrectResponses,
    averageDuration,
    responseRate,
    optionCounts,
    respondents,
  };
}

// Helper functions

/**
 * Checks whether a single-answer response (poll/mcq/true_false) is correct.
 * Interactions store the correct answer in settings.correctAnswer (string).
 */
function calculateCorrectness(
  interaction: any,
  response: any
): { isCorrect: boolean } {
  const correctAnswer = interaction.settings?.correctAnswer;
  if (correctAnswer === undefined || correctAnswer === null) {
    return { isCorrect: false }; // No correct answer defined (e.g. pure poll)
  }
  const isCorrect =
    String(correctAnswer).toLowerCase() === String(response).toLowerCase();
  return { isCorrect };
}

/**
 * Checks whether a multiple-select response is correct.
 * Interactions store the correct answers in settings.correctAnswer (string[]).
 */
function calculateMultipleSelectCorrectness(
  interaction: any,
  response: any
): { isCorrect: boolean } {
  const correctAnswer = interaction.settings?.correctAnswer;
  if (!Array.isArray(correctAnswer)) {
    return { isCorrect: false };
  }
  if (!Array.isArray(response)) {
    return { isCorrect: false };
  }
  // Order-independent set equality
  if (response.length !== correctAnswer.length) return { isCorrect: false };
  const correctSet = new Set(correctAnswer.map((c: string) => String(c).toLowerCase()));
  return { isCorrect: response.every((r: any) => correctSet.has(String(r).toLowerCase())) };
}

async function updateResponseStats(sessionId: string): Promise<void> {
  const totalResponses = await prisma.interactionResponse.count({
    where: { sessionId },
  });

  const responses = await prisma.interactionResponse.findMany({
    where: { sessionId },
    select: { duration: true, isCorrect: true },
  });

  const durations = responses
    .map((r) => r.duration)
    .filter((d): d is number => d !== null && d !== undefined);
  const averageDuration =
    durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;

  const correctCount = responses.filter((r) => r.isCorrect === true).length;
  const accuracyRate =
    responses.length > 0 ? (correctCount / responses.length) * 100 : 0;

  await prisma.classroomSessionAnalytics.update({
    where: { sessionId },
    data: {
      totalResponses,
      averageResponseTime: averageDuration,
      accuracyRate,
    },
  });
}
