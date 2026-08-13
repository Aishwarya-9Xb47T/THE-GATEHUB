import type { AssessmentRuntimeConfig } from "./config.js";
import type { RuntimeAssessmentMode } from "./mode.js";

/**
 * Opaque handle passed into every strategy call.
 * Infrastructure layers populate this from DB / auth — runtime never queries ORM.
 */
export interface AssessmentContext {
  deploymentId: string;
  mode: RuntimeAssessmentMode;
  config: AssessmentRuntimeConfig;
  /** Present for host actions */
  actor?: {
    userId: string;
    role: string;
    isHost: boolean;
  };
  /** Present for participant actions */
  participant?: {
    participantId: string;
    userId: string | null;
  };
}

export function assertHostContext(ctx: AssessmentContext): asserts ctx is AssessmentContext & {
  actor: { userId: string; role: string; isHost: true };
} {
  if (!ctx.actor?.isHost) {
    throw new Error("Host context required");
  }
}

export function assertParticipantContext(ctx: AssessmentContext): asserts ctx is AssessmentContext & {
  participant: { participantId: string; userId: string | null };
} {
  if (!ctx.participant?.participantId) {
    throw new Error("Participant context required");
  }
}
