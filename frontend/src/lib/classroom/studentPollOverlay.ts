/**
 * Student live-poll overlay visibility.
 *
 * The instructor session (`activeInteractionId`, current slide, WS snapshot)
 * stays authoritative. This module only decides when the *local* poll overlay
 * should cover the presentation after a student submits, the poll expires,
 * or the instructor closes it.
 */

export const POLL_SUBMIT_CONFIRMATION_MS = 1600;

export interface StudentPollOverlayInput {
  hasActiveInteraction: boolean;
  hasSlide: boolean;
  hasSubmitted: boolean;
  instructorClosed: boolean;
  expired: boolean;
  confirmationElapsedMs: number | null;
  confirmationMs?: number;
}

export interface StudentPollOverlayPlan {
  visible: boolean;
  /** Milliseconds until the overlay should hide; null means stay open. */
  autoDismissMs: number | null;
  /** Overlay dismiss must never wipe a persisted student response. */
  keepSubmission: boolean;
}

export function studentPollOverlayAutoDismissMs(input: {
  hasSubmitted: boolean;
  expired: boolean;
  instructorClosed: boolean;
  confirmationMs?: number;
}): number | null {
  if (input.instructorClosed) return 0;
  if (input.expired && !input.hasSubmitted) return 0;
  if (input.hasSubmitted) return input.confirmationMs ?? POLL_SUBMIT_CONFIRMATION_MS;
  return null;
}

export function resolveStudentPollOverlay(input: StudentPollOverlayInput): StudentPollOverlayPlan {
  const confirmationMs = input.confirmationMs ?? POLL_SUBMIT_CONFIRMATION_MS;
  const keepSubmission = input.hasSubmitted;

  if (!input.hasActiveInteraction || !input.hasSlide || input.instructorClosed) {
    return { visible: false, autoDismissMs: null, keepSubmission };
  }

  if (input.expired && !input.hasSubmitted) {
    return { visible: false, autoDismissMs: 0, keepSubmission };
  }

  if (input.hasSubmitted) {
    const elapsed = input.confirmationElapsedMs ?? 0;
    if (elapsed >= confirmationMs) {
      return { visible: false, autoDismissMs: null, keepSubmission };
    }
    return {
      visible: true,
      autoDismissMs: Math.max(0, confirmationMs - elapsed),
      keepSubmission,
    };
  }

  return { visible: true, autoDismissMs: null, keepSubmission };
}

export function shouldRejectDuplicateStudentPollSubmit(input: {
  alreadySubmitted: boolean;
  allowChangeAnswer: boolean;
}): boolean {
  return input.alreadySubmitted && !input.allowChangeAnswer;
}

export function mergeClassroomSessionSnapshot<T extends {
  currentSlideId: string | null;
  activeInteractionId: string | null;
  settings?: Record<string, unknown>;
}>(
  session: T,
  snapshot: {
    currentSlideId?: string | null;
    activeInteractionId?: string | null;
    settings?: Record<string, unknown>;
  },
): T {
  return {
    ...session,
    currentSlideId: snapshot.currentSlideId !== undefined
      ? snapshot.currentSlideId
      : session.currentSlideId,
    activeInteractionId: snapshot.activeInteractionId !== undefined
      ? snapshot.activeInteractionId
      : session.activeInteractionId,
    settings: { ...(session.settings || {}), ...(snapshot.settings || {}) },
  };
}

export function selectLiveInstructorSlide<T extends { id: string }>(
  slides: T[],
  instructorSlideId: string | null | undefined,
): T | null {
  if (!instructorSlideId) return null;
  return slides.find((slide) => slide.id === instructorSlideId) ?? null;
}

export function restoreSubmissionForActivePoll(input: {
  activeInteractionId: string | null | undefined;
  submittedInteractions?: Record<string, { response: unknown; submittedAt: string }>;
}): { interactionId: string; response: unknown; submittedAt: string } | null {
  const activeId = input.activeInteractionId;
  if (!activeId || !input.submittedInteractions) return null;
  const existing = input.submittedInteractions[activeId];
  if (!existing) return null;
  return {
    interactionId: activeId,
    response: existing.response,
    submittedAt: existing.submittedAt,
  };
}
