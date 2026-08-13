/**
 * In-process domain event bus (Phase 1).
 * Phase 2+: Redis pub/sub + worker consumers.
 * @see docs/ASSESSMENT-PLATFORM-ARCHITECTURE.md Section 21
 */

import type { DomainEvent, DomainEventType } from "../domain/events.js";
import { prisma } from "../../utils/prisma.js";
import { logger } from "../../utils/logger.js";

type EventHandler = (event: DomainEvent) => void | Promise<void>;

const handlers = new Map<DomainEventType | "*", Set<EventHandler>>();

export function subscribe(type: DomainEventType | "*", handler: EventHandler): () => void {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(handler);
  return () => handlers.get(type)?.delete(handler);
}

export async function publish(event: DomainEvent): Promise<void> {
  const payload = event.payload as Record<string, unknown>;

  try {
    await prisma.platformAnalyticsEvent.create({
      data: {
        organizationId: event.metadata.organizationId ?? undefined,
        eventType: event.type,
        actorId: event.metadata.actorId ?? undefined,
        assessmentId:
          typeof payload.assessmentId === "string" ? payload.assessmentId : undefined,
        questionId: typeof payload.questionId === "string" ? payload.questionId : undefined,
        deploymentId:
          typeof payload.deploymentId === "string" ? payload.deploymentId : undefined,
        attemptId: typeof payload.attemptId === "string" ? payload.attemptId : undefined,
        payload: event.payload as object,
      },
    });
  } catch (err) {
    logger.warn(`Failed to persist analytics event [${event.type}]: ${err instanceof Error ? err.message : String(err)}`);
  }

  const specific = handlers.get(event.type) ?? new Set();
  const wildcard = handlers.get("*") ?? new Set();

  for (const handler of [...specific, ...wildcard]) {
    try {
      await handler(event);
    } catch (err) {
      logger.error(`Domain event handler failed [${event.type}]: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export function newCorrelationId(): string {
  return crypto.randomUUID();
}
