/**
 * Offline player sync types (Section 30).
 */

import type { ResponsePayload } from "./types.js";

export interface OfflineAttemptCache {
  attemptId: string;
  deploymentId: string;
  assessmentVersionId: string;
  mode: string;
  cachedAt: string;
  expiresAt: string;
}

export interface OfflineDraftAnswer {
  questionVersionId: string;
  answer: unknown;
  savedAt: string;
  responseTimeMs?: number;
}

export interface OfflineTimerState {
  attemptId: string;
  serverStartedAt: string;
  clientOffsetMs: number;
  lastSyncedAt: string;
}

export interface PendingSubmission {
  id: string;
  questionVersionId: string;
  payload: ResponsePayload;
  queuedAt: string;
  retryCount: number;
}

export interface AttemptSyncRequest {
  reconnectToken: string;
  pending: PendingSubmission[];
  drafts: OfflineDraftAnswer[];
  clientTimer?: OfflineTimerState;
}

export interface AttemptSyncResponse {
  accepted: string[];
  rejected: Array<{ pendingId: string; reason: string }>;
  serverTime: string;
  attemptStatus: string;
}
