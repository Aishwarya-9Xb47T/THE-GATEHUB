import { api, getWsConnectTarget } from "@/lib/api";
import type {
  LiveSessionSettings,
  LiveSessionState,
  LiveSessionType,
  QuizRoomPreview,
  QuizRoomSourceType,
  QuizRoomSummary,
  QuizRoomTemplate,
  LeaderboardEntry,
  QuestionBankItem,
} from "./types";

export async function createQuizRoom(body: {
  quizId: string;
  title?: string;
  sessionType?: LiveSessionType;
  sourceType?: QuizRoomSourceType;
  courseId?: string;
  lectureId?: string;
  learningUniverseId?: string;
  settings?: Partial<LiveSessionSettings>;
  scheduledAt?: string | null;
  asDraft?: boolean;
}) {
  return api<{ success: boolean; data: QuizRoomSummary }>("/live-sessions", { method: "POST", body });
}

export async function updateQuizRoom(
  sessionId: string,
  body: {
    title?: string;
    sessionType?: LiveSessionType;
    sourceType?: QuizRoomSourceType;
    quizId?: string;
    courseId?: string | null;
    lectureId?: string | null;
    learningUniverseId?: string | null;
    settings?: Partial<LiveSessionSettings>;
    scheduledAt?: string | null;
  }
) {
  return api<{ success: boolean; data: QuizRoomSummary }>(`/live-sessions/${sessionId}`, { method: "PATCH", body });
}

export async function launchQuizRoom(sessionId: string) {
  return api<{ success: boolean; data: QuizRoomSummary }>(`/live-sessions/${sessionId}/launch`, { method: "POST" });
}

export async function deleteQuizRoom(sessionId: string) {
  return api<{ success: boolean }>(`/live-sessions/${sessionId}`, { method: "DELETE" });
}

export async function duplicateQuizRoom(sessionId: string, asDraft = true) {
  return api<{ success: boolean; data: QuizRoomSummary }>(`/live-sessions/${sessionId}/duplicate`, {
    method: "POST",
    body: { asDraft },
  });
}

export async function getQuizRoomPreview(quizId: string) {
  return api<{ success: boolean; data: QuizRoomPreview }>(`/live-sessions/preview?quizId=${quizId}`);
}

export async function listQuizRooms(filters?: { status?: string; sourceType?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.sourceType) params.set("sourceType", filters.sourceType);
  const qs = params.toString();
  return api<{ success: boolean; data: QuizRoomSummary[] }>(`/live-sessions/my${qs ? `?${qs}` : ""}`);
}

export async function listQuestionBank() {
  return api<{ success: boolean; data: QuestionBankItem[] }>("/live-sessions/question-bank");
}

export async function listQuizRoomReports() {
  return api<{
    success: boolean;
    data: Array<
      QuizRoomSummary & {
        analytics: { totalParticipants: number; avgAccuracy: number; avgResponseTimeMs: number | null } | null;
        _count: { participants: number; answers: number };
      }
    >;
  }>("/live-sessions/reports");
}

export async function listQuizRoomTemplates() {
  return api<{ success: boolean; data: QuizRoomTemplate[] }>("/live-sessions/templates");
}

export async function createQuizRoomTemplate(body: {
  name: string;
  description?: string;
  sessionType?: LiveSessionType;
  sourceType?: QuizRoomSourceType;
  settings?: Partial<LiveSessionSettings>;
}) {
  return api<{ success: boolean; data: QuizRoomTemplate }>("/live-sessions/templates", { method: "POST", body });
}

export async function deleteQuizRoomTemplate(templateId: string) {
  return api<{ success: boolean }>(`/live-sessions/templates/${templateId}`, { method: "DELETE" });
}

export async function getQuizRoomPreferences() {
  return api<{ success: boolean; data: LiveSessionSettings }>("/live-sessions/preferences");
}

export async function saveQuizRoomPreferences(defaults: Partial<LiveSessionSettings>) {
  return api<{ success: boolean; data: LiveSessionSettings }>("/live-sessions/preferences", {
    method: "PUT",
    body: defaults,
  });
}

/** @deprecated use createQuizRoom */
export async function createLiveSession(body: Parameters<typeof createQuizRoom>[0]) {
  return createQuizRoom(body);
}

export async function getLiveSession(sessionId: string) {
  return api<{ success: boolean; data: unknown }>(`/live-sessions/${sessionId}`);
}

export async function getLiveSessionReview(sessionId: string) {
  return api<{ success: boolean; data: any[] }>(`/live-sessions/${sessionId}/review`);
}

export async function getLiveSessionState(sessionId: string) {
  return api<{ success: boolean; data: LiveSessionState }>(`/live-sessions/${sessionId}/state`);
}

export async function lookupRoomCode(code: string) {
  const trimmed = code.trim();
  const encoded = /^\d{4}$/.test(trimmed) ? trimmed : trimmed.toUpperCase();
  return api<{
    success: boolean;
    data: {
      id: string;
      roomCode: string | null;
      pin: string | null;
      title: string;
      status: string;
      participantCount: number;
      questionCount: number;
      hostName: string;
    };
  }>(`/live-sessions/lookup/${encodeURIComponent(encoded)}`);
}

export async function joinLiveSession(
  sessionId: string,
  displayName?: string,
  avatar?: string,
  avatarCategory?: string
) {
  return api<{ success: boolean; data: { id: string } }>(`/live-sessions/${sessionId}/join`, {
    method: "POST",
    body: { displayName, avatar, avatarCategory },
  });
}

export async function startLiveSession(sessionId: string) {
  return api(`/live-sessions/${sessionId}/start`, { method: "POST" });
}

export async function nextLiveQuestion(sessionId: string) {
  return api(`/live-sessions/${sessionId}/next`, { method: "POST" });
}

export async function finishLiveSession(sessionId: string) {
  return api<{ success: boolean; data: { finalLeaderboard: LeaderboardEntry[] } }>(
    `/live-sessions/${sessionId}/finish`,
    { method: "POST" }
  );
}

export async function getLivePlayerView(sessionId: string) {
  return api<{ success: boolean; data: import("./types").LivePlayerSessionView }>(
    `/live-sessions/${sessionId}/player-view`
  );
}

export async function submitLiveAnswerRest(
  sessionId: string,
  questionId: string,
  answer: unknown
) {
  return api<{ success: boolean; data: import("./types").LiveAnswerResult }>(
    `/live-sessions/${sessionId}/answer`,
    { method: "POST", body: { questionId, answer } }
  );
}

export async function getLiveAnalytics(sessionId: string) {
  return api<{ success: boolean; data: unknown }>(`/live-sessions/${sessionId}/analytics`);
}

export async function getLiveSessionReplayData(sessionId: string) {
  return api<{ success: boolean; data: any }>(`/live-sessions/${sessionId}/replay-data`);
}

export async function getLiveSessionStudents(sessionId: string) {
  return api<{ success: boolean; data: { students: any[]; summary: any } }>(
    `/live-sessions/${sessionId}/students`
  );
}

export async function getParticipantAttemptReview(sessionId: string, participantId: string) {
  return api<{ success: boolean; data: any }>(
    `/live-sessions/${sessionId}/participants/${participantId}/review`
  );
}

export async function getQuestionResponses(sessionId: string, questionId: string) {
  return api<{ success: boolean; data: any }>(
    `/live-sessions/${sessionId}/questions/${questionId}/responses`
  );
}

export async function listMyLiveSessions(filters?: { status?: string }) {
  return listQuizRooms(filters);
}

export async function listLiveSessionHistory() {
  return api<{ success: boolean; data: unknown[] }>("/live-sessions/history");
}

export function getQuizRoomJoinUrl(sessionId: string) {
  return `${window.location.origin}/live/play/${sessionId}`;
}

/** @deprecated use getQuizRoomJoinUrl */
export function getLiveSessionJoinUrl(sessionId: string) {
  return getQuizRoomJoinUrl(sessionId);
}

export function getLiveSessionWsUrl(sessionId: string, mode: "play" | "host" = "host") {
  const token = sessionStorage.getItem("lms_token") || localStorage.getItem("lms_token");
  const { protocol, host } = getWsConnectTarget();
  const modeParam = mode === "play" ? "&mode=play" : "";
  return `${protocol}://${host}/live-sessions/ws/${sessionId}?token=${encodeURIComponent(token || "")}${modeParam}`;
}

export interface LiveQuizValidationError {
  rule: string;
  questionId: string;
  field: string;
  expected: string;
  actual: string;
  message: string;
  severity: "error" | "warning";
  autoFixable: boolean;
  autoFixAction?: string;
}

export interface LiveQuizValidationResult {
  ready: boolean;
  errors: LiveQuizValidationError[];
  warnings: LiveQuizValidationError[];
}

export async function getSessionValidation(sessionId: string) {
  return api<{ success: boolean; data: LiveQuizValidationResult }>(
    `/live-sessions/${sessionId}/validate-quiz`
  );
}

export async function postAutoFixQuiz(sessionId: string) {
  return api<{ success: boolean; data: { fixed: number; actions: string[] } }>(
    `/live-sessions/${sessionId}/auto-fix-quiz`,
    { method: "POST" }
  );
}

