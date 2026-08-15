import { describe, expect, it } from 'vitest';
import {
  POLL_SUBMIT_CONFIRMATION_MS,
  mergeClassroomSessionSnapshot,
  resolveStudentPollOverlay,
  restoreSubmissionForActivePoll,
  selectLiveInstructorSlide,
  shouldRejectDuplicateStudentPollSubmit,
  studentPollOverlayAutoDismissMs,
} from './studentPollOverlay';

const answering = {
  hasActiveInteraction: true,
  hasSlide: true,
  hasSubmitted: false,
  instructorClosed: false,
  expired: false,
  confirmationElapsedMs: null as number | null,
};

describe('student live poll overlay', () => {
  it('shows the overlay while the student is answering', () => {
    const plan = resolveStudentPollOverlay(answering);
    expect(plan.visible).toBe(true);
    expect(plan.autoDismissMs).toBeNull();
  });

  it('keeps the confirmation visible briefly after a successful submit, then closes', () => {
    const confirming = resolveStudentPollOverlay({
      ...answering,
      hasSubmitted: true,
      confirmationElapsedMs: 0,
    });
    expect(confirming.visible).toBe(true);
    expect(confirming.autoDismissMs).toBe(POLL_SUBMIT_CONFIRMATION_MS);
    expect(confirming.keepSubmission).toBe(true);

    const afterDelay = resolveStudentPollOverlay({
      ...answering,
      hasSubmitted: true,
      confirmationElapsedMs: POLL_SUBMIT_CONFIRMATION_MS,
    });
    expect(afterDelay.visible).toBe(false);
    expect(afterDelay.keepSubmission).toBe(true);
    expect(studentPollOverlayAutoDismissMs({
      hasSubmitted: true,
      expired: false,
      instructorClosed: false,
    })).toBe(POLL_SUBMIT_CONFIRMATION_MS);
  });

  it('does not clear a persisted submission when the overlay auto-dismisses', () => {
    const plan = resolveStudentPollOverlay({
      ...answering,
      hasSubmitted: true,
      confirmationElapsedMs: 2000,
    });
    expect(plan.visible).toBe(false);
    expect(plan.keepSubmission).toBe(true);
  });

  it('closes immediately when the instructor closes the poll', () => {
    expect(resolveStudentPollOverlay({
      ...answering,
      instructorClosed: true,
    }).visible).toBe(false);
    expect(studentPollOverlayAutoDismissMs({
      hasSubmitted: false,
      expired: false,
      instructorClosed: true,
    })).toBe(0);

    expect(resolveStudentPollOverlay({
      ...answering,
      hasSubmitted: true,
      confirmationElapsedMs: 0,
      instructorClosed: true,
    }).visible).toBe(false);
  });

  it('closes on poll expiry if the student has not submitted', () => {
    const plan = resolveStudentPollOverlay({
      ...answering,
      expired: true,
    });
    expect(plan.visible).toBe(false);
    expect(studentPollOverlayAutoDismissMs({
      hasSubmitted: false,
      expired: true,
      instructorClosed: false,
    })).toBe(0);
  });

  it('still shows the short confirmation if the poll expires after submit', () => {
    const plan = resolveStudentPollOverlay({
      ...answering,
      hasSubmitted: true,
      expired: true,
      confirmationElapsedMs: 200,
    });
    expect(plan.visible).toBe(true);
    expect(plan.keepSubmission).toBe(true);
  });

  it('rejects a duplicate submit and still dismisses the overlay', () => {
    expect(shouldRejectDuplicateStudentPollSubmit({
      alreadySubmitted: true,
      allowChangeAnswer: false,
    })).toBe(true);
    expect(shouldRejectDuplicateStudentPollSubmit({
      alreadySubmitted: true,
      allowChangeAnswer: true,
    })).toBe(false);

    const afterDuplicate = resolveStudentPollOverlay({
      ...answering,
      hasSubmitted: true,
      confirmationElapsedMs: POLL_SUBMIT_CONFIRMATION_MS,
    });
    expect(afterDuplicate.visible).toBe(false);
    expect(afterDuplicate.keepSubmission).toBe(true);
  });

  it('shows the latest instructor slide after the overlay closes', () => {
    const slides = [
      { id: 'slide-1', title: 'Intro' },
      { id: 'slide-2', title: 'Poll slide' },
      { id: 'slide-3', title: 'Current instructor slide' },
    ];
    const session = mergeClassroomSessionSnapshot(
      { currentSlideId: 'slide-2', activeInteractionId: 'poll-1', settings: {} },
      { currentSlideId: 'slide-3' },
    );
    expect(session.activeInteractionId).toBe('poll-1');
    expect(selectLiveInstructorSlide(slides, session.currentSlideId)?.id).toBe('slide-3');

    const afterClose = resolveStudentPollOverlay({
      ...answering,
      hasSubmitted: true,
      confirmationElapsedMs: POLL_SUBMIT_CONFIRMATION_MS,
    });
    expect(afterClose.visible).toBe(false);
    expect(selectLiveInstructorSlide(slides, session.currentSlideId)?.title).toBe('Current instructor slide');
  });

  it('restores the current instructor presentation and submitted poll on reconnect', () => {
    const slides = [
      { id: 'slide-1' },
      { id: 'slide-4' },
    ];
    const recovered = mergeClassroomSessionSnapshot(
      { currentSlideId: 'slide-1', activeInteractionId: null, settings: { navigation: 'locked' } },
      {
        currentSlideId: 'slide-4',
        activeInteractionId: 'poll-live',
        settings: { navigation: 'locked', pointer: { x: 12, y: 40 } },
      },
    );
    expect(recovered.currentSlideId).toBe('slide-4');
    expect(recovered.activeInteractionId).toBe('poll-live');
    expect(selectLiveInstructorSlide(slides, recovered.currentSlideId)?.id).toBe('slide-4');

    const restored = restoreSubmissionForActivePoll({
      activeInteractionId: recovered.activeInteractionId,
      submittedInteractions: {
        'poll-live': { response: 'B', submittedAt: '2026-08-15T16:48:00.000Z' },
      },
    });
    expect(restored).toEqual({
      interactionId: 'poll-live',
      response: 'B',
      submittedAt: '2026-08-15T16:48:00.000Z',
    });

    const overlay = resolveStudentPollOverlay({
      ...answering,
      hasSubmitted: true,
      confirmationElapsedMs: POLL_SUBMIT_CONFIRMATION_MS,
    });
    expect(overlay.visible).toBe(false);
    expect(overlay.keepSubmission).toBe(true);
  });
});
