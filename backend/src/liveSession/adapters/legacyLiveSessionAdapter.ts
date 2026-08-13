import {
  startSession,
  advanceQuestion,
  finishSession,
  submitLiveAnswer,
  buildSessionState,
} from "../../services/liveSession/liveSessionService.js";
import type { LiveSessionPort, LiveSessionRoomSnapshot } from "../../assessment-runtime/ports/liveSessionPort.js";

async function toSnapshot(deploymentId: string): Promise<LiveSessionRoomSnapshot> {
  const state = await buildSessionState(deploymentId);
  return {
    deploymentId: state.id,
    status: state.status,
    currentQuestionIndex: state.currentQuestionIndex,
    questionCount: state.questionCount,
    pausedAt: null,
    startedAt: null,
    endedAt: null,
  };
}

/**
 * Bridges legacy LiveSession service → LiveSessionPort.
 * Production WebSocket path does NOT use this adapter in Phase 1.
 */
export const legacyLiveSessionPort: LiveSessionPort = {
  async startSession(deploymentId, hostUserId, role) {
    await startSession(deploymentId, hostUserId, role);
    return toSnapshot(deploymentId);
  },

  async advanceQuestion(deploymentId, hostUserId, role) {
    await advanceQuestion(deploymentId, hostUserId, role);
    return toSnapshot(deploymentId);
  },

  async finishSession(deploymentId, hostUserId, role) {
    const { finalLeaderboard } = await finishSession(deploymentId, hostUserId, role);
    return {
      room: { ...(await toSnapshot(deploymentId)), status: "finished" },
      finalLeaderboard,
    };
  },

  async submitAnswer(deploymentId, participantId, questionId, answer) {
    return submitLiveAnswer(deploymentId, participantId, questionId, answer);
  },

  async getRoomSnapshot(deploymentId) {
    return toSnapshot(deploymentId);
  },
};
