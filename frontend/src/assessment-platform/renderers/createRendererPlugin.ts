/**
 * Factory for consistent renderer plugins with sensible defaults.
 */

import type {
  QuestionRendererPlugin,
  QuestionRendererComponent,
  RendererAccessibilityContract,
  RendererContext,
} from "../types/renderer";
import type { LearningResponseResult, SanitizedQuestionSnapshot } from "../types";
import { createRendererResponse } from "../types/response";

export function createRendererPlugin(config: {
  id: string;
  typeSlug: string;
  label: string;
  version?: string;
  Component: QuestionRendererComponent;
  supportsOffline?: boolean;
  accessibility?: Partial<RendererAccessibilityContract>;
  validateInput?: (value: unknown, question: SanitizedQuestionSnapshot) => string[];
  collectResponse?: (
    value: unknown,
    question: SanitizedQuestionSnapshot,
    responseTimeMs: number
  ) => ReturnType<typeof createRendererResponse>;
  onInitialize?: (ctx: RendererContext, question: SanitizedQuestionSnapshot) => void;
  onFeedback?: (result: LearningResponseResult) => void;
}): QuestionRendererPlugin {
  const accessibility: RendererAccessibilityContract = {
    keyboardNavigable: true,
    screenReaderLabels: true,
    supportsHighContrast: true,
    supportsFontScaling: true,
    ariaRole: "group",
    getAriaLabel: (q) => q.stem.slice(0, 120),
    ...config.accessibility,
  };

  let ctxRef: RendererContext | null = null;

  return {
    id: config.id,
    typeSlug: config.typeSlug,
    version: config.version ?? "1.0.0",
    label: config.label,
    supportsOffline: config.supportsOffline ?? true,
    accessibility,
    Component: config.Component,

    initialize(ctx, question) {
      ctxRef = ctx;
      config.onInitialize?.(ctx, question);
    },

    validateInput(value, question) {
      if (config.validateInput) return config.validateInput(value, question);
      if (value === undefined || value === null || value === "") {
        return ["Response required"];
      }
      return [];
    },

    collectResponse(value, question, responseTimeMs) {
      if (config.collectResponse) {
        return config.collectResponse(value, question, responseTimeMs);
      }
      return createRendererResponse(question.questionVersionId, config.id, value, responseTimeMs);
    },

    showFeedback(result) {
      if (!ctxRef) return;
      if (result.isCorrect === true) {
        ctxRef.animation.emit("correct");
        ctxRef.audio.play("correct");
      } else if (result.isCorrect === false) {
        ctxRef.animation.emit("incorrect");
        ctxRef.audio.play("wrong");
      }
      config.onFeedback?.(result);
    },

    analyticsView(response) {
      return {
        rendererId: config.id,
        typeSlug: config.typeSlug,
        responseTimeMs: response.responseTimeMs,
        hasAnswer: response.answer !== undefined && response.answer !== null,
      };
    },

    dispose() {
      ctxRef = null;
    },
  };
}
