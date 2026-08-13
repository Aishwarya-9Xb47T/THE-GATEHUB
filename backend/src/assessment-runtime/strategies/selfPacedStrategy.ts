import type { LiveSessionPort } from "../ports/liveSessionPort.js";
import type { PaceStrategy } from "./paceStrategy.js";
import type { AssessmentContext } from "../types/context.js";
import { assertHostContext, assertParticipantContext } from "../types/context.js";
import type { AssessmentTransition } from "../types/transition.js";
import type { AssessmentState } from "../types/state.js";
import type { SelfPacedSubmitResult } from "../../services/liveSession/selfPacedProgression.js";
import { buildPlayerSessionState } from "../../services/liveSession/liveSessionService.js";

function mapRoomSnapshot(
  snapshot: Awaited<ReturnType<LiveSessionPort["getRoomSnapshot"]>>
): AssessmentState {
  const status =
    snapshot.status === "lobby" ||
    snapshot.status === "active" ||
    snapshot.status === "paused" ||
    snapshot.status === "finished"
      ? snapshot.status
      : "lobby";
  return {
    deploymentId: snapshot.deploymentId,
    status,
    paceKind: "self_paced",
    questionCount: snapshot.questionCount,
    roomQuestionIndex: null,
    pausedAt: snapshot.pausedAt,
    startedAt: snapshot.startedAt,
    endedAt: snapshot.endedAt,
  };
}

function isSelfPacedPayload(payload: unknown): payload is SelfPacedSubmitResult {
  return typeof payload === "object" && payload !== null && "isCorrect" in payload;
}

export class SelfPacedStrategy implements PaceStrategy {
  readonly paceKind = "self_paced" as const;

  constructor(private readonly port: LiveSessionPort) {}

  async start(ctx: AssessmentContext): Promise<AssessmentTransition> {
    assertHostContext(ctx);
    const snapshot = await this.port.startSession(
      ctx.deploymentId,
      ctx.actor.userId,
      ctx.actor.role
    );
    return {
      kind: "session_started",
      room: mapRoomSnapshot(snapshot),
      events: [
        { type: "session.started", deploymentId: ctx.deploymentId },
        { type: "room.state_changed", deploymentId: ctx.deploymentId },
      ],
    };
  }

  async advance(ctx: AssessmentContext): Promise<AssessmentTransition> {
    assertHostContext(ctx);
    return { kind: "no_op", events: [] };
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
        { type: "leaderboard.updated", deploymentId: ctx.deploymentId },
      ],
      payload: { finalLeaderboard },
    };
  }

  async pause(ctx: AssessmentContext): Promise<AssessmentTransition> {
    assertHostContext(ctx);
    return { kind: "no_op", events: [] };
  }

  async resume(ctx: AssessmentContext): Promise<AssessmentTransition> {
    assertHostContext(ctx);
    return { kind: "no_op", events: [] };
  }

  async submit(
    ctx: AssessmentContext,
    questionId: string,
    answer: unknown
  ): Promise<AssessmentTransition> {
    assertParticipantContext(ctx);
    const raw = await this.port.submitAnswer(
      ctx.deploymentId,
      ctx.participant.participantId,
      questionId,
      answer
    );

    if (!isSelfPacedPayload(raw)) {
      return { kind: "no_op", events: [] };
    }

    const playerState = await buildPlayerSessionState(
      ctx.deploymentId,
      ctx.participant.participantId
    );

    const events: AssessmentTransition["events"] = [
      {
        type: "answer.received",
        deploymentId: ctx.deploymentId,
        participantId: ctx.participant.participantId,
        questionId,
      },
      { type: "leaderboard.updated", deploymentId: ctx.deploymentId },
      { type: "participant.state_changed", deploymentId: ctx.deploymentId, participantId: ctx.participant.participantId },
    ];

    if (raw.isPersonalComplete) {
      events.push({
        type: "participant.finished",
        deploymentId: ctx.deploymentId,
        participantId: ctx.participant.participantId,
      });
    }

    return {
      kind: raw.isPersonalComplete ? "participant_finished" : "answer_recorded",
      room: mapRoomSnapshot(await this.port.getRoomSnapshot(ctx.deploymentId)),
      events,
      payload: raw,
    };
  }

  canSubmit(ctx: AssessmentContext): boolean {
    return Boolean(ctx.participant?.participantId);
  }

  async getRoomState(ctx: AssessmentContext): Promise<AssessmentState> {
    return mapRoomSnapshot(await this.port.getRoomSnapshot(ctx.deploymentId));
  }

  async getParticipantState(ctx: AssessmentContext) {
    if (!ctx.participant) return null;
    const state = await buildPlayerSessionState(ctx.deploymentId, ctx.participant.participantId);
    return {
      participantId: ctx.participant.participantId,
      userId: ctx.participant.userId,
      status: state.status === "finished" ? ("finished" as const) : ("online" as const),
      currentQuestionIndex: state.currentQuestionIndex,
      questionStartedAt: state.questionStartedAt,
      finishedAt: null,
      score: 0,
      xp: 0,
      streak: 0,
      accuracy: 0,
      rank: null,
    };
  }

  async getProgress(ctx: AssessmentContext) {
    if (!ctx.participant) return null;
    const state = await buildPlayerSessionState(ctx.deploymentId, ctx.participant.participantId);
    const answered = state.currentQuestionIndex;
    return {
      participantId: ctx.participant.participantId,
      currentQuestionIndex: answered,
      questionCount: state.questionCount,
      questionsAnswered: answered,
      isComplete: state.status === "finished",
      status: state.status === "finished" ? ("finished" as const) : ("online" as const),
      percentComplete:
        state.questionCount > 0 ? Math.round((answered / state.questionCount) * 100) : 0,
    };
  }

  async getRoomProgress(ctx: AssessmentContext) {
    return {
      deploymentId: ctx.deploymentId,
      participantCount: 0,
      finishedCount: 0,
      indexDistribution: {},
    };
  }
}
