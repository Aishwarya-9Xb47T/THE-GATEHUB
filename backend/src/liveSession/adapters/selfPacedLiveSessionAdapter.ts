import type { LiveSessionPort } from "../../assessment-runtime/ports/liveSessionPort.js";
import {
  startSession,
  finishSession,
  submitLiveAnswer,
  buildSessionState,
  buildPlayerSessionState,
} from "../../services/liveSession/liveSessionService.js";
import { getSessionById } from "../../services/liveSession/liveSessionService.js";
import { isSelfPaced } from "../../services/liveSession/paceMode.js";
import { DEFAULT_LIVE_SESSION_SETTINGS } from "../../services/liveSession/types.js";

async function toRoomSnapshot(deploymentId: string) {
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

export const selfPacedLiveSessionPort: LiveSessionPort = {
  async startSession(deploymentId, hostUserId, role) {
    await startSession(deploymentId, hostUserId, role);
    return toRoomSnapshot(deploymentId);
  },

  async advanceQuestion() {
    throw new Error("advanceQuestion is not used in self-paced live mode");
  },

  async finishSession(deploymentId, hostUserId, role) {
    const { finalLeaderboard } = await finishSession(deploymentId, hostUserId, role);
    return {
      room: { ...(await toRoomSnapshot(deploymentId)), status: "finished" },
      finalLeaderboard,
    };
  },

  async submitAnswer(deploymentId, participantId, questionId, answer) {
    return submitLiveAnswer(deploymentId, participantId, questionId, answer);
  },

  async getRoomSnapshot(deploymentId) {
    return toRoomSnapshot(deploymentId);
  },
};

export async function sessionUsesSelfPaced(sessionId: string): Promise<boolean> {
  const session = await getSessionById(sessionId);
  const settings = { ...DEFAULT_LIVE_SESSION_SETTINGS, ...(session.settings as object) };
  return isSelfPaced(settings, session.sessionType);
}

export { buildPlayerSessionState };
