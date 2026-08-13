import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PlayerNavigation({
  canPrev,
  canNext,
  onPrev,
  onNext,
  onSubmit,
  showSubmit,
}: {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSubmit?: () => void;
  showSubmit?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label="Previous question"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </Button>
      <div className="flex gap-2">
        {showSubmit && onSubmit && (
          <Button type="button" size="sm" onClick={onSubmit}>
            Submit
          </Button>
        )}
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Next question"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
