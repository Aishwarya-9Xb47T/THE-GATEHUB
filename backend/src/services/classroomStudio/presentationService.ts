/**
 * Presentation Service
 * Core service for managing presentations in the Interactive Classroom Studio
 */

import { prisma } from '../../utils/prisma.js';
import { AppError } from '../../middlewares/errorHandler.js';
import { rewriteClassroomAssetTree } from './classroomAssetUrls.js';
import { computeClassroomRenderProgress } from './classroomAssetPath.js';
import type {
  Presentation,
  CreatePresentationInput,
  UpdatePresentationInput,
  PresentationSourceType,
  PresentationStatus,
} from './types.js';

export async function createPresentation(
  instructorId: string,
  data: CreatePresentationInput
): Promise<Presentation> {
  const presentation = await prisma.presentation.create({
    data: {
      title: data.title,
      description: data.description,
      sourceType: data.sourceType,
      sourceUrl: data.sourceUrl,
      status: 'draft',
      instructorId,
      courseId: data.courseId,
      ...(data.sourceType === 'manual'
        ? {
            slides: {
              create: {
                order: 1,
                title: 'Untitled slide',
                content: {
                  version: 1,
                  background: '#ffffff',
                  elements: [],
                },
              },
            },
          }
        : {}),
    },
  });

  return presentation as any;
}

export async function getPresentationById(
  id: string,
  instructorId?: string
): Promise<Presentation> {
  const presentation = await prisma.presentation.findUnique({
    where: { id },
    include: {
      slides: {
        orderBy: { order: 'asc' },
        include: {
          interactions: {
            orderBy: { order: 'asc' },
          },
        },
      },
      sessions: {
        where: { status: { in: ['scheduled', 'active'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  if (!presentation) {
    throw new AppError(404, 'Presentation not found');
  }

  // Check access if instructorId is provided
  if (instructorId && presentation.instructorId !== instructorId) {
    throw new AppError(403, 'You do not have access to this presentation');
  }

  const slides = presentation.slides.map((slide) => ({
    ...slide,
    content: rewriteClassroomAssetTree(slide.content, presentation.id),
  }));
  return {
    ...presentation,
    slides,
    renderProgress: computeClassroomRenderProgress(slides),
    renderedVisuals: computeClassroomRenderProgress(slides).rendered,
  } as any;
}

export async function getPresentationsByInstructor(
  instructorId: string,
  filters?: {
    status?: PresentationStatus;
    courseId?: string;
    search?: string;
  }
): Promise<Presentation[]> {
  const where: any = {
    instructorId,
  };

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.courseId) {
    where.courseId = filters.courseId;
  }

  if (filters?.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const presentations = await prisma.presentation.findMany({
    where,
    include: {
      _count: {
        select: {
          slides: true,
          sessions: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return presentations as any;
}

export async function updatePresentation(
  id: string,
  instructorId: string,
  data: UpdatePresentationInput
): Promise<Presentation> {
  // Verify ownership
  const existing = await prisma.presentation.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new AppError(404, 'Presentation not found');
  }

  if (existing.instructorId !== instructorId) {
    throw new AppError(403, 'You do not have permission to update this presentation');
  }

  const presentation = await prisma.presentation.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description,
      thumbnail: data.thumbnail,
      status: data.status,
      courseId: data.courseId,
    },
  });

  return presentation as any;
}

export async function deletePresentation(
  id: string,
  instructorId: string
): Promise<void> {
  // Verify ownership
  const existing = await prisma.presentation.findUnique({
    where: { id },
    include: {
      sessions: {
        where: { status: 'active' },
      },
    },
  });

  if (!existing) {
    throw new AppError(404, 'Presentation not found');
  }

  if (existing.instructorId !== instructorId) {
    throw new AppError(403, 'You do not have permission to delete this presentation');
  }

  // Prevent deletion if there are active sessions
  if (existing.sessions.length > 0) {
    throw new AppError(400, 'Cannot delete presentation with active sessions');
  }

  await prisma.presentation.delete({
    where: { id },
  });
}

export async function duplicatePresentation(
  id: string,
  instructorId: string
): Promise<Presentation> {
  const original = await prisma.presentation.findUnique({
    where: { id },
    include: {
      slides: {
        include: {
          interactions: true,
        },
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!original) {
    throw new AppError(404, 'Presentation not found');
  }

  if (original.instructorId !== instructorId) {
    throw new AppError(403, 'You do not have permission to duplicate this presentation');
  }

  const duplicated = await prisma.presentation.create({
    data: {
      title: `${original.title} (Copy)`,
      description: original.description,
      sourceType: original.sourceType as any,
      sourceUrl: original.sourceUrl,
      thumbnail: original.thumbnail,
      status: 'draft',
      instructorId,
      courseId: original.courseId,
      slides: {
        create: original.slides.map((slide) => ({
          order: slide.order,
          title: slide.title,
          content: slide.content as any,
          thumbnail: slide.thumbnail,
          notes: slide.notes,
          isLocked: slide.isLocked,
          isHidden: slide.isHidden,
          isImportant: slide.isImportant,
          interactions: {
            create: slide.interactions.map((interaction) => ({
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
        })),
      },
    },
    include: {
      slides: {
        include: {
          interactions: true,
        },
        orderBy: { order: 'asc' },
      },
    },
  });

  return duplicated as any;
}

export async function updatePresentationStatus(
  id: string,
  status: PresentationStatus,
  instructorId: string
): Promise<Presentation> {
  const presentation = await prisma.presentation.findUnique({
    where: { id },
  });

  if (!presentation) {
    throw new AppError(404, 'Presentation not found');
  }

  if (presentation.instructorId !== instructorId) {
    throw new AppError(403, 'You do not have permission to update this presentation');
  }

  const updated = await prisma.presentation.update({
    where: { id },
    data: { status },
  });

  return updated as any;
}

export async function getPresentationStats(
  instructorId: string
): Promise<{
  totalPresentations: number;
  draftPresentations: number;
  readyPresentations: number;
  archivedPresentations: number;
  totalSlides: number;
  totalSessions: number;
}> {
  const presentations = await prisma.presentation.findMany({
    where: { instructorId },
    include: {
      _count: {
        select: {
          slides: true,
          sessions: true,
        },
      },
    },
  });

  const stats = {
    totalPresentations: presentations.length,
    draftPresentations: presentations.filter((p) => p.status === 'draft').length,
    readyPresentations: presentations.filter((p) => p.status === 'ready').length,
    archivedPresentations: presentations.filter((p) => p.status === 'archived').length,
    totalSlides: presentations.reduce((sum, p) => sum + p._count.slides, 0),
    totalSessions: presentations.reduce((sum, p) => sum + p._count.sessions, 0),
  };

  return stats;
}
