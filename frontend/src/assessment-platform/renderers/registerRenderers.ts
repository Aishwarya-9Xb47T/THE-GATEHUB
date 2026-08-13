import { createRendererPlugin } from "./createRendererPlugin";
import { ChoiceListRenderer } from "./ChoiceListRenderer";
import { MultiSelectRenderer } from "./MultiSelectRenderer";
import { EssayRendererComponent } from "./EssayRenderer";
import { InteractiveQuestionRenderer } from "./InteractiveQuestionRenderer";
import { FallbackRendererComponent } from "./FallbackRenderer";
import { registerRenderer, registerLazyRenderer } from "../registry/rendererRegistry";
import type { SanitizedQuestionSnapshot } from "../types";
import { createRendererResponse } from "../types/response";

const multipleChoice = createRendererPlugin({
  id: "mcq-renderer",
  typeSlug: "multiple_choice",
  label: "Multiple Choice",
  Component: ChoiceListRenderer,
  validateInput(value) {
    if (typeof value !== "string" || !value) return ["Select an option"];
    return [];
  },
});

const multiSelect = createRendererPlugin({
  id: "multi-select-renderer",
  typeSlug: "multiple_select",
  label: "Multiple Select",
  Component: MultiSelectRenderer,
  validateInput(value) {
    if (!Array.isArray(value) || value.length === 0) return ["Select at least one option"];
    return [];
  },
  collectResponse(value, question, responseTimeMs) {
    return createRendererResponse(
      question.questionVersionId,
      "multi-select-renderer",
      value,
      responseTimeMs,
      { metadata: { multi: true } }
    );
  },
});

const trueFalse = createRendererPlugin({
  id: "true-false-renderer",
  typeSlug: "true_false",
  label: "True / False",
  Component: ChoiceListRenderer,
});

const poll = createRendererPlugin({
  id: "poll-renderer",
  typeSlug: "poll",
  label: "Poll",
  Component: ChoiceListRenderer,
  validateInput() {
    return [];
  },
});

const essay = createRendererPlugin({
  id: "essay-renderer",
  typeSlug: "essay",
  label: "Essay",
  Component: EssayRendererComponent,
  validateInput(value) {
    if (typeof value !== "string" || !value.trim()) return ["Enter a response"];
    return [];
  },
  collectResponse(value, question, responseTimeMs) {
    return createRendererResponse(
      question.questionVersionId,
      "essay-renderer",
      value,
      responseTimeMs,
      { metadata: { wordCount: String(value).trim().split(/\s+/).length } }
    );
  },
});

const fallback = createRendererPlugin({
  id: "fallback-renderer",
  typeSlug: "_fallback",
  label: "Fallback",
  Component: FallbackRendererComponent,
  supportsOffline: false,
});

const SYNC_RENDERERS = [multipleChoice, multiSelect, trueFalse, poll, essay, fallback];

export function registerBuiltinRenderers(): void {
  for (const plugin of SYNC_RENDERERS) {
    registerRenderer(plugin);
  }

  registerLazyRenderer("coding", async () => ({
    default: createRendererPlugin({
      id: "coding-renderer",
      typeSlug: "coding",
      label: "Coding",
      Component: FallbackRendererComponent,
      supportsOffline: false,
    }),
  }));

  registerLazyRenderer("fill_blank", async () => ({
    default: createRendererPlugin({
      id: "fill-blank-renderer",
      typeSlug: "fill_blank",
      label: "Fill in the Blank",
      Component: InteractiveQuestionRenderer,
      validateInput(value) {
        if (typeof value !== "string" || !value.trim()) return ["Enter an answer"];
        return [];
      },
    }),
  }));

  registerLazyRenderer("matching", async () => ({
    default: createRendererPlugin({
      id: "matching-renderer",
      typeSlug: "matching",
      label: "Matching",
      Component: InteractiveQuestionRenderer,
      validateInput(value, question) {
        const pairCount = Math.floor(question.choices.length / 2);
        if (!value || typeof value !== "object" || Array.isArray(value)) return ["Complete all matches"];
        const map = value as Record<string, string>;
        const filled = Object.values(map).filter(Boolean).length;
        if (filled < pairCount) return ["Complete all matches"];
        return [];
      },
    }),
  }));

  registerLazyRenderer("ordering", async () => ({
    default: createRendererPlugin({
      id: "ordering-renderer",
      typeSlug: "ordering",
      label: "Ordering",
      Component: InteractiveQuestionRenderer,
      validateInput(value, question) {
        if (!Array.isArray(value) || value.length !== question.choices.length) return ["Arrange all items"];
        return [];
      },
    }),
  }));

  registerLazyRenderer("sequence", async () => ({
    default: createRendererPlugin({
      id: "sequence-renderer",
      typeSlug: "sequence",
      label: "Sequence",
      Component: InteractiveQuestionRenderer,
      validateInput(value, question) {
        if (!Array.isArray(value) || value.length !== question.choices.length) return ["Arrange all items"];
        return [];
      },
    }),
  }));

  registerLazyRenderer("hotspot", async () => ({
    default: createRendererPlugin({
      id: "hotspot-renderer",
      typeSlug: "hotspot",
      label: "Hotspot",
      Component: InteractiveQuestionRenderer,
      validateInput(value) {
        if (typeof value !== "string" || !value.trim()) return ["Select a hotspot"];
        return [];
      },
    }),
  }));

  registerLazyRenderer("matrix", async () => ({
    default: createRendererPlugin({
      id: "matrix-renderer",
      typeSlug: "matrix",
      label: "Matrix",
      Component: InteractiveQuestionRenderer,
      validateInput(value, question) {
        const pairCount = Math.floor(question.choices.length / 2);
        if (!value || typeof value !== "object" || Array.isArray(value)) return ["Complete all rows"];
        const map = value as Record<string, string>;
        const filled = Object.values(map).filter(Boolean).length;
        if (filled < pairCount) return ["Complete all rows"];
        return [];
      },
    }),
  }));

  registerLazyRenderer("short_answer", async () => ({
    default: createRendererPlugin({
      id: "short-answer-renderer",
      typeSlug: "short_answer",
      label: "Short Answer",
      Component: InteractiveQuestionRenderer,
      validateInput(value) {
        if (typeof value !== "string" || !value.trim()) return ["Enter an answer"];
        return [];
      },
    }),
  }));
}

export function getFallbackRenderer() {
  return fallback;
}

export function validateChoiceInput(
  value: unknown,
  question: SanitizedQuestionSnapshot,
  multi = false
): string[] {
  if (multi) {
    if (!Array.isArray(value) || value.length === 0) return ["Select at least one option"];
  } else if (typeof value !== "string" || !value) {
    return ["Select an option"];
  }
  const validIds = new Set(question.choices.map((c) => c.id));
  const ids = multi ? (value as string[]) : [value as string];
  if (ids.some((id) => !validIds.has(id))) return ["Invalid option selected"];
  return [];
}
