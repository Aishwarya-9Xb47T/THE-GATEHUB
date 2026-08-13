import { useEffect } from "react";
import { BookOpen, Sparkles } from "lucide-react";
import { MarkdownContent } from "@/components/learning/MarkdownContent";
import type { ExperienceRendererProps } from "./ExperienceRenderer";

export function HeroSection({ step, onProgress }: ExperienceRendererProps) {
  const title = String(step.payload.title ?? step.title);
  const moduleTitle = step.payload.moduleTitle ? String(step.payload.moduleTitle) : "";
  const trackTitle = step.payload.trackTitle ? String(step.payload.trackTitle) : "";
  const subtitle = step.payload.subtitle ? String(step.payload.subtitle) : "";

  useEffect(() => {
    onProgress(step.id, "view");
  }, [step.id, onProgress]);

  return (
    <section className="surface-primary relative w-full max-w-full box-border overflow-hidden rounded-2xl bg-gradient-to-br from-primary/90 via-primary to-primary/80 p-6 md:p-8 shadow-xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_50%)]" />
      <div className="relative z-10 w-full">
        <div className="type-section-label flex items-center gap-2 mb-3 text-primary-foreground">
          <Sparkles className="w-4 h-4" />
          {trackTitle && moduleTitle ? `${trackTitle} · ${moduleTitle}` : "Learning Experience"}
        </div>
        <h1 className="type-display-lg mb-3 text-primary-foreground">{title}</h1>
        {subtitle && (
          <div className="text-body-lg max-w-3xl text-primary-foreground">
            <MarkdownContent variant="onPrimary">{subtitle}</MarkdownContent>
          </div>
        )}
        <div className="mt-6 flex items-center gap-2 type-body-sm text-primary-foreground">
          <BookOpen className="w-4 h-4" />
          Use the lesson navigator to begin
        </div>
      </div>
    </section>
  );
}
