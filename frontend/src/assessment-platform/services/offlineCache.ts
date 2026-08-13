/**
 * Offline cache — question, response, timer offset, unsynced queue.
 */

import type { SanitizedQuestionSnapshot } from "../types";
import type { StandardRendererResponse } from "../types/response";

const CACHE_PREFIX = "gatehub-assessment-player:";

export interface OfflinePlayerState {
  attemptId: string;
  deploymentId: string;
  currentQuestionVersionId: string | null;
  currentIndex: number;
  drafts: Record<string, StandardRendererResponse>;
  timerOffsetMs: number;
  pendingSubmissions: StandardRendererResponse[];
  cachedAt: string;
  questionCache: Record<string, SanitizedQuestionSnapshot>;
}

export function saveOfflineState(state: OfflinePlayerState): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(`${CACHE_PREFIX}${state.attemptId}`, JSON.stringify(state));
}

export function loadOfflineState(attemptId: string): OfflinePlayerState | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(`${CACHE_PREFIX}${attemptId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OfflinePlayerState;
  } catch {
    return null;
  }
}

export function clearOfflineState(attemptId: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(`${CACHE_PREFIX}${attemptId}`);
}

export function queuePendingSubmission(
  state: OfflinePlayerState,
  response: StandardRendererResponse
): OfflinePlayerState {
  return {
    ...state,
    pendingSubmissions: [...state.pendingSubmissions, response],
    drafts: {
      ...state.drafts,
      [response.questionVersionId]: response,
    },
    cachedAt: new Date().toISOString(),
  };
}

export interface SyncConflict {
  questionVersionId: string;
  local: StandardRendererResponse;
  server?: StandardRendererResponse;
  resolution: "keep_local" | "keep_server" | "merge";
}

export function resolveSyncConflicts(
  local: StandardRendererResponse[],
  serverAccepted: string[],
  serverResponses?: StandardRendererResponse[]
): { accepted: StandardRendererResponse[]; conflicts: SyncConflict[] } {
  const serverMap = new Map(
    (serverResponses ?? []).map((r) => [r.questionVersionId, r])
  );
  const conflicts: SyncConflict[] = [];
  const accepted: StandardRendererResponse[] = [];

  for (const item of local) {
    if (serverAccepted.includes(item.questionVersionId)) {
      accepted.push(item);
      continue;
    }
    const server = serverMap.get(item.questionVersionId);
    conflicts.push({
      questionVersionId: item.questionVersionId,
      local: item,
      server,
      resolution: server ? "keep_server" : "keep_local",
    });
    if (!server) accepted.push(item);
  }

  return { accepted, conflicts };
}

export function createEmptyOfflineState(
  attemptId: string,
  deploymentId: string
): OfflinePlayerState {
  return {
    attemptId,
    deploymentId,
    currentQuestionVersionId: null,
    currentIndex: 0,
    drafts: {},
    timerOffsetMs: 0,
    pendingSubmissions: [],
    cachedAt: new Date().toISOString(),
    questionCache: {},
  };
}
