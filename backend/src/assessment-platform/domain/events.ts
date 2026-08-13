/**
 * Domain events for event-driven architecture (Section 21).
 */

import type { EngagementMetrics, LearningMetrics } from "./types.js";

export const DOMAIN_EVENT_TYPES = [
  "AssessmentCreated",
  "AssessmentPublished",
  "AssessmentArchived",
  "DeploymentCreated",
  "DeploymentLaunched",
  "HomeworkAssigned",
  "AttemptStarted",
  "QuestionAnswered",
  "AttemptCompleted",
  "AttemptVoided",
  "BadgeAwarded",
  "XPGranted",
  "LeaderboardUpdated",
  "StudentJoinedRoom",
  "StudentLeftRoom",
  "LiveSessionEnded",
  "MediaAssetUploaded",
  "AIContentGenerated",
  "RuleTriggered",
  "AuditActionRecorded",
  "QuestionCreated",
  "QuestionUpdated",
  "QuestionVersionCreated",
  "QuestionPublished",
  "QuestionArchived",
  "QuestionImported",
  "QuestionTagged",
  "MediaAttached",
  "HintGenerated",
  "AIExplanationGenerated",
] as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

export interface DomainEventMetadata {
  correlationId: string;
  causationId?: string;
  timestamp: string;
  organizationId?: string | null;
  actorId?: string | null;
}

export interface DomainEvent<TPayload = unknown> {
  id: string;
  type: DomainEventType;
  aggregateType: string;
  aggregateId: string;
  payload: TPayload;
  metadata: DomainEventMetadata;
  version: 1;
}

// ─── Typed payloads ────────────────────────────────────────────────────────────

export interface AssessmentCreatedPayload {
  assessmentId: string;
  authorId: string;
  kind: string;
  title: string;
}

export interface AssessmentPublishedPayload {
  assessmentId: string;
  versionId: string;
  version: number;
}

export interface AttemptStartedPayload {
  attemptId: string;
  deploymentId: string;
  assessmentVersionId: string;
  userId: string;
  mode: string;
}

export interface QuestionAnsweredPayload {
  attemptId: string;
  questionVersionId: string;
  userId: string;
  learningDelta: Partial<LearningMetrics>;
}

export interface AttemptCompletedPayload {
  attemptId: string;
  userId: string;
  deploymentId: string;
  learning: LearningMetrics;
  engagement: EngagementMetrics | null;
}

export interface BadgeAwardedPayload {
  userId: string;
  badgeId: string;
  badgeSlug: string;
  source: string;
  sourceId?: string;
}

export interface XPGrantedPayload {
  userId: string;
  amount: number;
  source: string;
  sourceId?: string;
  reason: string;
}

export interface LeaderboardUpdatedPayload {
  scopeType: string;
  scopeId?: string;
  period: string;
  rankingsCount: number;
}

export interface HomeworkAssignedPayload {
  deploymentId: string;
  dueAt: string;
  studentIds?: string[];
}

export interface StudentJoinedRoomPayload {
  roomId: string;
  participantId: string;
  userId?: string | null;
  displayName: string;
}

export interface StudentLeftRoomPayload {
  roomId: string;
  participantId: string;
  reason: "disconnect" | "kick" | "finish";
}

export interface LiveSessionEndedPayload {
  roomId: string;
  deploymentId: string;
  participantCount: number;
}

export interface QuestionCreatedPayload {
  questionId: string;
  authorId: string;
  typeSlug: string;
}

export interface QuestionVersionCreatedPayload {
  questionId: string;
  versionId: string;
  version: number;
}

export interface QuestionImportedPayload {
  questionId: string;
  source: string;
  batchId?: string;
}

export interface MediaAttachedPayload {
  questionId: string;
  assetId: string;
  role: string;
}

export type DomainEventPayloadMap = {
  AssessmentCreated: AssessmentCreatedPayload;
  AssessmentPublished: AssessmentPublishedPayload;
  AttemptStarted: AttemptStartedPayload;
  QuestionAnswered: QuestionAnsweredPayload;
  AttemptCompleted: AttemptCompletedPayload;
  BadgeAwarded: BadgeAwardedPayload;
  XPGranted: XPGrantedPayload;
  LeaderboardUpdated: LeaderboardUpdatedPayload;
  HomeworkAssigned: HomeworkAssignedPayload;
  StudentJoinedRoom: StudentJoinedRoomPayload;
  StudentLeftRoom: StudentLeftRoomPayload;
  LiveSessionEnded: LiveSessionEndedPayload;
  QuestionCreated: QuestionCreatedPayload;
  QuestionVersionCreated: QuestionVersionCreatedPayload;
  QuestionImported: QuestionImportedPayload;
  MediaAttached: MediaAttachedPayload;
};

export function createDomainEvent<T extends DomainEventType>(
  type: T,
  aggregateType: string,
  aggregateId: string,
  payload: T extends keyof DomainEventPayloadMap ? DomainEventPayloadMap[T] : unknown,
  metadata: Partial<DomainEventMetadata> & { correlationId: string }
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type,
    aggregateType,
    aggregateId,
    payload,
    metadata: {
      timestamp: new Date().toISOString(),
      organizationId: metadata.organizationId ?? null,
      actorId: metadata.actorId ?? null,
      causationId: metadata.causationId,
      correlationId: metadata.correlationId,
    },
    version: 1,
  };
}
