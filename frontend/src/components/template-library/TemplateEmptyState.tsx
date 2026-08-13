import { LayoutTemplate, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TemplateEmptyStateProps {
  filtered?: boolean;
  onCreate: () => void;
  onImport: () => void;
  onExploreOfficial: () => void;
  onGenerateAi: () => void;
}

export function TemplateEmptyState({ filtered, onCreate, onImport, onExploreOfficial, onGenerateAi }: TemplateEmptyStateProps) {
  return (
    <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-16 text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/15">
        <LayoutTemplate className="h-10 w-10 text-primary" />
      </div>
      <h3 className="text-xl font-semibold text-white">
        {filtered ? "No templates match your filters" : "Build your template collection"}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
        {filtered
          ? "Try clearing filters or explore official templates curated by THE GATEHUB."
          : "Save quizzes as reusable templates, explore 100+ official layouts, or generate a new assessment with AI."}
      </p>
      <div className="mx-auto mt-8 flex max-w-lg flex-wrap justify-center gap-3">
        <Button type="button" onClick={onExploreOfficial}>
          <LayoutTemplate className="mr-2 h-4 w-4" />
          Explore Official Templates
        </Button>
        <Button type="button" variant="outline" className="border-white/15 bg-white/5" onClick={onCreate}>
          Create Template
        </Button>
        <Button type="button" variant="outline" className="border-white/15 bg-white/5" onClick={onImport}>
          <Upload className="mr-2 h-4 w-4" />
          Import
        </Button>
        <Button type="button" variant="outline" className="border-white/15 bg-white/5" onClick={onGenerateAi}>
          <Sparkles className="mr-2 h-4 w-4" />
          Generate with AI
        </Button>
      </div>
    </div>
  );
}
