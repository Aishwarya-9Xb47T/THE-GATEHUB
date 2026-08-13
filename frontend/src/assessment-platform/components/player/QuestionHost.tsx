import { memo, useEffect, useRef, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { useRendererLifecycle } from "../../hooks/useRendererLifecycle";
import { RendererContextProvider } from "../../context/RendererContext";
import type { RendererContext } from "../../types/renderer";
import type { LearningResponseResult, SanitizedQuestionSnapshot } from "../../types";
import { getFallbackRenderer } from "../../renderers/registerRenderers";

export interface QuestionHostProps {
  question: SanitizedQuestionSnapshot;
  value: unknown;
  onChange: (value: unknown) => void;
  ctx: RendererContext;
  disabled?: boolean;
  reviewMode?: boolean;
  showResult?: LearningResponseResult | null;
  onResponseReady?: (collect: () => ReturnType<ReturnType<typeof useRendererLifecycle>["collect"]>) => void;
}

export const QuestionHost = memo(function QuestionHost({
  question,
  value,
  onChange,
  ctx,
  disabled,
  reviewMode,
  showResult,
  onResponseReady,
}: QuestionHostProps) {
  const startedAt = useRef(performance.now());
  const responseTimeMs = Math.round(performance.now() - startedAt.current);

  const lifecycle = useRendererLifecycle(question, ctx, value, responseTimeMs);
  const plugin = lifecycle.plugin ?? getFallbackRenderer();
  const Component = plugin.Component;

  useEffect(() => {
    onResponseReady?.(lifecycle.collect);
  }, [lifecycle.collect, onResponseReady]);

  useEffect(() => {
    ctx.theme.applyToElement(document.documentElement);
  }, [ctx.theme]);

  return (
    <RendererContextProvider value={ctx}>
      <div
        className={`question-host ${ctx.theme.classNames()}`}
        data-renderer={plugin.id}
        data-phase={lifecycle.phase}
        aria-busy={lifecycle.loading}
      >
        {lifecycle.loading ? (
          <div className="flex items-center justify-center py-12" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
            <span className="sr-only">Loading question renderer</span>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            }
          >
            <Component
              question={question}
              value={value}
              onChange={onChange}
              disabled={disabled}
              reviewMode={reviewMode}
              showResult={showResult}
              ariaLabel={plugin.accessibility.getAriaLabel?.(question)}
            />
          </Suspense>
        )}
        {lifecycle.errors.length > 0 && (
          <ul className="mt-3 text-sm text-destructive" role="alert">
            {lifecycle.errors.map((e: string) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </RendererContextProvider>
  );
});
