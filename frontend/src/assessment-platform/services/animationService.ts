/**
 * Animation service — renderers emit events; platform handles visuals.
 */

export type AnimationEventType =
  | "correct"
  | "incorrect"
  | "transition"
  | "streak"
  | "achievement"
  | "completion";

export interface AnimationEvent {
  type: AnimationEventType;
  payload?: Record<string, unknown>;
  timestamp: number;
}

type AnimationHandler = (event: AnimationEvent) => void;

export class AnimationService {
  private handlers = new Set<AnimationHandler>();
  private reducedMotion = false;
  private history: AnimationEvent[] = [];

  setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
  }

  subscribe(handler: AnimationHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(type: AnimationEventType, payload?: Record<string, unknown>): void {
    const event: AnimationEvent = { type, payload, timestamp: performance.now() };
    this.history.push(event);
    if (this.history.length > 50) this.history.shift();
    if (this.reducedMotion && type !== "transition") return;
    for (const handler of this.handlers) handler(event);
  }

  getHistory(): AnimationEvent[] {
    return [...this.history];
  }
}

export function createAnimationService(): AnimationService {
  return new AnimationService();
}
