import type { LiveSessionPort, LiveSessionRoomSnapshot } from "../ports/liveSessionPort.js";
import type { PaceStrategy } from "./paceStrategy.js";
import type { AssessmentContext } from "../types/context.js";
import {
  assertHostContext,
  assertParticipantContext,
} from "../types/context.js";
import type { AssessmentTransition } from "../types/transition.js";
import type { AssessmentState } from "../types/state.js";
import type { AssessmentProgress } from "../types/progress.js";
import type { ParticipantAssessmentState } from "../types/state.js";
import type { RoomProgressSummary } from "../types/progress.js";

function mapRoomSnapshot(snapshot: LiveSessionRoomSnapshot): AssessmentState {
  const status = mapDeploymentStatus(snapshot.status);
  return {
    deploymentId: snapshot.deploymentId,
    status,
    paceKind: "instructor_paced",
    questionCount: snapshot.questionCount,
    roomQuestionIndex: snapshot.currentQuestionIndex,
    pausedAt: snapshot.pausedAt,
    startedAt: snapshot.startedAt,
    endedAt: snapshot.endedAt,
  };
}

function mapDeploymentStatus(raw: string): AssessmentState["status"] {
  if (raw === "lobby") return "lobby";
  if (raw === "active") return "active";
  if (raw === "paused") return "paused";
  if (raw === "finished") return "finished";
  return "lobby";
}

function roomTransition(
  kind: AssessmentTransition["kind"],
  snapshot: LiveSessionRoomSnapshot,
  events: AssessmentTransition["events"],
  payload?: unknown
): AssessmentTransition {
  return {
    kind,
    room: mapRoomSnapshot(snapshot),
    events,
    payload,
  };
}

/**
 * Wraps legacy instructor-paced live behavior without modifying liveSessionService.
 * Not wired to WebSocket in Phase 1 — production path unchanged.
 */
export class InstructorPacedStrategy implements PaceStrategy {
  readonly paceKind = "instructor_paced" as const;

  constructor(private readonly port: LiveSessionPort) {}

  async start(ctx: AssessmentContext): Promise<AssessmentTransition> {
    assertHostContext(ctx);
    const snapshot = await this.port.startSession(
      ctx.deploymentId,
      ctx.actor.userId,
      ctx.actor.role
    );
    return roomTransition("session_started", snapshot, [
      { type: "session.started", deploymentId: ctx.deploymentId },
      { type: "room.state_changed", deploymentId: ctx.deploymentId },
    ]);
  }

  async advance(ctx: AssessmentContext): Promise<AssessmentTransition> {
    assertHostContext(ctx);
    const snapshot = await this.port.advanceQuestion(
      ctx.deploymentId,
      ctx.actor.userId,
      ctx.actor.role
    );
    const kind = snapshot.status === "finished" ? "session_finished" : "question_advanced";
    const events: AssessmentTransition["events"] = [
      { type: "room.state_changed", deploymentId: ctx.deploymentId },
    ];
    if (kind === "question_advanced") {
      events.push({
        type: "question.advanced",
        deploymentId: ctx.deploymentId,
        roomQuestionIndex: snapshot.currentQuestionIndex,
      });
    } else {
      events.push({ type: "session.finished", deploymentId: ctx.deploymentId });
    }
    return roomTransition(kind, snapshot, events);
  }

  async finish(ctx: AssessmentContext): Promise<AssessmentTransition> {
    assertHostContext(ctx);
    const { room, finalLeaderboard } = await this.port.finishSession(
      ctx.deploymentId,
      ctx.actor.userId,
      ctx.actor.role
    );
    return {
      kind: "session_finished",
      room: mapRoomSnapshot(room),
      events: [
        { type: "session.finished", deploymentId: ctx.deploymentId },
        { type: "room.state_changed", deploymentId: ctx.deploymentId },
        { type: "leaderboard.updated", deploymentId: ctx.deploymentId },
      ],
      payload: { finalLeaderboard },
    };
  }

  async pause(ctx: AssessmentContext): Promise<AssessmentTransition> {
    assertHostContext(ctx);
    return {
      kind: "no_op",
      events: [],
    };
  }

  async resume(ctx: AssessmentContext): Promise<AssessmentTransition> {
    assertHostContext(ctx);
    return {
      kind: "no_op",
      events: [],
    };
  }

  async submit(
    ctx: AssessmentContext,
    questionId: string,
    answer: unknown
  ): Promise<AssessmentTransition> {
    assertParticipantContext(ctx);
    const result = await this.port.submitAnswer(
      ctx.deploymentId,
      ctx.participant.participantId,
      questionId,
      answer
    );
    const snapshot = await this.port.getRoomSnapshot(ctx.deploymentId);
    return {
      kind: "answer_recorded",
      room: mapRoomSnapshot(snapshot),
      events: [
        {
          type: "answer.received",
          deploymentId: ctx.deploymentId,
          participantId: ctx.participant.participantId,
          questionId,
        },
        { type: "leaderboard.updated", deploymentId: ctx.deploymentId },
        { type: "room.state_changed", deploymentId: ctx.deploymentId },
      ],
      payload: result,
    };
  }

  canSubmit(ctx: AssessmentContext, _questionId: string): boolean {
    return Boolean(ctx.participant?.participantId);
  }

  async getRoomState(ctx: AssessmentContext): Promise<AssessmentState> {
    const snapshot = await this.port.getRoomSnapshot(ctx.deploymentId);
    return mapRoomSnapshot(snapshot);
  }

  async getParticipantState(ctx: AssessmentContext): Promise<ParticipantAssessmentState | null> {
    if (!ctx.participant) return null;
    const room = await this.getRoomState(ctx);
    return {
      participantId: ctx.participant.participantId,
      userId: ctx.participant.userId,
      status: "online",
      currentQuestionIndex: room.roomQuestionIndex ?? -1,
      questionStartedAt: null,
      finishedAt: null,
      score: 0,
      xp: 0,
      streak: 0,
      accuracy: 0,
      rank: null,
    };
  }

  async getProgress(ctx: AssessmentContext): Promise<AssessmentProgress | null> {
    if (!ctx.participant) return null;
    const room = await this.getRoomState(ctx);
    const idx = room.roomQuestionIndex ?? 0;
    const count = room.questionCount;
    return {
      participantId: ctx.participant.participantId,
      currentQuestionIndex: idx,
      questionCount: count,
      questionsAnswered: idx,
      isComplete: room.status === "finished",
      status: room.status === "finished" ? "finished" : "online",
      percentComplete: count > 0 ? Math.round((idx / count) * 100) : 0,
    };
  }

  async getRoomProgress(ctx: AssessmentContext): Promise<RoomProgressSummary> {
    const room = await this.getRoomState(ctx);
    const idx = room.roomQuestionIndex ?? 0;
    return {
      deploymentId: ctx.deploymentId,
      participantCount: 0,
      finishedCount: 0,
      indexDistribution: { [idx]: 0 },
    };
  }
}
