import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearInstructorPreviewReturn, readInstructorPreviewReturn } from "@/lib/instructorPreview";

export function InstructorPreviewBanner() {
  const navigate = useNavigate();
  const location = useLocation();

  const exitPreview = () => {
    const target = readInstructorPreviewReturn(location.state, location.search, "/instructor");
    clearInstructorPreviewReturn();
    navigate(target);
  };

  return (
    <div
      className="instructor-preview-banner surface-accent-amber shrink-0 z-30 flex flex-wrap items-center justify-center gap-3 border-b border-amber-500/30 bg-amber-500/15 px-4 py-2.5 text-center text-sm"
      role="status"
    >
      <p className="font-medium">
        Instructor Preview — This is exactly how students will experience this course.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 border-amber-500/40 bg-background/80 text-foreground hover:bg-amber-500/10 gap-1.5"
        onClick={exitPreview}
      >
        <X className="w-3.5 h-3.5" />
        Exit Preview
      </Button>
    </div>
  );
}
