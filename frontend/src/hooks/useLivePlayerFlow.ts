import type { LiveAnswerResult, LiveSessionState } from "@/lib/liveSession/types";
import { FEEDBACK_DURATION_MS, LEADERBOARD_REVEAL_MS } from "@/lib/liveSession/livePlayerTimings";
import { isSelfPacedLive } from "@/lib/liveSession/paceMode";
import { useSelfPacedPlayerFlow } from "./useSelfPacedPlayerFlow";
import { useInstructorPacedPlayerFlow } from "./useInstructorPacedPlayerFlow";

export { FEEDBACK_DURATION_MS, LEADERBOARD_REVEAL_MS };

interface UseLivePlayerFlowOptions {
  sessionId: string;
  sessionState: LiveSessionState | null;
  setSessionState: (updater: (prev: LiveSessionState | null) => LiveSessionState | null) => void;
  wasRestored: boolean;
  onSubmit: (questionId: string, answer: unknown) => Promise<LiveAnswerResult>;
  clearWasRestored: () => void;
}

export function useLivePlayerFlow(options: UseLivePlayerFlowOptions) {
  const { sessionState, sessionId, onSubmit } = options;
  const selfPaced = sessionState ? isSelfPacedLive(sessionState.settings, sessionState.sessionType) : false;

  const selfPacedFlow = useSelfPacedPlayerFlow({
    sessionId,
    sessionState,
    onSubmit,
  });

  const instructorFlow = useInstructorPacedPlayerFlow(options);

  return selfPaced ? selfPacedFlow : instructorFlow;
}
