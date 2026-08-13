/**
 * Universal Renderer Framework contracts (Module 05).
 * Player resolves renderers via registry — no switch statements.
 */

import type { ComponentType, ReactNode } from "react";
import type {
  AssessmentMode,
  DeploymentSettings,
  LearningResponseResult,
  SanitizedQuestionSnapshot,
} from "./index";
import type { StandardRendererResponse } from "./response";
import type { ThemeEngine } from "../services/themeEngine";
import type { AnimationService } from "../services/animationService";
import type { AudioService } from "../services/audioService";
import type { PlayerEventBus } from "../services/playerEventBus";

export type RendererLifecyclePhase =
  | "load"
  | "initialize"
  | "render"
  | "interact"
  | "validate"
  | "collect"
  | "submit"
  | "feedback"
  | "review"
  | "dispose";

export interface RendererAccessibilityContract {
  keyboardNavigable: boolean;
  screenReaderLabels: boolean;
  supportsHighContrast: boolean;
  supportsFontScaling: boolean;
  ariaRole?: string;
  getAriaLabel?: (question: SanitizedQuestionSnapshot) => string;
}

export interface AccessibilityState {
  reducedMotion: boolean;
  highContrast: boolean;
  fontScale: number;
  screenReaderActive: boolean;
}

export interface TimerHandle {
  remainingMs: number;
  isRunning: boolean;
  onExpire?: () => void;
}

export interface MediaResolver {
  resolveUrl(assetId: string): string | undefined;
}

export interface LocalizationService {
  t: (key: string, params?: Record<string, string | number>) => string;
}

export interface RendererContext {
  theme: ThemeEngine;
  animation: AnimationService;
  audio: AudioService;
  eventBus: PlayerEventBus;
  localization: LocalizationService;
  accessibility: AccessibilityState;
  media: MediaResolver;
  mode: AssessmentMode;
  settings: DeploymentSettings;
  timer: TimerHandle | null;
  ai?: {
    requestHint?: (questionVersionId: string) => Promise<string | null>;
    requestExplanation?: (questionVersionId: string) => Promise<string | null>;
  };
}

export interface QuestionRendererProps {
  question: SanitizedQuestionSnapshot;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  reviewMode?: boolean;
  showResult?: LearningResponseResult | null;
  ariaLabel?: string;
  onFocusRequest?: (elementId: string) => void;
}

export type QuestionRendererComponent = ComponentType<QuestionRendererProps>;

export interface QuestionRendererPlugin {
  id: string;
  typeSlug: string;
  version: string;
  label: string;
  supportsOffline: boolean;
  accessibility: RendererAccessibilityContract;
  Component: QuestionRendererComponent;

  initialize(ctx: RendererContext, question: SanitizedQuestionSnapshot): void | Promise<void>;
  validateInput(value: unknown, question: SanitizedQuestionSnapshot): string[];
  collectResponse(
    value: unknown,
    question: SanitizedQuestionSnapshot,
    responseTimeMs: number
  ): StandardRendererResponse;
  submit?(response: StandardRendererResponse): Promise<void>;
  showFeedback?(result: LearningResponseResult, question: SanitizedQuestionSnapshot): void;
  review?(
    value: unknown,
    result: LearningResponseResult | null,
    question: SanitizedQuestionSnapshot
  ): ReactNode;
  analyticsView?(response: StandardRendererResponse): Record<string, unknown>;
  dispose(): void;
}

export type LazyRendererLoader = () => Promise<{ default: QuestionRendererPlugin }>;

export const RENDERER_PERFORMANCE_TARGETS = {
  initialRenderMs: 100,
  questionTransitionMs: 50,
  rendererLoadMs: 200,
} as const;
