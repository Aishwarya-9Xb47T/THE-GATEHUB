/**
 * Rules engine types (Section 25).
 * Business rules are data-driven; evaluated by RulesEngineListener on domain events.
 */

import type { DomainEventType } from "./events.js";

export type RuleActionType =
  | "award_badge"
  | "grant_xp"
  | "grant_coins"
  | "unlock_course"
  | "unlock_lecture"
  | "mark_passed"
  | "tag_placement_ready"
  | "multiply_xp"
  | "send_notification"
  | "void_attempt";

export interface RuleAction {
  type: RuleActionType;
  params: Record<string, unknown>;
}

export type RuleConditionOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "contains"
  | "exists"
  | "and"
  | "or"
  | "not";

export interface RuleCondition {
  field?: string;
  operator: RuleConditionOperator;
  value?: unknown;
  conditions?: RuleCondition[];
}

export interface Rule {
  id: string;
  slug: string;
  organizationId?: string | null;
  name: string;
  description?: string;
  trigger: DomainEventType;
  condition: RuleCondition;
  actions: RuleAction[];
  priority: number;
  enabled: boolean;
  validFrom?: string | null;
  validTo?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RuleEvaluationContext {
  event: { type: DomainEventType; payload: unknown };
  organizationId?: string | null;
  userId?: string | null;
  priorAwards?: string[];
}

export interface RuleEvaluationResult {
  ruleId: string;
  ruleSlug: string;
  matched: boolean;
  actionsExecuted: RuleAction[];
}
