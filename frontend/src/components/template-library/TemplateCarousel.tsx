import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { QuizTemplateSummary } from "@/lib/templateLibrary/types";
import { TemplateCard } from "./TemplateCard";
import { Button } from "@/components/ui/button";

interface TemplateCarouselProps {
  title: string;
  subtitle?: string;
  templates: QuizTemplateSummary[];
  onPreview: (t: QuizTemplateSummary) => void;
  onUse: (t: QuizTemplateSummary) => void;
  onFavorite: (t: QuizTemplateSummary) => void;
  onDuplicate?: (t: QuizTemplateSummary) => void;
}

export function TemplateCarousel({ title, subtitle, templates, onPreview, onUse, onFavorite, onDuplicate }: TemplateCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!templates.length) return null;

  const scroll = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {subtitle && <p className="text-sm text-white/50">{subtitle}</p>}
        </div>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-white/70" onClick={() => scroll(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-white/70" onClick={() => scroll(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/20"
      >
        {templates.map((t) => (
          <div key={t.id} className="w-[280px] shrink-0">
            <TemplateCard
              template={t}
              compact
              onPreview={() => onPreview(t)}
              onUse={() => onUse(t)}
              onFavorite={() => onFavorite(t)}
              onDuplicate={onDuplicate ? () => onDuplicate(t) : () => onUse(t)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
