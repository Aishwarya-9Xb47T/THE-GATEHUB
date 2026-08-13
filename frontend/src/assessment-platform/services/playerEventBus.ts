/**
 * Player event bus — decoupled communication for shell, renderers, overlays.
 */

export type PlayerEventType =
  | "question_changed"
  | "response_collected"
  | "response_submitted"
  | "timer_expired"
  | "offline_status"
  | "overlay_opened"
  | "overlay_closed"
  | "accessibility_changed"
  | "animation_emitted";

export interface PlayerEvent<T = unknown> {
  type: PlayerEventType;
  payload?: T;
  timestamp: number;
}

type PlayerEventHandler = (event: PlayerEvent) => void;

export class PlayerEventBus {
  private handlers = new Map<PlayerEventType | "*", Set<PlayerEventHandler>>();

  on(type: PlayerEventType | "*", handler: PlayerEventHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  emit(type: PlayerEventType, payload?: unknown): void {
    const event: PlayerEvent = { type, payload, timestamp: performance.now() };
    const specific = this.handlers.get(type) ?? new Set();
    const wildcard = this.handlers.get("*") ?? new Set();
    for (const handler of [...specific, ...wildcard]) handler(event);
  }
}

export function createPlayerEventBus(): PlayerEventBus {
  return new PlayerEventBus();
}
