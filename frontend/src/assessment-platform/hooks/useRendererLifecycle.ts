import { useEffect, useRef, useState } from "react";
import type { QuestionRendererPlugin, RendererContext, RendererLifecyclePhase } from "../types/renderer";
import type { LearningResponseResult, SanitizedQuestionSnapshot } from "../types";
import type { StandardRendererResponse } from "../types/response";
import { getRenderer, loadRenderer } from "../registry/rendererRegistry";
import { getFallbackRenderer } from "../renderers/registerRenderers";
import { createPerformanceMonitor } from "../services/performanceMonitor";

export interface RendererLifecycleState {
  phase: RendererLifecyclePhase;
  plugin: QuestionRendererPlugin | null;
  errors: string[];
  response: StandardRendererResponse | null;
  loading: boolean;
}

export function useRendererLifecycle(
  question: SanitizedQuestionSnapshot | null,
  ctx: RendererContext,
  value: unknown,
  responseTimeMs: number
) {
  const [state, setState] = useState<RendererLifecycleState>({
    phase: "load",
    plugin: null,
    errors: [],
    response: null,
    loading: true,
  });
  const perf = useRef(createPerformanceMonitor());
  const pluginRef = useRef<QuestionRendererPlugin | null>(null);

  useEffect(() => {
    if (!question) return;
    let cancelled = false;

    async function load() {
      if (!question) return;
      perf.current.mark("load_start");
      setState((s) => ({ ...s, phase: "load", loading: true }));

      let plugin = getRenderer(question.typeSlug);
      if (!plugin) {
        plugin = (await loadRenderer(question.typeSlug)) ?? getFallbackRenderer();
      }
      if (cancelled) return;

      pluginRef.current = plugin;
      perf.current.measure("renderer_load", "load_start");

      setState((s) => ({ ...s, plugin, phase: "initialize", loading: false }));
      await plugin.initialize(ctx, question);
      if (cancelled) return;

      setState((s) => ({ ...s, phase: "render" }));
      perf.current.mark("render_start");
    }

    void load();

    return () => {
      cancelled = true;
      pluginRef.current?.dispose();
      pluginRef.current = null;
    };
  }, [question?.questionVersionId, question?.typeSlug]);

  useEffect(() => {
    if (!pluginRef.current || !question) return;
    perf.current.measure("initial_render", "render_start");
    setState((s) => ({ ...s, phase: "interact" }));
  }, [state.plugin, question?.questionVersionId]);

  const validate = (): string[] => {
    if (!pluginRef.current || !question) return ["Renderer not ready"];
    setState((s) => ({ ...s, phase: "validate" }));
    const errors = pluginRef.current.validateInput(value, question);
    setState((s) => ({ ...s, errors, phase: errors.length ? "interact" : "collect" }));
    return errors;
  };

  const collect = (): StandardRendererResponse | null => {
    if (!pluginRef.current || !question) return null;
    const errors = pluginRef.current.validateInput(value, question);
    if (errors.length) {
      setState((s) => ({ ...s, errors, phase: "interact" }));
      return null;
    }
    const response = pluginRef.current.collectResponse(value, question, responseTimeMs);
    setState((s) => ({ ...s, response, phase: "collect", errors: [] }));
    ctx.eventBus.emit("response_collected", response);
    return response;
  };

  const submit = async (): Promise<StandardRendererResponse | null> => {
    const response = collect();
    if (!response || !pluginRef.current) return null;
    setState((s) => ({ ...s, phase: "submit" }));
    if (pluginRef.current.submit) await pluginRef.current.submit(response);
    ctx.eventBus.emit("response_submitted", response);
    return response;
  };

  const showFeedback = (result: LearningResponseResult) => {
    if (!pluginRef.current || !question) return;
    pluginRef.current.showFeedback?.(result, question);
    setState((s) => ({ ...s, phase: "feedback" }));
  };

  const enterReview = () => {
    setState((s) => ({ ...s, phase: "review" }));
  };

  const getMetrics = () => perf.current.getSummary();

  return {
    ...state,
    validate,
    collect,
    submit,
    showFeedback,
    enterReview,
    getMetrics,
  };
}
