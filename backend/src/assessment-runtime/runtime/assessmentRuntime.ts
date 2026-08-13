import type { PaceStrategy } from "../strategies/paceStrategy.js";
import type { AssessmentContext } from "../types/context.js";
import type { AssessmentEvent, AssessmentEventListener } from "../types/events.js";
import type { AssessmentTransition } from "../types/transition.js";

/**
 * Mode-agnostic progression orchestrator.
 * Does not know UI, React, WebSocket, or database — only delegates to PaceStrategy.
 */
export class AssessmentRuntime {
  private listeners: AssessmentEventListener[] = [];

  constructor(private strategy: PaceStrategy) {}

  setStrategy(strategy: PaceStrategy): void {
    this.strategy = strategy;
  }

  getStrategy(): PaceStrategy {
    return this.strategy;
  }

  onEvent(listener: AssessmentEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(events: AssessmentEvent[]): void {
    for (const event of events) {
      for (const listener of this.listeners) {
        listener(event);
      }
    }
  }

  private async run(
    fn: () => Promise<AssessmentTransition>
  ): Promise<AssessmentTransition> {
    const transition = await fn();
    this.emit(transition.events);
    return transition;
  }

  start(ctx: AssessmentContext): Promise<AssessmentTransition> {
    return this.run(() => this.strategy.start(ctx));
  }

  advance(ctx: AssessmentContext): Promise<AssessmentTransition> {
    return this.run(() => this.strategy.advance(ctx));
  }

  finish(ctx: AssessmentContext): Promise<AssessmentTransition> {
    return this.run(() => this.strategy.finish(ctx));
  }

  pause(ctx: AssessmentContext): Promise<AssessmentTransition> {
    return this.run(() => this.strategy.pause(ctx));
  }

  resume(ctx: AssessmentContext): Promise<AssessmentTransition> {
    return this.run(() => this.strategy.resume(ctx));
  }

  submit(
    ctx: AssessmentContext,
    questionId: string,
    answer: unknown
  ): Promise<AssessmentTransition> {
    return this.run(() => this.strategy.submit(ctx, questionId, answer));
  }

  canSubmit(ctx: AssessmentContext, questionId: string): boolean {
    return this.strategy.canSubmit(ctx, questionId);
  }
}
