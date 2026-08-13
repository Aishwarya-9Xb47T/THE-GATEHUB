import { AssessmentRuntime } from "../assessment-runtime/runtime/assessmentRuntime.js";
import { createDefaultPaceStrategyRegistry } from "../assessment-runtime/registry/paceStrategyRegistry.js";
import { DEFAULT_RUNTIME_CONFIG } from "../assessment-runtime/types/config.js";
import type { PaceKind } from "../assessment-runtime/types/mode.js";
import type { SelfPacedSubmitResult } from "../services/liveSession/selfPacedProgression.js";
import { legacyLiveSessionPort } from "./adapters/legacyLiveSessionAdapter.js";
import {
  selfPacedLiveSessionPort,
  sessionUsesSelfPaced,
} from "./adapters/selfPacedLiveSessionAdapter.js";
import { buildPlayerSessionState } from "../services/liveSession/liveSessionService.js";

const registry = createDefaultPaceStrategyRegistry(legacyLiveSessionPort, selfPacedLiveSessionPort);

function runtimeFor(paceKind: PaceKind): AssessmentRuntime {
  return new AssessmentRuntime(registry.get(paceKind));
}

export async function resolveSessionPaceKind(sessionId: string): Promise<PaceKind> {
  return (await sessionUsesSelfPaced(sessionId)) ? "self_paced" : "instructor_paced";
}

export async function routeLiveSubmit(
  sessionId: string,
  participantId: string,
  userId: string | null,
  questionId: string,
  answer: unknown
) {
  const paceKind = await resolveSessionPaceKind(sessionId);
  const runtime = runtimeFor(paceKind);
  const transition = await runtime.submit(
    {
      deploymentId: sessionId,
      mode: "live_quiz",
      config: { ...DEFAULT_RUNTIME_CONFIG, paceKind },
      participant: { participantId, userId },
    },
    questionId,
    answer
  );
  return { paceKind, transition };
}

export function formatAnswerResultPayload(
  payload: unknown
): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || !("isCorrect" in payload)) return null;
  const p = payload as Record<string, unknown>;
  const isCorrect = Boolean(p.isCorrect);
  const correctOptions = (p.correctOptions as string[]) ?? [];
  const explanation = (p.explanation as string | null) ?? null;
  const pointsEarned = (p.pointsEarned as number) ?? 0;
  const xpEarned = (p.xpEarned as number) ?? 0;
  const streak = (p.streak as number) ?? 0;
  const rank = (p.rank as number) ?? 0;
  const responseTimeMs = (p.responseTimeMs as number) ?? 0;

  return {
    isCorrect,
    pointsEarned,
    explanation,
    correctOptions,
    responseTimeMs,
    streak,
    xpEarned,
    totalScore: p.totalScore,
    totalXp: p.totalXp,
    rank,
    nextQuestion: p.nextQuestion ?? null,
    nextQuestionIndex: p.nextQuestionIndex ?? null,
    remainingQuestions: p.remainingQuestions ?? 0,
    timer: p.timer ?? 30,
    finished: p.finished ?? p.isPersonalComplete ?? false,
    participantQuestionIndex: p.participantQuestionIndex,
    currentQuestionIndex: p.currentQuestionIndex ?? p.participantQuestionIndex,
    questionStartedAt: p.questionStartedAt ?? null,
    isPersonalComplete: p.isPersonalComplete ?? false,
    score: p.score ?? p.totalScore ?? 0,
    updatedSession: p.updatedSession ?? {},
    feedback: p.feedback ?? {
      isCorrect,
      correctOptions,
      explanation,
      pointsEarned,
      xpEarned,
      streak,
      rank,
      responseTimeMs,
    },
  };
}

export async function sendParticipantState(
  sessionId: string,
  participantId: string
) {
  return buildPlayerSessionState(sessionId, participantId);
}

export { registry as livePaceStrategyRegistry };
