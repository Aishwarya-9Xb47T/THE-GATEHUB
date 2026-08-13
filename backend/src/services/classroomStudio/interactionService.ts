/**
 * Interaction Service
 * Core service for managing interactive elements on slides
 */

import { prisma } from '../../utils/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { analyzeSlideContent, SlideInteractionAnalysis } from './slideParserEngine.js';
import type {
  Interaction,
  CreateInteractionInput,
  UpdateInteractionInput,
  InteractionType,
} from './types.js';

export async function createInteraction(data: CreateInteractionInput): Promise<Interaction> {
  // Verify slide exists
  const slide = await prisma.slide.findUnique({
    where: { id: data.slideId },
  });

  if (!slide) {
    throw new AppError(404, 'Slide not found');
  }

  // Parse slide to auto-fill question/options if not provided
  const analysis = analyzeSlideContent({
    title: slide.title,
    content: slide.content,
    notes: slide.notes ?? undefined,
  });

  const interactionType = data.type || analysis.interactionRecommendation || 'poll';
  const question = data.question || analysis.question;
  const options = data.options || (analysis.options.length > 0 ? analysis.options : null);

  const interaction = await prisma.interaction.create({
    data: {
      slideId: data.slideId,
      type: interactionType,
      title: data.title || slide.title,
      question,
      options: options as any,
      settings: (data.settings ?? {
        timer: 30,
        correctAnswer: analysis.correctAnswer,
        correctAnswerIndex: analysis.correctAnswerIndex,
        optionCount: analysis.optionCount,
      }) as any,
      duration: data.duration ?? 30,
      points: data.points ?? 0,
      order: data.order ?? 0,
    },
  });

  return interaction as unknown as Interaction;
}

export async function autoLaunchSlideInteraction(
  slideId: string,
  preferredType?: InteractionType
): Promise<{ interaction: Interaction; analysis: SlideInteractionAnalysis }> {
  const slide = await prisma.slide.findUnique({
    where: { id: slideId },
  });

  if (!slide) {
    throw new AppError(404, 'Slide not found');
  }

  const analysis = analyzeSlideContent({
    title: slide.title,
    content: slide.content,
    notes: slide.notes ?? undefined,
  });

  const interactionType = preferredType || analysis.interactionRecommendation || 'poll';

  // Check if an interaction already exists for this slide & type
  let interaction = await prisma.interaction.findFirst({
    where: {
      slideId,
      type: interactionType,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!interaction) {
    interaction = await prisma.interaction.create({
      data: {
        slideId,
        type: interactionType,
        title: slide.title,
        question: analysis.question,
        options: (analysis.options.length > 0 ? analysis.options : null) as any,
        settings: {
          timer: 30,
          correctAnswer: analysis.correctAnswer,
          correctAnswerIndex: analysis.correctAnswerIndex,
          optionCount: analysis.optionCount,
          maxRating: 5,
        } as any,
        duration: 30,
        points: analysis.correctAnswer ? 10 : 0,
        order: 0,
      },
    });
  }

  return { interaction: interaction as unknown as Interaction, analysis };
}

export async function getInteractionById(id: string): Promise<Interaction> {
  const interaction = await prisma.interaction.findUnique({
    where: { id },
  });

  if (!interaction) {
    throw new AppError(404, 'Interaction not found');
  }

  return interaction as unknown as Interaction;
}

export async function getInteractionsBySlide(slideId: string): Promise<Interaction[]> {
  const interactions = await prisma.interaction.findMany({
    where: { slideId },
    orderBy: { order: 'asc' },
  });

  return interactions as unknown as Interaction[];
}

export async function updateInteraction(
  id: string,
  data: UpdateInteractionInput
): Promise<Interaction> {
  const existing = await prisma.interaction.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new AppError(404, 'Interaction not found');
  }

  // Validate interaction configuration if type is being changed
  if (data.type && data.type !== existing.type) {
    validateInteractionConfig(data.type, data);
  }

  const interaction = await prisma.interaction.update({
    where: { id },
    data: {
      settings: data.settings,
      duration: data.duration,
      points: data.points,
      order: data.order,
    },
  });

  return interaction as unknown as Interaction;
}

export async function deleteInteraction(id: string): Promise<void> {
  await prisma.interaction.delete({
    where: { id },
  });
}

export async function reorderInteractions(
  slideId: string,
  interactionOrders: Array<{ id: string; order: number }>
): Promise<Interaction[]> {
  // Verify all interactions belong to the slide
  const interactions = await prisma.interaction.findMany({
    where: {
      id: { in: interactionOrders.map((i) => i.id) },
      slideId,
    },
  });

  if (interactions.length !== interactionOrders.length) {
    throw new AppError(400, 'Some interactions do not belong to this slide');
  }

  // Update orders in a transaction
  const updatedInteractions = await prisma.$transaction(
    interactionOrders.map(({ id, order }) =>
      prisma.interaction.update({
        where: { id },
        data: { order },
      })
    )
  );

  return updatedInteractions as unknown as Interaction[];
}

export async function duplicateInteraction(id: string): Promise<Interaction> {
  const original = await prisma.interaction.findUnique({
    where: { id },
  });

  if (!original) {
    throw new AppError(404, 'Interaction not found');
  }

  // Find the next available order
  const maxOrder = await prisma.interaction.findFirst({
    where: { slideId: original.slideId },
    orderBy: { order: 'desc' },
  });

  const newOrder = (maxOrder?.order ?? 0) + 1;

  const duplicated = await prisma.interaction.create({
    data: {
      slideId: original.slideId,
      type: original.type,
      settings: original.settings ?? undefined,
      duration: original.duration,
      points: original.points,
      order: newOrder,
    },
  });

  return duplicated as unknown as Interaction;
}

export async function getInteractionStats(slideId: string): Promise<{
  totalInteractions: number;
  byType: Record<InteractionType, number>;
}> {
  const interactions = await prisma.interaction.findMany({
    where: { slideId },
  });

  const stats = {
    totalInteractions: interactions.length,
    byType: {} as Record<InteractionType, number>,
  };

  for (const interaction of interactions) {
    const t = interaction.type as InteractionType;
    stats.byType[t] = (stats.byType[t] || 0) + 1;
  }

  return stats;
}

// Validation functions
function validateInteractionConfig(
  type: InteractionType,
  data: CreateInteractionInput | UpdateInteractionInput
): void {
  switch (type) {
    case 'mcq':
    case 'multiple_select':
    case 'true_false':
      // Options will be extracted from slide, not validated here
      // Only validate settings if provided
      if (data.settings && data.settings.correctAnswer !== undefined) {
        // If they manually set correct answer, validate it's reasonable
        if (type === 'true_false' && 
!['true', 'false'].includes(String(data.settings.correctAnswer).toLowerCase())
) {
          throw new AppError(400, 'True/false correct answer must be "true" or "false"');
        }
      }
      break;

    case 'poll':
    case 'word_cloud':
    case 'emoji_voting':
      // Options will be extracted from slide
      break;

    case 'rating':
      if (!data.settings || !data.settings.maxRating) {
        throw new AppError(400, 'Rating interactions require a maxRating setting');
      }
      if (data.settings.maxRating < 1 || data.settings.maxRating > 10) {
        throw new AppError(400, 'maxRating must be between 1 and 10');
      }
      break;

    case 'code_challenge':
      if (!data.settings || !data.settings.language) {
        throw new AppError(400, 'Code challenges require a language setting');
      }
      break;

    case 'open_answer':
    case 'drawing':
    case 'file_upload':
    case 'discussion':
    case 'attendance_check':
    case 'exit_ticket':
    case 'reflection':
    case 'ai_question':
      // These types don't require specific validation
      break;

    default:
      throw new AppError(400, `Unknown interaction type: ${type}`);
  }
}

export async function getInteractionResponseRate(
  interactionId: string,
  sessionId: string
): Promise<{
  totalParticipants: number;
  totalResponses: number;
  responseRate: number;
}> {
  const session = await prisma.classroomSession.findUnique({
    where: { id: sessionId },
    include: {
      _count: {
        select: { participants: true },
      },
    },
  });

  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  const totalParticipants = session._count.participants;
  const totalResponses = await prisma.interactionResponse.count({
    where: {
      interactionId,
      sessionId,
    },
  });

  const responseRate = totalParticipants > 0 ? (totalResponses / totalParticipants) * 100 : 0;

  return {
    totalParticipants,
    totalResponses,
    responseRate,
  };
}