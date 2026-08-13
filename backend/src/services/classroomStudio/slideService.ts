/**
 * Slide Service
 * Core service for managing slides within presentations
 */

import { prisma } from '../../utils/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import type {
  Slide,
  CreateSlideInput,
  UpdateSlideInput,
} from './types.js';

export async function createSlide(data: CreateSlideInput): Promise<Slide> {
  const presentation = await prisma.presentation.findUnique({
    where: { id: data.presentationId },
  });

  if (!presentation) {
    throw new AppError(404, 'Presentation not found');
  }

  const existingSlide = await prisma.slide.findUnique({
    where: {
      presentationId_order: {
        presentationId: data.presentationId,
        order: data.order,
      },
    },
  });

  if (existingSlide) {
    await prisma.slide.updateMany({
      where: {
        presentationId: data.presentationId,
        order: { gte: data.order },
      },
      data: {
        order: { increment: 1 },
      },
    });
  }

  const slide = await prisma.slide.create({
    data: {
      presentationId: data.presentationId,
      order: data.order,
      title: data.title,
      content: data.content,
      notes: data.notes,
      isLocked: data.isLocked ?? false,
      isHidden: data.isHidden ?? false,
      isImportant: data.isImportant ?? false,
    },
  });

  return slide as any;
}

export async function getSlideById(id: string): Promise<Slide> {
  const slide = await prisma.slide.findUnique({
    where: { id },
    include: {
      interactions: {
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!slide) {
    throw new AppError(404, 'Slide not found');
  }

  return slide as any;
}

export async function getSlidesByPresentation(
  presentationId: string,
  includeHidden: boolean = false
): Promise<Slide[]> {
  const where: any = {
    presentationId,
  };

  if (!includeHidden) {
    where.isHidden = false;
  }

  const slides = await prisma.slide.findMany({
    where,
    include: {
      interactions: {
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { order: 'asc' },
  });

  return slides as any;
}

export async function updateSlide(
  id: string,
  data: UpdateSlideInput
): Promise<Slide> {
  const slide = await prisma.slide.update({
    where: { id },
    data: {
      title: data.title,
      content: data.content,
      notes: data.notes,
      isLocked: data.isLocked,
      isHidden: data.isHidden,
      isImportant: data.isImportant,
    },
  });

  return slide as any;
}

export async function deleteSlide(id: string): Promise<void> {
  const slide = await prisma.slide.findUnique({
    where: { id },
  });

  if (!slide) {
    throw new AppError(404, 'Slide not found');
  }

  const deletedOrder = slide.order;

  await prisma.slide.delete({
    where: { id },
  });

  await prisma.slide.updateMany({
    where: {
      presentationId: slide.presentationId,
      order: { gt: deletedOrder },
    },
    data: {
      order: { decrement: 1 },
    },
  });
}

export async function reorderSlides(
  presentationId: string,
  slideOrders: Array<{ id: string; order: number }>
): Promise<Slide[]> {
  const slides = await prisma.slide.findMany({
    where: {
      id: { in: slideOrders.map((s) => s.id) },
      presentationId,
    },
  });

  if (slides.length !== slideOrders.length) {
    throw new AppError(400, 'Some slides do not belong to this presentation');
  }

  const updatedSlides = await prisma.$transaction(
    slideOrders.map(({ id, order }) =>
      prisma.slide.update({
        where: { id },
        data: { order },
      })
    )
  );

  return updatedSlides as any;
}

export async function duplicateSlide(id: string): Promise<Slide> {
  const original = await prisma.slide.findUnique({
    where: { id },
    include: {
      interactions: true,
    },
  });

  if (!original) {
    throw new AppError(404, 'Slide not found');
  }

  const maxOrder = await prisma.slide.findFirst({
    where: { presentationId: original.presentationId },
    orderBy: { order: 'desc' },
  });

  const newOrder = (maxOrder?.order ?? 0) + 1;

  const duplicated = await prisma.slide.create({
    data: {
      presentationId: original.presentationId,
      order: newOrder,
      title: `${original.title} (Copy)`,
      content: original.content as any,
      thumbnail: original.thumbnail,
      notes: original.notes,
      isLocked: original.isLocked,
      isHidden: original.isHidden,
      isImportant: original.isImportant,
      interactions: {
        create: original.interactions.map((interaction) => ({
          type: interaction.type,
          title: interaction.title,
          question: interaction.question,
          options: interaction.options as any,
          settings: interaction.settings as any,
          duration: interaction.duration,
          points: interaction.points,
          order: interaction.order,
        })),
      },
    },
    include: {
      interactions: true,
    },
  });

  return duplicated as any;
}

export async function updateSlideThumbnail(
  id: string,
  thumbnailUrl: string
): Promise<Slide> {
  const slide = await prisma.slide.update({
    where: { id },
    data: { thumbnail: thumbnailUrl },
  });

  return slide as any;
}

export async function bulkUpdateSlideOrders(
  presentationId: string,
  slides: Array<{ id: string; order: number }>
): Promise<void> {
  await prisma.$transaction(
    slides.map(({ id, order }) =>
      prisma.slide.update({
        where: { id },
        data: { order },
      })
    )
  );
}