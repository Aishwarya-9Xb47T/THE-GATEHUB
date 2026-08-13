/**
 * Infrastructure port — implemented by liveSession adapter (Prisma / legacy service).
 * Keeps PaceStrategy free of database and ORM details.
 */
export interface LiveSessionRoomSnapshot {
  deploymentId: string;
  status: string;
  currentQuestionIndex: number;
  questionCount: number;
  pausedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

export interface LiveSessionPort {
  startSession(deploymentId: string, hostUserId: string, role: string): Promise<LiveSessionRoomSnapshot>;

  advanceQuestion(deploymentId: string, hostUserId: string, role: string): Promise<LiveSessionRoomSnapshot>;

  finishSession(
    deploymentId: string,
    hostUserId: string,
    role: string
  ): Promise<{ room: LiveSessionRoomSnapshot; finalLeaderboard: unknown }>;

  submitAnswer(
    deploymentId: string,
    participantId: string,
    questionId: string,
    answer: unknown
  ): Promise<unknown>;

  getRoomSnapshot(deploymentId: string): Promise<LiveSessionRoomSnapshot>;
}
