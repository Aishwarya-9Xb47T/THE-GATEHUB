/**
 * Lightweight lesson-step context for GateHub Assistant.
 * Published by StudentLearningPlatform; consumed by GateHubAssistantProvider.
 * Does not alter compile/publish/experience packages.
 */

export interface LearningLessonContext {
  universeId: string;
  universeTitle?: string;
  lessonId: string;
  lessonTitle: string;
  stepId: string | null;
  stepTitle: string | null;
  stepKind: string | null;
  progressPercent?: number;
  updatedAt: number;
}

const EVENT = "gatehub-learning-lesson-context";
let current: LearningLessonContext | null = null;

export function publishLearningLessonContext(
  ctx: Omit<LearningLessonContext, "updatedAt"> | null
): void {
  current = ctx ? { ...ctx, updatedAt: Date.now() } : null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: current }));
  }
}

export function getLearningLessonContext(): LearningLessonContext | null {
  return current;
}

export function subscribeLearningLessonContext(
  listener: (ctx: LearningLessonContext | null) => void
): () => void {
  const handler = (e: Event) => {
    listener((e as CustomEvent<LearningLessonContext | null>).detail ?? null);
  };
  window.addEventListener(EVENT, handler);
  listener(current);
  return () => window.removeEventListener(EVENT, handler);
}

export function learningContextHints(ctx: LearningLessonContext): string[] {
  const step = ctx.stepTitle || "this step";
  const lesson = ctx.lessonTitle || "this lesson";
  return [
    `Explain ${step} in simple terms`,
    `What should I focus on in "${lesson}"?`,
    `Help me prepare for the checkpoint`,
    `Quiz me on the key ideas so far`,
  ];
}
