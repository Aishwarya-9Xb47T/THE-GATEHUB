/**
 * Domain events emitted by AssessmentRuntime.
 * Transport layers (WebSocket, REST) map these to wire messages — runtime does not send sockets.
 */
export type AssessmentEvent =
  | { type: "room.state_changed"; deploymentId: string }
  | { type: "participant.state_changed"; deploymentId: string; participantId: string }
  | { type: "leaderboard.updated"; deploymentId: string }
  | { type: "answer.received"; deploymentId: string; participantId: string; questionId: string }
  | { type: "session.started"; deploymentId: string }
  | { type: "session.paused"; deploymentId: string; pausedAt: string }
  | { type: "session.resumed"; deploymentId: string }
  | { type: "session.finished"; deploymentId: string }
  | { type: "question.advanced"; deploymentId: string; roomQuestionIndex: number }
  | { type: "participant.finished"; deploymentId: string; participantId: string }
  | { type: "announcement"; deploymentId: string; message: string };

export type AssessmentEventListener = (event: AssessmentEvent) => void;
